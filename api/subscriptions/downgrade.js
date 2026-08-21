import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../_lib/auth.js';
import { getActivePlanPrice } from '../_lib/plans.js';
import { cancelAtPeriodEnd } from '../_lib/subscriptionActions.js';

// ALSINA — downgrade (AD-11): Gobernador→Intendente, Gobernador→Concejal,
// Intendente→Concejal. Efectivo al próximo aniversario (paid_through),
// sin devolución proporcional. Se mantiene el plan actual hasta esa
// fecha. Revertible antes de la fecha efectiva.
//
// →Concejal es, en los hechos, una cancelación (AD-12) — se delega al
// mismo mecanismo (api/_lib/subscriptionActions.js) para no duplicar ni
// divergir. →Intendente (desde Gobernador) sigue siendo un plan pago: no
// se crea una preapproval nueva (Mercado Pago no permite autorizar un
// cobro nuevo sin que el usuario pase por un checkout), se actualiza el
// importe de la preapproval EXISTENTE — Mercado Pago aplica ese cambio
// recién en el próximo cobro, nunca retroactivo. Confirmar este
// comportamiento contra la documentación/API real de Mercado Pago antes
// de activar pagos (ver 10-production-readiness-checklist.md).

const DOWNGRADE_TARGETS = new Set(['intendente', 'concejal']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const { targetPlan } = req.body || {};
  if (!DOWNGRADE_TARGETS.has(targetPlan)) return res.status(400).json({ error: 'plan_destino_invalido' });

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, status, provider, provider_subscription_id, plans(slug, name)')
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });
  if (!['active', 'past_due', 'grace_period'].includes(subscription.status)) {
    return res.status(400).json({ error: 'estado_no_permite_downgrade' });
  }

  const currentSlug = subscription.plans?.slug;
  const isRealDowngrade =
    (currentSlug === 'gobernador' && (targetPlan === 'intendente' || targetPlan === 'concejal')) ||
    (currentSlug === 'intendente' && targetPlan === 'concejal');
  if (!isRealDowngrade) return res.status(400).json({ error: 'no_es_un_downgrade_valido' });

  if (targetPlan === 'concejal') {
    try {
      const { cancellationCode, paidThrough } = await cancelAtPeriodEnd(supa, subscription, account);
      return res.status(200).json({ status: 'ok', mode: 'cancel_at_period_end', cancellationCode, paidThrough });
    } catch (err) {
      console.error('downgrade->concejal: error:', err.message);
      return res.status(500).json({ error: 'error_interno' });
    }
  }

  // Gobernador -> Intendente: sigue pago, no requiere PAYMENTS_ENABLED
  // para *programar* el cambio, pero si hay preapproval real hay que
  // poder tocarla — sin token no se puede garantizar el próximo cobro.
  const resolved = await getActivePlanPrice('intendente');
  if (!resolved) return res.status(500).json({ error: 'plan_no_disponible' });
  const { plan, price } = resolved;

  if (subscription.provider === 'mercadopago' && subscription.provider_subscription_id) {
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'pagos_no_configurados' });
    try {
      const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      await new PreApproval(client).update({
        id: subscription.provider_subscription_id,
        body: { auto_recurring: { transaction_amount: Number(price.amount) } },
      });
    } catch (mpErr) {
      console.error('downgrade: no se pudo actualizar el importe en Mercado Pago:', mpErr?.message || mpErr);
      return res.status(500).json({ error: 'no_se_pudo_programar_el_downgrade' });
    }
  }

  const { error: updateError } = await supa
    .from('subscriptions')
    .update({ pending_plan_id: plan.id, pending_price_id: price.id })
    .eq('id', subscription.id);
  if (updateError) {
    console.error('downgrade: error guardando cambio pendiente:', updateError.message);
    return res.status(500).json({ error: 'error_interno' });
  }

  const { data: refreshed } = await supa.from('subscriptions').select('paid_through').eq('id', subscription.id).maybeSingle();
  return res.status(200).json({
    status: 'ok', mode: 'pending_downgrade',
    targetPlan: plan.name, amount: price.amount, currency: price.currency,
    effectiveAt: refreshed?.paid_through || null,
  });
}
