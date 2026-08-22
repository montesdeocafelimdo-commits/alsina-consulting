import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — diagnóstico: últimos eventos de Mercado Pago recibidos +
// últimas cuentas/suscripciones tocadas. Gateado con CRON_SECRET. Nunca
// expone secretos, solo filas de negocio.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;

  const supa = getSupabaseAdmin();

  const { data: events, error: eventsError } = await supa
    .from('payment_provider_events')
    .select('id, provider, event_type, provider_event_id, dedup_key, processed, processed_at, error, payload_sanitized, received_at')
    .order('received_at', { ascending: false })
    .limit(15);

  const { data: subs, error: subsError } = await supa
    .from('subscriptions')
    .select('account_id, status, plan_id, provider, provider_subscription_id, pending_provider_subscription_id, paid_through, updated_at, plans!plan_id(slug, name)')
    .order('updated_at', { ascending: false })
    .limit(15);

  const { data: payments, error: paymentsError } = await supa
    .from('payments')
    .select('account_id, amount, currency, status, provider_payment_id, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  return res.status(200).json({
    events: events || [], eventsError: eventsError?.message || null,
    subscriptions: subs || [], subsError: subsError?.message || null,
    payments: payments || [], paymentsError: paymentsError?.message || null,
  });
}
