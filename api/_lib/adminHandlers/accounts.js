import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireSuperAdmin } from '../adminAuth.js';

// ALSINA — listado/búsqueda de cuentas individuales (AD-17: exclusivo de
// super_admin — "partner solo accede a métricas agregadas... no ve
// nombres, emails... pagos individuales"). Nunca expuesto al rol partner.
// query: ?q=email (búsqueda parcial, opcional) — sin q, trae las más
// recientes primero, con límite.

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const supa = getSupabaseAdmin();
  const q = (req.query?.q || '').trim().toLowerCase();

  let profileQuery = supa.from('profiles').select('id, email, created_at').order('created_at', { ascending: false }).limit(50);
  if (q) profileQuery = profileQuery.ilike('email', `%${q}%`);
  const { data: profiles, error: profilesError } = await profileQuery;
  if (profilesError) return res.status(500).json({ error: 'error_interno' });

  const rows = [];
  for (const profile of profiles || []) {
    const { data: account } = await supa.from('accounts').select('id, created_at').eq('owner_profile_id', profile.id).maybeSingle();
    if (!account) { rows.push({ email: profile.email, accountId: null, plan: null, status: null }); continue; }

    const { data: sub } = await supa
      .from('subscriptions')
      .select('status, paid_through, provider, provider_subscription_id, pending_plan_id, cancel_requested_at, plans!plan_id(slug, name)')
      .eq('account_id', account.id)
      .maybeSingle();

    rows.push({
      email: profile.email,
      accountId: account.id,
      accountCreatedAt: account.created_at,
      plan: sub?.plans?.slug || 'concejal',
      planName: sub?.plans?.name || 'Concejal',
      status: sub?.status || 'active',
      paidThrough: sub?.paid_through || null,
      hasPendingDowngrade: !!sub?.pending_plan_id,
      cancelRequestedAt: sub?.cancel_requested_at || null,
      hasMercadoPago: sub?.provider === 'mercadopago' && !!sub?.provider_subscription_id,
    });
  }

  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ accounts: rows });
}
