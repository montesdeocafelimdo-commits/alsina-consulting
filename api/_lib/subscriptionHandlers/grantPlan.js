import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { getActivePlanPrice } from '../plans.js';

// ALSINA — alta manual de un plan pago SIN pasar por Mercado Pago.
// Reparación puntual: destrabar a una persona que quiso pagar y no pudo
// por el mismatch de payer_email (ver memoria de sesión 2026-08-31 y el
// fix en planes.html) — mientras el problema de fondo (mail de cuenta
// distinto al mail de Mercado Pago) se resuelve de manera más completa.
// NO reemplaza el checkout normal — es solo para casos puntuales que un
// humano decide caso por caso. Gateado con CRON_SECRET, mismo patrón que
// restoreAccess.js/grantAdmin.js.
//
// body: { email, planSlug: 'intendente'|'gobernador', months? } — months
// es cuántos meses de acceso otorgar desde ahora (default 1, un ciclo de
// facturación normal). La cuenta queda con provider=null (como Concejal:
// "activa" sin depender de ningún proveedor externo) — si más adelante
// la persona completa un checkout real, ese flujo pisa esto sin problema.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

const PAYABLE_PLANS = new Set(['intendente', 'gobernador']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { email, planSlug, months } = req.body || {};
  if (!email || !PAYABLE_PLANS.has(planSlug)) {
    return res.status(400).json({ error: 'faltan_datos: email y planSlug (intendente|gobernador)' });
  }
  const grantMonths = Number(months) > 0 ? Number(months) : 1;

  const supa = getSupabaseAdmin();

  const { data: profile, error: profileError } = await supa
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (profileError || !profile) {
    return res.status(404).json({ error: 'profile_no_encontrado_debe_iniciar_sesion_primero' });
  }

  const { data: account, error: accountError } = await supa
    .from('accounts').select('id').eq('owner_profile_id', profile.id).maybeSingle();
  if (accountError || !account) return res.status(404).json({ error: 'cuenta_no_encontrada' });

  const resolved = await getActivePlanPrice(planSlug);
  if (!resolved) return res.status(500).json({ error: 'plan_no_disponible' });
  const { plan, price } = resolved;

  const { data: sub, error: subError } = await supa
    .from('subscriptions').select('id, plan_id, status, paid_through').eq('account_id', account.id).maybeSingle();
  if (subError || !sub) return res.status(404).json({ error: 'sin_suscripcion_previa_para_esta_cuenta' });

  const paidThrough = new Date();
  paidThrough.setMonth(paidThrough.getMonth() + grantMonths);

  const { error: updateError } = await supa.from('subscriptions').update({
    plan_id: plan.id,
    price_id: price.id,
    status: 'active',
    provider: null,
    provider_subscription_id: null,
    paid_through: paidThrough.toISOString(),
    cancel_requested_at: null,
    canceled_at: null,
    pending_plan_id: null,
    pending_price_id: null,
    pending_provider_subscription_id: null,
  }).eq('id', sub.id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  await supa.rpc('recalculate_plan_entitlements', { p_account_id: account.id });

  await supa.from('audit_logs').insert({
    actor_role: 'system',
    action: 'manual_plan_grant',
    target_table: 'subscriptions',
    target_id: sub.id,
    before: { plan_id: sub.plan_id, status: sub.status, paid_through: sub.paid_through },
    after: { plan_id: plan.id, status: 'active', paid_through: paidThrough.toISOString() },
  });

  return res.status(200).json({ status: 'ok', email, plan: plan.name, paidThrough: paidThrough.toISOString() });
}
