import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';
import { cancelAtPeriodEnd } from '../subscriptionActions.js';

// ALSINA — cancelación autoservicio (AD-12). Sin llamada, sin
// documentación, sin contacto comercial. Se aplica al final del período
// ya pagado (paid_through) — el acceso se mantiene hasta esa fecha.
// Revertible antes de que sea efectiva (api/subscriptions/revert-cancel.js).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, status, provider, provider_subscription_id, plans!plan_id(slug, name)')
    .eq('account_id', account.accountId)
    .maybeSingle();

  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });
  if (subscription.plans?.slug === 'concejal') {
    return res.status(400).json({ error: 'concejal_no_se_cancela' });
  }
  if (!['active', 'past_due', 'grace_period'].includes(subscription.status)) {
    return res.status(400).json({ error: 'estado_no_cancelable' });
  }

  try {
    const { cancellationCode, paidThrough } = await cancelAtPeriodEnd(supa, subscription, account);
    return res.status(200).json({ status: 'ok', cancellationCode, paidThrough });
  } catch (err) {
    console.error('cancel: error:', err.message);
    return res.status(500).json({ error: 'error_interno' });
  }
}
