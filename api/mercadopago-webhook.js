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

function verifySignature(req, secret) {
  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId: req.body?.data?.id || req.query?.['data.id'] || req.query?.id,
      secret,
      toleranceSeconds: 300,
    });
    return true;
  } catch (err) {
    console.error('[mercadopago-webhook] firma rechazada:', err?.reason || err?.message || 'unknown');
    return false;
  }
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

async function handlePaymentEvent(supa, dataId) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  const payment = await r.json();
  const externalRef = payment.external_reference || '';

  if (payment.status !== 'approved') {
    return { summary: `payment ${dataId} status=${payment.status}`, handled: false };
  }

  if (externalRef.startsWith('sub:')) {
    // Cobro de una suscripción (alta o renovación) — reconciliar contra
    // nuestra propia tabla, no solo contra lo que diga el payload.
    const [, accountId, planSlug, priceId] = externalRef.split(':');
    const price = await getPriceById(priceId);

    const { data: subscription } = await supa
      .from('subscriptions')
      .select('id, account_id, plan_id, status, plans(name)')
      .eq('account_id', accountId)
      .maybeSingle();
    if (!subscription) {
      console.error('[mercadopago-webhook] payment sub:* sin subscription local:', accountId);
      return { summary: 'payment sin subscription local', handled: false };
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
    await supa
      .from('subscriptions')
      .update({
        status: 'active',
        paid_through: paidThrough.toISOString(),
        current_period_start: new Date().toISOString(),
        grace_started_at: null,
      })
      .eq('id', subscription.id);

    await supa.from('subscription_periods').insert({
      subscription_id: subscription.id,
      period_start: new Date().toISOString(),
      period_end: paidThrough.toISOString(),
      price_id: priceId,
    });

    await supa.rpc('recalculate_plan_entitlements', { p_account_id: accountId });

    if (!wasAlreadyActive) {
      // Buscar el email del dueño de la cuenta para la bienvenida.
      const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', accountId).maybeSingle();
      const { data: ownerProfile } = acc
        ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
        : { data: null };
      if (ownerProfile?.email) {
        await sendEmail({
          to: ownerProfile.email,
          subject: `Bienvenido a Alsina ${subscription.plans?.name || planSlug}`,
          html: templates.subscriptionActive(subscription.plans?.name || planSlug),
          templateKey: 'subscription_active',
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
