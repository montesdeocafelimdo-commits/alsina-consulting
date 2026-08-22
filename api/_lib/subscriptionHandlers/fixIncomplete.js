import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — reparación puntual: cuentas cuya subscriptions quedó con
// status='incomplete' (checkout iniciado y nunca confirmado, con el bug
// ya corregido de api/_lib/subscriptionHandlers/checkout.js que
// sobreescribía plan_id/price_id antes de tiempo). Las vuelve a Concejal
// — es lo único que en verdad tienen pagado. Gateado con CRON_SECRET.
// body: { email } opcional — sin email, repara TODAS las cuentas en ese
// estado (barrido general, mismo criterio en cada una).

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const supa = getSupabaseAdmin();
  const { data: concejalPlan } = await supa.from('plans').select('id').eq('slug', 'concejal').maybeSingle();
  const { data: concejalPrice } = await supa
    .from('plan_prices').select('id').eq('plan_id', concejalPlan.id).eq('available_for_new_signups', true)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle();

  let query = supa.from('subscriptions').select('id, account_id').eq('status', 'incomplete');
  const { email } = req.body || {};
  if (email) {
    const { data: profile } = await supa.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!profile) return res.status(404).json({ error: 'profile_no_encontrado' });
    const { data: account } = await supa.from('accounts').select('id').eq('owner_profile_id', profile.id).maybeSingle();
    if (!account) return res.status(404).json({ error: 'account_no_encontrada' });
    query = query.eq('account_id', account.id);
  }

  const { data: stuck, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const fixed = [];
  for (const sub of stuck || []) {
    await supa.from('subscriptions').update({
      plan_id: concejalPlan.id, price_id: concejalPrice.id, status: 'active',
      provider: null, provider_subscription_id: null,
    }).eq('id', sub.id);
    await supa.rpc('recalculate_plan_entitlements', { p_account_id: sub.account_id });
    fixed.push(sub.account_id);
  }

  return res.status(200).json({ fixedCount: fixed.length, accountIds: fixed });
}
