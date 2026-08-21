import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';

// ALSINA — reconciliación periódica contra Mercado Pago (AD-16: "Mercado
// Pago... son fuentes de contraste, no el único historial"; objetivo
// "Reconciliación periódica entre Mercado Pago y Supabase").
//
// Red de seguridad para webhooks perdidos (MP reintenta notificaciones,
// pero no está garantizado al 100%): para cada suscripción local con
// provider_subscription_id, vuelve a consultar el estado real en MP y lo
// compara. Si coincide, no toca nada. Si no coincide, deja constancia en
// audit_logs para revisión — no reescribe estados de forma automática
// más allá del mapeo ya usado por el webhook (mismo
// normalizeSubscriptionStatus), para no duplicar lógica que podría
// divergir entre los dos archivos.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/reconcile] CRON_SECRET no configurado — rechazando por seguridad (fail closed).');
    res.status(503).json({ error: 'not_configured' });
    return false;
  }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function normalizeSubscriptionStatus(mpStatus) {
  switch (mpStatus) {
    case 'authorized': return 'active';
    case 'paused': return 'past_due';
    case 'cancelled': return 'canceled';
    case 'pending': return 'pending';
    default: return null;
  }
}

// Estados locales que "cubren" un mpStatus dado — evita marcar mismatch
// por diferencias esperadas (ej. local 'cancel_at_period_end' con MP
// todavía 'paused' porque cancel.js pausa, no cancela, hasta que se
// cumple paid_through — ver api/subscriptions/cancel.js).
const COMPATIBLE_LOCAL_STATUSES = {
  active: new Set(['active']),
  past_due: new Set(['past_due', 'grace_period', 'suspended', 'cancel_at_period_end']),
  canceled: new Set(['canceled']),
  pending: new Set(['incomplete', 'pending']),
};

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  if (!process.env.MP_ACCESS_TOKEN) {
    return res.status(200).json({ skipped: true, reason: 'MP_ACCESS_TOKEN no configurado (pagos no activos todavía)' });
  }

  const supa = getSupabaseAdmin();
  const { data: subs, error } = await supa
    .from('subscriptions')
    .select('id, account_id, status, provider_subscription_id')
    .eq('provider', 'mercadopago')
    .not('provider_subscription_id', 'is', null);

  if (error) {
    console.error('[cron/reconcile] error leyendo subscriptions:', error.message);
    return res.status(500).json({ error: 'error_interno' });
  }

  const summary = { checked: 0, matched: 0, mismatched: [], mpErrors: [] };

  for (const sub of subs || []) {
    summary.checked++;
    try {
      const r = await fetch(`https://api.mercadopago.com/preapproval/${sub.provider_subscription_id}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      });
      if (!r.ok) {
        summary.mpErrors.push({ subscriptionId: sub.id, httpStatus: r.status });
        continue;
      }
      const mpSub = await r.json();
      const expected = normalizeSubscriptionStatus(mpSub.status);
      const compatible = expected ? COMPATIBLE_LOCAL_STATUSES[expected] : null;

      if (!expected || (compatible && compatible.has(sub.status))) {
        summary.matched++;
        continue;
      }

      summary.mismatched.push({ subscriptionId: sub.id, localStatus: sub.status, mpStatus: mpSub.status });
      await supa.from('audit_logs').insert({
        actor_role: 'system',
        action: 'reconciliation_mismatch',
        target_table: 'subscriptions',
        target_id: sub.id,
        after: { localStatus: sub.status, mpStatus: mpSub.status },
      });
    } catch (err) {
      summary.mpErrors.push({ subscriptionId: sub.id, error: err.message });
    }
  }

  console.log('[cron/reconcile]', JSON.stringify(summary));
  return res.status(200).json(summary);
}
