import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — carga idempotente en admin_users (AD-17, docs/subscriptions-
// audit/13-admin-onboarding.md). Gateado con CRON_SECRET — es el único
// camino para crear el PRIMER super_admin (chicken-and-egg: nadie puede
// estar en admin_users todavía para autorizar el alta por sí solo).
// body: { email, role: 'super_admin'|'partner', label }. El profile
// tiene que existir ya (la persona ya inició sesión al menos una vez).

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { email, role, label } = req.body || {};
  if (!email || !['super_admin', 'partner'].includes(role)) {
    return res.status(400).json({ error: 'faltan_datos' });
  }

  const supa = getSupabaseAdmin();
  const { data: profile, error: profileError } = await supa.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profileError || !profile) return res.status(404).json({ error: 'profile_no_encontrado_debe_iniciar_sesion_primero' });

  const { error } = await supa
    .from('admin_users')
    .upsert({ profile_id: profile.id, role, label: label || null }, { onConflict: 'profile_id' });
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ status: 'ok', email, role });
}
