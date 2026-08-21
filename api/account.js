import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';
import { requireAuthenticatedAccount } from './_lib/auth.js';
import { getEntitlements } from './_lib/capabilities.js';

// ALSINA — panel de usuario: estado de cuenta/plan/suscripción (FASE 7).
// Requiere sesión. Nunca expone datos de otra cuenta — todo se filtra por
// el account_id resuelto server-side desde el JWT, nunca desde un
// parámetro del request.

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const supa = getSupabaseAdmin();

  // PATCH: solo preferencia editorial hoy (AD-04 — desuscribirse del
  // newsletter nunca toca el plan Concejal ni Monitor 135; los mensajes
  // transaccionales nunca dependen de esto). Antes vivía en su propio
  // archivo (api/account/preferences.js) — se unificó acá por el límite
  // de 12 Serverless Functions del plan Hobby de Vercel.
  if (req.method === 'PATCH') {
    const { editorialOptIn } = req.body || {};
    if (typeof editorialOptIn !== 'boolean') return res.status(400).json({ error: 'valor_invalido' });
    const { error } = await supa
      .from('email_preferences')
      .upsert({ account_id: account.accountId, editorial_opt_in: editorialOptIn }, { onConflict: 'account_id' });
    if (error) {
      console.error('account PATCH: error:', error.message);
      return res.status(500).json({ error: 'error_interno' });
    }
    return res.status(200).json({ status: 'ok', editorialOptIn });
  }

  const { data: subscription, error: subError } = await supa
    .from('subscriptions')
    .select(`
      status, provider, anniversary_day, current_period_start, paid_through,
      grace_started_at, suspended_at, cancel_requested_at, canceled_at, cancellation_code,
      plans!plan_id ( slug, name ),
      plan_prices!price_id ( amount, currency, is_founder )
    `)
    .eq('account_id', account.accountId)
    .maybeSingle();

  if (subError) {
    console.error('account: error leyendo subscription:', subError.message);
    return res.status(500).json({ error: 'error_interno' });
  }

  const { data: emailPrefs } = await supa
    .from('email_preferences')
    .select('editorial_opt_in')
    .eq('account_id', account.accountId)
    .maybeSingle();

  const { data: payments } = await supa
    .from('payments')
    .select('amount, currency, status, created_at')
    .eq('account_id', account.accountId)
    .order('created_at', { ascending: false })
    .limit(12);

  const entitlements = await getEntitlements(account.accountId);

  return res.status(200).json({
    email: account.email,
    plan: subscription?.plans?.slug || 'concejal',
    planName: subscription?.plans?.name || 'Concejal',
    status: subscription?.status || 'active',
    isFounderPrice: subscription?.plan_prices?.is_founder || false,
    priceAmount: subscription?.plan_prices?.amount ?? 0,
    priceCurrency: subscription?.plan_prices?.currency || 'ARS',
    anniversaryDay: subscription?.anniversary_day || null,
    paidThrough: subscription?.paid_through || null,
    cancelRequestedAt: subscription?.cancel_requested_at || null,
    canceledAt: subscription?.canceled_at || null,
    editorialOptIn: emailPrefs?.editorial_opt_in ?? true,
    capabilities: Array.from(entitlements.entries()).map(([key, level]) => ({ key, level })),
    paymentsHistory: payments || [],
  });
}
