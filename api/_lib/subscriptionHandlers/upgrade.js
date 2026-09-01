import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';
import { createCardPreapproval } from '../mpCardPreapproval.js';

// ALSINA — upgrade Intendente → Gobernador (AD-11). Único camino de
// upgrade soportado (Concejal → pago es un alta nueva, ver
// api/subscriptions/checkout.js, no un upgrade).
//
// Inmediato: se cobra el importe completo de Gobernador ahora mismo, sin
// crédito por lo que quedaba pagado de Intendente. El plan NO cambia acá
// — solo se crea la preapproval nueva y se guarda en pending_provider_
// subscription_id. El cambio real (plan/precio/aniversario/cancelar la
// preapproval vieja) lo hace api/mercadopago-webhook.js recién cuando
// ese pago nuevo se aprueba. Si el pago falla o el usuario abandona el
// checkout, no se modificó nada de lo que ya tenía.
//
// CAMBIO (2026-08-31): igual que checkout.js — se dejó de redirigir a la
// web de Mercado Pago (exigía login con el mismo email que payer_email)
// y ahora se cobra con una tarjeta tokenizada en el propio front (ver
// planes.html + api/_lib/mpCardPreapproval.js).

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  if (!paymentsEnabled) return res.status(503).json({ error: 'pagos_no_habilitados' });
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('PAYMENTS_ENABLED=true pero falta MP_ACCESS_TOKEN');
    return res.status(500).json({ error: 'pagos_no_configurados' });
  }

  const { payerEmail, cardToken, deviceId } = req.body || {};
  if (!cardToken) return res.status(400).json({ error: 'falta_token_de_tarjeta' });

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, status, provider, plans!plan_id(slug)')
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });

  if (subscription.plans?.slug !== 'intendente') {
    return res.status(400).json({ error: 'upgrade_solo_desde_intendente' });
  }
  if (!['active', 'past_due', 'grace_period'].includes(subscription.status)) {
    return res.status(400).json({ error: 'estado_no_permite_upgrade' });
  }

  // Ver la nota en checkout.js: el email de la cuenta Alsina y el de la
  // cuenta de Mercado Pago no tienen por qué coincidir.
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const resolvedPayerEmail = (typeof payerEmail === 'string' && EMAIL_RE.test(payerEmail.trim()))
    ? payerEmail.trim()
    : account.email;

  const result = await createCardPreapproval({
    planSlug: 'gobernador',
    accountId: account.accountId,
    payerEmail: resolvedPayerEmail,
    cardToken,
    deviceId: typeof deviceId === 'string' ? deviceId : null,
    reasonLabel: 'Alsina Gobernador — suscripción mensual (upgrade)',
  });

  if (result.status === 'error') {
    // Ver la nota en checkout.js: sin esto, un intento fallido no dejaba
    // ningún rastro investigable después.
    await supa.from('audit_logs').insert({
      actor_role: 'system',
      action: 'card_preapproval_failed',
      target_table: 'subscriptions',
      target_id: subscription.id,
      after: { planSlug: 'gobernador', upgrade: true, hadDeviceId: !!deviceId, mpDetail: result.detail || null, rawDetail: result.rawDetail || null, message: result.error },
    });
    return res.status(402).json({ error: result.error });
  }

  await supa.from('subscriptions').update({ pending_provider_subscription_id: result.preapprovalId }).eq('id', subscription.id);

  return res.status(200).json({
    status: result.status === 'ok' ? 'ok' : 'pending',
    plan: result.planName,
    notice: 'Se te cobró el importe completo de Gobernador ahora — no hay crédito por lo que quedaba pagado de Intendente.',
  });
}
