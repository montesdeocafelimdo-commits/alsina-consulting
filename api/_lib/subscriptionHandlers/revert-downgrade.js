import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';

// ALSINA — revertir un downgrade pago-a-pago pendiente (Gobernador ->
// Intendente) antes de su fecha efectiva (AD-11). El caso ->Concejal se
// revierte con api/subscriptions/revert-cancel.js (es la misma
// cancelación programada, ver api/subscriptions/downgrade.js).
//
// Como downgrade.js ya no toca Mercado Pago al programar el cambio
// (corrección AD-11: se verifica recién en el aniversario), revertir acá
// es puramente local — no hay nada que deshacer en MP porque nunca se
// tocó nada ahí. Siempre disponible mientras el downgrade siga pendiente.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, pending_plan_id, paid_through')
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });
  if (!subscription.pending_plan_id) return res.status(400).json({ error: 'no_hay_downgrade_pendiente' });
  if (subscription.paid_through && new Date(subscription.paid_through) <= new Date()) {
    return res.status(400).json({ error: 'el_downgrade_ya_fue_efectivo' });
  }

  const { error: updateError } = await supa
    .from('subscriptions')
    .update({
      pending_plan_id: null, pending_price_id: null,
      pending_downgrade_attempts: 0, pending_downgrade_last_error: null, pending_downgrade_failed_at: null,
    })
    .eq('id', subscription.id);
  if (updateError) return res.status(500).json({ error: 'error_interno' });

  return res.status(200).json({ status: 'ok' });
}
