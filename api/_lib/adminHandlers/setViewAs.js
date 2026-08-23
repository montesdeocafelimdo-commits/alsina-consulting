import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireSuperAdmin } from '../adminAuth.js';

// ALSINA — "ver el sitio como" (AD-17). Solo super_admin, y solo sobre
// su propia fila de admin_users — nunca toca subscriptions/billing.
// body: { plan: 'concejal'|'intendente'|'gobernador'|null }. null = volver
// a ver su plan real.

const VALID = new Set(['concejal', 'intendente', 'gobernador']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { plan } = req.body || {};
  if (plan !== null && !VALID.has(plan)) return res.status(400).json({ error: 'plan_invalido' });

  const supa = getSupabaseAdmin();
  const { error } = await supa.from('admin_users').update({ view_as_plan: plan }).eq('profile_id', admin.profileId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ status: 'ok', viewAsPlan: plan });
}
