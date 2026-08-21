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
