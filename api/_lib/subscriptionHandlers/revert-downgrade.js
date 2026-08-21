import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';
import { getPriceById } from '../plans.js';

// ALSINA — revertir un downgrade pago-a-pago pendiente (Gobernador ->
// Intendente) antes de su fecha efectiva (AD-11). El caso ->Concejal se
// revierte con api/subscriptions/revert-cancel.js (es la misma
// cancelación programada, ver api/subscriptions/downgrade.js).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, price_id, provider, provider_subscription_id, pending_plan_id, pending_price_id, paid_through')
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });
  if (!subscription.pending_plan_id) return res.status(400).json({ error: 'no_hay_downgrade_pendiente' });
  if (subscription.paid_through && new Date(subscription.paid_through) <= new Date()) {
    return res.status(400).json({ error: 'el_downgrade_ya_fue_efectivo' });
  }

  const currentPrice = await getPriceById(subscription.price_id);
  if (subscription.provider === 'mercadopago' && subscription.provider_subscription_id && currentPrice) {
    if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'pagos_no_configurados' });
    try {
      const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      await new PreApproval(client).update({
        id: subscription.provider_subscription_id,
        body: { auto_recurring: { transaction_amount: Number(currentPrice.amount) } },
      });
    } catch (mpErr) {
      console.error('revert-downgrade: no se pudo restaurar el importe en Mercado Pago:', mpErr?.message || mpErr);
      return res.status(500).json({ error: 'no_se_pudo_revertir' });
    }
  }

  const { error: updateError } = await supa
    .from('subscriptions')
    .update({ pending_plan_id: null, pending_price_id: null })
    .eq('id', subscription.id);
  if (updateError) return res.status(500).json({ error: 'error_interno' });

  return res.status(200).json({ status: 'ok' });
}
