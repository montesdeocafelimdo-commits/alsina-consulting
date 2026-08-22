import { WebhookSignatureValidator } from 'mercadopago';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { getPriceById } from './_lib/plans.js';
import { sendEmail, templates } from './_lib/email.js';

// ALSINA — endpoint definitivo de notificaciones de Mercado Pago (AD-07).
// Ruta final de producción. Falla cerrado sin MP_WEBHOOK_SECRET (503).
// Idempotente vía payment_provider_events. Nunca confía en el payload
// crudo — siempre re-consulta el recurso real en la API de Mercado Pago
// antes de tocar subscriptions/payments. Nunca otorga acceso desde la URL
// de retorno del navegador — solo desde acá.

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

// BUG real del SDK oficial `mercadopago` (probado en producción, primer
// pago real: Mercado Pago rechazaba el 100% de las notificaciones con
// TimestampOutOfTolerance). El "ts" que manda Mercado Pago en
// x-signature viene en SEGUNDOS (formato estándar unix, 10 dígitos),
// pero WebhookSignatureValidator.validate() lo trata como si fueran
// milisegundos al calcular el drift contra toleranceSeconds — la
// comparación queda ~1000x desfasada y falla siempre, sin importar la
// demora real. Se resuelve NO pasándole toleranceSeconds a la librería
// (así solo valida la firma HMAC en sí, que no tiene este bug) y
// calculando la tolerancia acá mismo, con las unidades correctas.
const TOLERANCE_SECONDS = 300;

function parseTsSeconds(xSignature) {
  const match = /(?:^|,)\s*ts=(\d+)/.exec(xSignature || '');
  return match ? Number(match[1]) : null;
}

function verifySignature(req, secret) {
  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId: req.body?.data?.id || req.query?.['data.id'] || req.query?.id,
      secret,
      // Sin toleranceSeconds a propósito — ver nota arriba.
    });
  } catch (err) {
    console.error('[mercadopago-webhook] firma rechazada:', err?.reason || err?.message || 'unknown');
    return false;
  }

  const tsSeconds = parseTsSeconds(req.headers['x-signature']);
  if (tsSeconds !== null) {
    const driftSeconds = Math.abs(Date.now() / 1000 - tsSeconds);
    if (driftSeconds > TOLERANCE_SECONDS) {
      console.error('[mercadopago-webhook] firma rechazada: timestamp fuera de tolerancia (drift=' + Math.round(driftSeconds) + 's)');
      return false;
    }
  }
  return true;
}

// authorized -> active es el único mapeo no ambiguo; 'paused' de MP no
// distingue "el usuario lo pausó" de "falló un cobro" — se trata como
// past_due (best-effort) y se reconcilia con más detalle vía el evento
// 'payment' rechazado correspondiente, cuando llega.
function normalizeSubscriptionStatus(mpStatus) {
  switch (mpStatus) {
    case 'authorized': return 'active';
    case 'paused': return 'past_due';
    case 'cancelled': return 'canceled';
    case 'pending': return 'pending';
    default: return null;
  }
}

async function handleRejectedSubscriptionPayment(supa, dataId, payment, externalRef) {
  // AD-10: un pago rechazado de una renovación abre (o mantiene) la
  // gracia de 5 días. No reinicia la gracia si ya estaba abierta, ni
  // reenvía el primer aviso — grace_started_at es la única fuente de
  // verdad de "cuándo empezó" (idempotente ante reintentos/duplicados).
  const [, accountId] = externalRef.split(':');
  const { data: subscription } = await supa
    .from('subscriptions')
    .select('id, account_id, status, grace_started_at, plans!plan_id(name)')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!subscription) {
    console.error('[mercadopago-webhook] payment rechazado sin subscription local:', accountId);
    return { summary: 'payment rechazado sin subscription local', handled: false };
  }

  // payments.status solo admite pending/approved/rejected/refunded/disputed
  // (constraint de la base) — mapear los estados de MP que no coinciden 1:1.
  const paymentStatus = payment.status === 'refunded' ? 'refunded' : 'rejected';
  await supa.from('payments').insert({
    account_id: accountId,
    subscription_id: subscription.id,
    provider: 'mercadopago',
    provider_payment_id: String(dataId),
    amount: payment.transaction_amount,
    currency: payment.currency_id || 'ARS',
    status: paymentStatus,
  });

  // Solo abre gracia si la suscripción venía activa/en gracia — un pago
  // rechazado sobre una suscripción ya suspendida/cancelada no reabre nada.
  if (!['active', 'past_due', 'grace_period'].includes(subscription.status)) {
    return { summary: `payment rechazado ignorado, status actual=${subscription.status}`, handled: true };
  }

  const alreadyInGrace = !!subscription.grace_started_at;
  if (!alreadyInGrace) {
    await supa
      .from('subscriptions')
      .update({ status: 'past_due', grace_started_at: new Date().toISOString() })
      .eq('id', subscription.id);

    const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', accountId).maybeSingle();
    const { data: ownerProfile } = acc
      ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
      : { data: null };
    if (ownerProfile?.email) {
      await sendEmail({
        to: ownerProfile.email,
        subject: 'Hubo un problema con tu pago',
        html: templates.paymentFailedFirstNotice(subscription.plans?.name || 'tu plan'),
        templateKey: 'payment_failed_first_notice',
        accountId,
      });
    }
    return { summary: `subscription ${subscription.id} -> past_due (día 0, aviso enviado)`, handled: true };
  }

  return { summary: `subscription ${subscription.id} ya en gracia, pago rechazado no cambia nada más`, handled: true };
}

async function handleChargedBackPayment(supa, dataId, payment, externalRef) {
  // AD-13: contracargo — marcar el pago disputed, suspender el acceso
  // pago de inmediato (sin pasar por la gracia de 5 días, que es para
  // pagos simplemente rechazados, no para disputas ya iniciadas ante el
  // banco), mantener Concejal, alertar al administrador, conservar
  // evidencia. La resolución final (a favor de Alsina o del usuario) es
  // un paso manual documentado en 10-production-readiness-checklist.md —
  // este handler dejar el caso en un estado seguro y auditado, no lo cierra.
  const [, accountId] = externalRef.split(':');
  const { data: subscription } = await supa
    .from('subscriptions')
    .select('id, account_id, status, plans!plan_id(name)')
    .eq('account_id', accountId)
    .maybeSingle();
  if (!subscription) {
    console.error('[mercadopago-webhook] contracargo sin subscription local:', accountId);
    return { summary: 'contracargo sin subscription local', handled: false };
  }

  await supa.from('payments').upsert(
    {
      account_id: accountId,
      subscription_id: subscription.id,
      provider: 'mercadopago',
      provider_payment_id: String(dataId),
      amount: payment.transaction_amount,
      currency: payment.currency_id || 'ARS',
      status: 'disputed',
    },
    { onConflict: 'provider_payment_id' }
  );

  await supa.from('subscriptions').update({ status: 'disputed' }).eq('id', subscription.id);
  await supa.rpc('recalculate_plan_entitlements', { p_account_id: accountId });

  await supa.from('audit_logs').insert({
    actor_role: 'system',
    action: 'chargeback_received',
    target_table: 'subscriptions',
    target_id: subscription.id,
    after: { provider_payment_id: String(dataId), amount: payment.transaction_amount },
  });

  return { summary: `subscription ${subscription.id} -> disputed (contracargo, revisión manual pendiente)`, handled: true };
}

export async function handlePaymentEvent(supa, dataId) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  const payment = await r.json();
  const externalRef = payment.external_reference || '';

  if (payment.status !== 'approved') {
    if (externalRef.startsWith('sub:') && payment.status === 'charged_back') {
      return handleChargedBackPayment(supa, dataId, payment, externalRef);
    }
    if (externalRef.startsWith('sub:') && ['rejected', 'cancelled', 'refunded'].includes(payment.status)) {
      return handleRejectedSubscriptionPayment(supa, dataId, payment, externalRef);
    }
    return { summary: `payment ${dataId} status=${payment.status}`, handled: false };
  }

  if (externalRef.startsWith('sub:')) {
    // Cobro de una suscripción (alta o renovación) — reconciliar contra
    // nuestra propia tabla, no solo contra lo que diga el payload.
    const [, accountId, planSlug, priceId] = externalRef.split(':');
    const price = await getPriceById(priceId);

    const { data: subscription } = await supa
      .from('subscriptions')
      .select('id, account_id, plan_id, price_id, status, provider_subscription_id, pending_provider_subscription_id, plans!plan_id(name)')
      .eq('account_id', accountId)
      .maybeSingle();
    if (!subscription) {
      console.error('[mercadopago-webhook] payment sub:* sin subscription local:', accountId);
      return { summary: 'payment sin subscription local', handled: false };
    }

    // AD-11 — upgrade: este pago aprobado corresponde a un plan/precio
    // distinto del que factura hoy la cuenta. Cancelar la preapproval
    // anterior (deja de facturar el plan viejo) y adoptar la nueva como
    // provider_subscription_id vigente — recién ahora, con el pago ya
    // aprobado, nunca antes (si este pago hubiera fallado, no se llega
    // a este código y nada de esto se toca).
    const isUpgradeConfirmation = priceId && priceId !== subscription.price_id;
    if (isUpgradeConfirmation && subscription.provider_subscription_id) {
      try {
        const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
        const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        await new PreApproval(client).update({ id: subscription.provider_subscription_id, body: { status: 'cancelled' } });
      } catch (mpErr) {
        console.error('[mercadopago-webhook] no se pudo cancelar la preapproval anterior tras upgrade:', mpErr?.message || mpErr);
        await supa.from('audit_logs').insert({
          actor_role: 'system', action: 'mp_cancel_previous_failed_on_upgrade',
          target_table: 'subscriptions', target_id: subscription.id,
          after: { previousProviderSubscriptionId: subscription.provider_subscription_id, error: String(mpErr?.message || mpErr).slice(0, 300) },
        });
      }
    }

    if (price && Number(payment.transaction_amount) !== Number(price.amount)) {
      // Nunca bloquea el acceso por esto (el pago ya está aprobado en MP),
      // pero queda auditado — puede indicar que el precio cambió entre el
      // checkout y el cobro, o una inconsistencia a revisar a mano.
      await supa.from('audit_logs').insert({
        actor_role: 'system',
        action: 'payment_amount_mismatch',
        target_table: 'subscriptions',
        target_id: subscription.id,
        after: { expected: price.amount, received: payment.transaction_amount },
      });
    }

    const paidThrough = new Date();
    paidThrough.setMonth(paidThrough.getMonth() + 1);

    await supa.from('payments').insert({
      account_id: accountId,
      subscription_id: subscription.id,
      provider: 'mercadopago',
      provider_payment_id: String(dataId),
      amount: payment.transaction_amount,
      currency: payment.currency_id || 'ARS',
      status: 'approved',
    });

    const wasAlreadyActive = subscription.status === 'active';
    const wasRecovering = ['past_due', 'suspended'].includes(subscription.status);
    await supa
      .from('subscriptions')
      .update({
        status: 'active',
        // AD-03: el plan/precio que queda vigente es el de ESTE pago
        // aprobado (price/plan resueltos desde plan_prices, nunca del
        // frontend) — cubre alta nueva, renovación (idempotente, mismos
        // valores) y confirmación de upgrade (valores nuevos) con una
        // sola rama de código.
        plan_id: price ? price.plan_id : subscription.plan_id,
        price_id: priceId,
        provider_subscription_id: isUpgradeConfirmation && subscription.pending_provider_subscription_id
          ? subscription.pending_provider_subscription_id
          : subscription.provider_subscription_id,
        pending_provider_subscription_id: null,
        paid_through: paidThrough.toISOString(),
        current_period_start: new Date().toISOString(),
        // AD-10: "si el pago se recupera... se restaura el plan" — limpiar
        // todo rastro de la gracia/suspensión anterior, para que un
        // próximo rechazo futuro abra una gracia nueva de cero.
        grace_started_at: null,
        grace_notice_final_sent_at: null,
        suspended_at: null,
      })
      .eq('id', subscription.id);

    if (isUpgradeConfirmation) {
      await supa.from('audit_logs').insert({
        actor_role: 'system', action: 'upgrade_confirmed',
        target_table: 'subscriptions', target_id: subscription.id,
        before: { plan_id: subscription.plan_id, price_id: subscription.price_id },
        after: { plan_id: price?.plan_id, price_id: priceId },
      });
    }

    await supa.from('subscription_periods').insert({
      subscription_id: subscription.id,
      period_start: new Date().toISOString(),
      period_end: paidThrough.toISOString(),
      price_id: priceId,
    });

    await supa.rpc('recalculate_plan_entitlements', { p_account_id: accountId });

    if (!wasAlreadyActive) {
      const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', accountId).maybeSingle();
      const { data: ownerProfile } = acc
        ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
        : { data: null };
      if (ownerProfile?.email) {
        await sendEmail({
          to: ownerProfile.email,
          subject: wasRecovering ? `Tu acceso a Alsina ${subscription.plans?.name || planSlug} se restableció` : `Bienvenido a Alsina ${subscription.plans?.name || planSlug}`,
          html: wasRecovering
            ? templates.paymentRecovered(subscription.plans?.name || planSlug)
            : templates.subscriptionActive(subscription.plans?.name || planSlug),
          templateKey: wasRecovering ? 'payment_recovered' : 'subscription_active',
          accountId,
        });
      }
    } else if (isUpgradeConfirmation) {
      // La suscripción ya estaba activa (Intendente) — el pago que se
      // acaba de aprobar es el upgrade a Gobernador, no una renovación.
      const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', accountId).maybeSingle();
      const { data: ownerProfile } = acc
        ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
        : { data: null };
      if (ownerProfile?.email) {
        const { data: newPlan } = await supa.from('plans').select('name').eq('id', price?.plan_id).maybeSingle();
        await sendEmail({
          to: ownerProfile.email,
          subject: `Ahora sos ${newPlan?.name || planSlug}`,
          html: templates.planChanged(newPlan?.name || planSlug),
          templateKey: 'plan_changed_upgrade',
          accountId,
        });
      }
    }

    return { summary: `subscription ${subscription.id} -> active, paid_through ${paidThrough.toISOString()}`, handled: true };
  }

  if (externalRef.startsWith('informe:')) {
    const [, resource, email] = externalRef.split(':');
    if (!email || !resource) return { summary: 'informe payment sin referencia válida', handled: false };

    await supa.from('purchases').upsert(
      { email, resource, mp_payment_id: String(dataId), amount: payment.transaction_amount, status: 'paid' },
      { onConflict: 'mp_payment_id' }
    );
    await supa.from('unlocks').upsert(
      { email, resource },
      { onConflict: 'email,resource', ignoreDuplicates: true }
    );
    await sendEmail({
      to: email,
      subject: `Tu informe está listo — ${resource}`,
      html: `<p>Gracias por tu compra. Ya tenés acceso a tu informe.</p><p><a href="${SITE_URL}/informes.html">Ver mis informes</a></p>`,
      templateKey: 'informe_purchase',
    });
    return { summary: `informe ${resource} desbloqueado para ${email}`, handled: true };
  }

  return { summary: `payment con external_reference inesperado: ${externalRef}`, handled: false };
}

async function handleSubscriptionPreapprovalEvent(supa, dataId) {
  const r = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  const mpSub = await r.json();
  const status = normalizeSubscriptionStatus(mpSub.status);
  if (!status) return { summary: `preapproval status no mapeado: ${mpSub.status}`, handled: false };

  const { data: subscription } = await supa
    .from('subscriptions')
    .select('id, account_id, status')
    .eq('provider_subscription_id', String(dataId))
    .maybeSingle();
  if (!subscription) {
    console.error('[mercadopago-webhook] preapproval sin subscription local:', dataId);
    return { summary: 'preapproval sin subscription local', handled: false };
  }

  await supa.from('subscriptions').update({ status }).eq('id', subscription.id);
  await supa.rpc('recalculate_plan_entitlements', { p_account_id: subscription.account_id });

  if (status === 'canceled' && subscription.status !== 'canceled') {
    await supa.from('subscriptions').update({ canceled_at: new Date().toISOString() }).eq('id', subscription.id);
  }

  return { summary: `preapproval ${dataId} -> subscription ${subscription.id} status=${status}`, handled: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ status: 'configuration_incomplete' });
  }

  const eventType = req.body?.type || req.query?.type;
  const dataId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;

  if (!dataId || (eventType !== 'payment' && eventType !== 'subscription_preapproval')) {
    // Otros tipos (merchant_order, etc.) — acusar recibo sin procesar,
    // para que Mercado Pago no reintente indefinidamente.
    return res.status(200).json({ received: true });
  }

  if (!verifySignature(req, secret)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('[mercadopago-webhook] MP_ACCESS_TOKEN no configurado');
    return res.status(500).json({ error: 'not_configured' });
  }

  let supa;
  try {
    supa = getSupabaseAdmin();
  } catch (err) {
    console.error('[mercadopago-webhook] Supabase admin client error:', err.message);
    return res.status(500).json({ error: 'not_configured' });
  }

  const dedupKey = `mercadopago:${eventType}:${dataId}`;

  // Idempotencia real: se registra el evento ANTES de procesar. Si ya
  // existe y ya fue procesado, se corta acá sin repetir ningún efecto
  // (nunca reenvía mail ni vuelve a tocar subscriptions/payments).
  const { data: existingEvent } = await supa
    .from('payment_provider_events')
    .select('id, processed')
    .eq('dedup_key', dedupKey)
    .maybeSingle();

  if (existingEvent?.processed) {
    return res.status(200).json({ received: true, deduped: true });
  }

  let eventRowId = existingEvent?.id;
  if (!eventRowId) {
    const { data: inserted, error: insertError } = await supa
      .from('payment_provider_events')
      .insert({
        provider: 'mercadopago',
        event_type: eventType,
        provider_event_id: String(dataId),
        dedup_key: dedupKey,
        payload_sanitized: { type: eventType, dataId: String(dataId) },
        signature_valid: true,
      })
      .select('id')
      .single();
    if (insertError) {
      // Conflicto de unicidad = otra invocación concurrente ya lo insertó
      // — no es un error real, se recupera la fila existente y se sigue.
      const { data: raced } = await supa
        .from('payment_provider_events')
        .select('id, processed')
        .eq('dedup_key', dedupKey)
        .maybeSingle();
      if (raced?.processed) return res.status(200).json({ received: true, deduped: true });
      eventRowId = raced?.id;
    } else {
      eventRowId = inserted.id;
    }
  }

  try {
    const result =
      eventType === 'payment'
        ? await handlePaymentEvent(supa, dataId)
        : await handleSubscriptionPreapprovalEvent(supa, dataId);

    await supa
      .from('payment_provider_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', eventRowId);

    console.log('[mercadopago-webhook]', result.summary);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[mercadopago-webhook] error procesando evento:', err.message);
    await supa
      .from('payment_provider_events')
      .update({ error: String(err.message).slice(0, 500) })
      .eq('id', eventRowId);
    // No marcar processed=true — un reintento de Mercado Pago debe poder
    // reprocesar este mismo evento más adelante.
    return res.status(500).json({ error: 'processing_error' });
  }
}
