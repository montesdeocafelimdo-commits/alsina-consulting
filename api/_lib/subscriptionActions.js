import crypto from 'crypto';
import { sendEmail, templates } from './email.js';

// ALSINA — lógica de cancelación compartida (AD-12). Extraída para que
// api/subscriptions/cancel.js y api/subscriptions/downgrade.js (cuando
// el destino es Concejal — AD-11 lo lista como downgrade, pero es el
// mismo mecanismo que una cancelación: sin cobro nuevo, efectivo en
// paid_through, revertible) no diverjan con el tiempo.
export async function cancelAtPeriodEnd(supa, subscription, account) {
  if (subscription.provider === 'mercadopago' && subscription.provider_subscription_id && process.env.MP_ACCESS_TOKEN) {
    try {
      const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      await new PreApproval(client).update({ id: subscription.provider_subscription_id, body: { status: 'paused' } });
    } catch (mpErr) {
      console.error('cancelAtPeriodEnd: no se pudo pausar en Mercado Pago:', mpErr?.message || mpErr);
      await supa.from('audit_logs').insert({
        actor_role: 'system', action: 'mp_pause_failed_on_cancel',
        target_table: 'subscriptions', target_id: subscription.id,
        after: { error: String(mpErr?.message || mpErr).slice(0, 300) },
      });
    }
  }

  const cancellationCode = crypto.randomBytes(6).toString('hex');
  const { error: updateError } = await supa
    .from('subscriptions')
    .update({
      status: 'cancel_at_period_end',
      cancel_requested_at: new Date().toISOString(),
      cancellation_code: cancellationCode,
      // Cualquier downgrade pago-a-pago pendiente queda sin efecto: si
      // se pidió cancelar del todo, no tiene sentido aplicar después un
      // downgrade a Intendente que ya no corresponde.
      pending_plan_id: null,
      pending_price_id: null,
      pending_downgrade_attempts: 0,
      pending_downgrade_last_error: null,
      pending_downgrade_failed_at: null,
    })
    .eq('id', subscription.id);
  if (updateError) throw new Error('error_interno');

  const { data: refreshed } = await supa.from('subscriptions').select('paid_through').eq('id', subscription.id).maybeSingle();

  await sendEmail({
    to: account.email,
    subject: 'Confirmamos tu cancelación',
    html: templates.cancellationConfirmed(refreshed?.paid_through ? new Date(refreshed.paid_through).toLocaleDateString('es-AR') : 'el fin de tu período pagado'),
    templateKey: 'cancellation_confirmed',
    accountId: account.accountId,
  });

  return { cancellationCode, paidThrough: refreshed?.paid_through || null };
}

// ALSINA — finalización idempotente de un downgrade pago-a-pago
// (Gobernador→Intendente) al llegar el aniversario. Corrección explícita
// pedida por Alsina: NO se toca Mercado Pago al pedir el downgrade — se
// guarda pendiente y se mantiene el plan/beneficios actuales hasta
// paid_through. Recién acá, en el aniversario:
//   1. consulta el estado real de la preapproval en Mercado Pago,
//   2. actualiza el importe,
//   3. verifica la respuesta,
//   4. cambia el plan local,
//   5. regenera entitlements,
//   6. audita.
// Si cualquier paso falla, el plan NO cambia — queda pending_plan_id
// intacto (el cron reintenta al día siguiente) y el error queda
// explícito en pending_downgrade_last_error/pending_downgrade_failed_at,
// nunca silencioso. Llamable desde el cron y desde tests.
export async function finalizePendingDowngrade(supa, subscription) {
  const { id, account_id: accountId, pending_plan_id: pendingPlanId, pending_price_id: pendingPriceId, provider, provider_subscription_id: providerSubscriptionId } = subscription;

  async function markFailed(stage, err) {
    const message = `${stage}: ${err?.message || err}`.slice(0, 500);
    await supa
      .from('subscriptions')
      .update({
        pending_downgrade_attempts: (subscription.pending_downgrade_attempts || 0) + 1,
        pending_downgrade_last_error: message,
        pending_downgrade_failed_at: new Date().toISOString(),
      })
      .eq('id', id);
    await supa.from('audit_logs').insert({
      actor_role: 'system', action: 'downgrade_finalize_failed',
      target_table: 'subscriptions', target_id: id,
      after: { stage, error: message, attempt: (subscription.pending_downgrade_attempts || 0) + 1 },
    });
    return { status: 'failed', stage, error: message };
  }

  let targetAmount = null;
  {
    const { data: price } = await supa.from('plan_prices').select('amount, currency').eq('id', pendingPriceId).maybeSingle();
    if (!price) return markFailed('resolve_target_price', new Error('pending_price_id sin fila en plan_prices'));
    targetAmount = Number(price.amount);
  }

  if (provider === 'mercadopago' && providerSubscriptionId) {
    if (!process.env.MP_ACCESS_TOKEN) return markFailed('mp_not_configured', new Error('MP_ACCESS_TOKEN ausente'));
    let MercadoPagoConfig, PreApproval;
    try {
      ({ MercadoPagoConfig, PreApproval } = await import('mercadopago'));
    } catch (err) {
      return markFailed('mp_sdk_import', err);
    }
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preapproval = new PreApproval(client);

    // 1. consultar el estado real antes de tocar nada.
    let current;
    try {
      current = await preapproval.get({ id: providerSubscriptionId });
    } catch (err) {
      return markFailed('mp_query_current_state', err);
    }
    if (!['authorized', 'paused'].includes(current?.status)) {
      return markFailed('mp_unexpected_status', new Error(`preapproval en estado ${current?.status}, no se puede actualizar el importe`));
    }

    // 2. actualizar el importe.
    try {
      await preapproval.update({ id: providerSubscriptionId, body: { auto_recurring: { transaction_amount: targetAmount } } });
    } catch (err) {
      return markFailed('mp_update_amount', err);
    }

    // 3. verificar la respuesta — re-consultar, nunca confiar ciegamente
    // en que el update() no haya tirado error.
    let verified;
    try {
      verified = await preapproval.get({ id: providerSubscriptionId });
    } catch (err) {
      return markFailed('mp_verify_update', err);
    }
    if (Number(verified?.auto_recurring?.transaction_amount) !== targetAmount) {
      return markFailed('mp_verify_mismatch', new Error(`MP quedó en ${verified?.auto_recurring?.transaction_amount}, esperado ${targetAmount}`));
    }
  }
  // Si no hay provider_subscription_id (dato defensivo/anómalo — un
  // Gobernador real siempre debería tener uno), no hay nada que verificar
  // contra MP: se aplica el cambio local directo, mismo criterio que
  // cancelAtPeriodEnd() para el caso sin proveedor.

  // 4-5. cambiar el plan local y regenerar entitlements — recién ahora,
  // con Mercado Pago ya confirmado (o sin proveedor que verificar).
  const { data: newPlan } = await supa.from('plans').select('name').eq('id', pendingPlanId).maybeSingle();
  const { error: updateError } = await supa
    .from('subscriptions')
    .update({
      plan_id: pendingPlanId,
      price_id: pendingPriceId,
      pending_plan_id: null,
      pending_price_id: null,
      pending_downgrade_attempts: 0,
      pending_downgrade_last_error: null,
      pending_downgrade_failed_at: null,
    })
    .eq('id', id);
  if (updateError) return markFailed('local_plan_update', updateError);

  await supa.rpc('recalculate_plan_entitlements', { p_account_id: accountId });

  // 6. auditar.
  await supa.from('audit_logs').insert({
    actor_role: 'system', action: 'downgrade_finalized',
    target_table: 'subscriptions', target_id: id,
    before: { plan_id: subscription.plan_id }, after: { plan_id: pendingPlanId, plan_name: newPlan?.name },
  });

  return { status: 'ok', newPlanName: newPlan?.name || null };
}
