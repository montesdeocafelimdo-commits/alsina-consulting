import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — reparación puntual: una cuenta que pagó de verdad (paid_through
// en el futuro) pero cuya preapproval en Mercado Pago quedó cancelada por
// error (ver commit "CRÍTICO — el webhook cancelaba..."). Restaura el
// acceso YA (ya lo pagó, no es su culpa) y limpia las referencias a la
// preapproval muerta — no hay nada que pausar/cancelar ahí, ya está
// cancelada de forma terminal en Mercado Pago. NO reactiva el cobro
// automático (Mercado Pago no permite reactivar una preapproval
// cancelada) — deja status='active' con paid_through intacto; el acceso
// se sostiene hasta esa fecha con el mecanismo normal, y hace falta un
// nuevo checkout antes de esa fecha para que el cobro siga. Gateado con
// CRON_SECRET. body: { accountId }.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { accountId } = req.body || {};
  if (!accountId) return res.status(400).json({ error: 'accountId_requerido' });

  const supa = getSupabaseAdmin();
  const { data: sub, error } = await supa.from('subscriptions').select('id, status, paid_through, plans!plan_id(name)').eq('account_id', accountId).maybeSingle();
  if (error || !sub) return res.status(404).json({ error: 'sin_suscripcion' });
  if (!sub.paid_through || new Date(sub.paid_through) <= new Date()) {
    return res.status(400).json({ error: 'sin_paid_through_futuro_no_corresponde_restaurar' });
  }

  const { error: updateError } = await supa
    .from('subscriptions')
    .update({ status: 'active', provider: null, provider_subscription_id: null, canceled_at: null })
    .eq('id', sub.id);
  if (updateError) return res.status(500).json({ error: updateError.message });

  await supa.rpc('recalculate_plan_entitlements', { p_account_id: accountId });
  await supa.from('audit_logs').insert({
    actor_role: 'system', action: 'access_restored_after_erroneous_mp_cancel',
    target_table: 'subscriptions', target_id: sub.id,
    before: { status: sub.status }, after: { status: 'active', paid_through: sub.paid_through },
  });

  return res.status(200).json({ status: 'ok', plan: sub.plans?.name, paidThrough: sub.paid_through });
}
