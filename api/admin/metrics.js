import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAdmin } from '../_lib/adminAuth.js';

// ALSINA — métricas agregadas para el panel administrativo (AD-17).
// super_admin y partner ven exactamente lo mismo acá: nada de esto es
// un dato individual (nombre/email/CUIT/pago/factura/clave). Segmentos
// con menos de 5 cuentas se agrupan en "otros" (k-anonimato, AD-17).

const K_MIN = 5;

function suppressSmallSegments(counts) {
  const out = {};
  let suppressed = 0;
  for (const [key, count] of Object.entries(counts)) {
    if (count >= K_MIN) out[key] = count;
    else suppressed += count;
  }
  if (suppressed > 0) out.otros = (out.otros || 0) + suppressed;
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const supa = getSupabaseAdmin();

  const { data: subs, error } = await supa
    .from('subscriptions')
    .select('status, plans!plan_id(slug), plan_prices!price_id(amount, currency)');
  if (error) {
    console.error('admin/metrics: error leyendo subscriptions:', error.message);
    return res.status(500).json({ error: 'error_interno' });
  }

  const byPlanRaw = {};
  const byStatusRaw = {};
  let mrrArs = 0;
  for (const s of subs || []) {
    const slug = s.plans?.slug || 'desconocido';
    byPlanRaw[slug] = (byPlanRaw[slug] || 0) + 1;
    byStatusRaw[s.status] = (byStatusRaw[s.status] || 0) + 1;
    if (['active', 'past_due', 'grace_period', 'cancel_at_period_end'].includes(s.status) && s.plan_prices?.currency === 'ARS') {
      mrrArs += Number(s.plan_prices.amount || 0);
    }
  }

  const { count: totalAccounts } = await supa.from('accounts').select('id', { count: 'exact', head: true });

  const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count: newAccounts30d } = await supa.from('accounts').select('id', { count: 'exact', head: true }).gte('created_at', since30d);

  const { data: cancellations30d } = await supa
    .from('audit_logs')
    .select('id')
    .eq('action', 'cancellation_finalized')
    .gte('created_at', since30d);

  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json({
    role: admin.role,
    generatedAt: new Date().toISOString(),
    totalAccounts: totalAccounts ?? null,
    newAccounts30d: newAccounts30d ?? null,
    cancellationsFinalized30d: cancellations30d?.length ?? null,
    subscriptionsByPlan: suppressSmallSegments(byPlanRaw),
    subscriptionsByStatus: suppressSmallSegments(byStatusRaw),
    mrrArs,
  });
}
