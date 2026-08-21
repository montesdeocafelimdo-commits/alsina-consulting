import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../_lib/auth.js';

// ALSINA — revertir una cancelación antes de que sea efectiva (AD-12).
// Conserva plan, aniversario y precio fundador — no se tocan (nunca se
// modificaron al cancelar, solo se marcó cancel_at_period_end).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, status, paid_through, provider, provider_subscription_id')
    .eq('account_id', account.accountId)
    .maybeSingle();

  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });
  if (subscription.status !== 'cancel_at_period_end') {
    return res.status(400).json({ error: 'no_hay_cancelacion_pendiente' });
  }
  if (subscription.paid_through && new Date(subscription.paid_through) <= new Date()) {
    return res.status(400).json({ error: 'la_cancelacion_ya_fue_efectiva' });
  }

  // Reanudar en Mercado Pago la recurrencia que cancel.js había pausado.
  if (subscription.provider === 'mercadopago' && subscription.provider_subscription_id && process.env.MP_ACCESS_TOKEN) {
    try {
      const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      await new PreApproval(client).update({ id: subscription.provider_subscription_id, body: { status: 'authorized' } });
    } catch (mpErr) {
      console.error('revert-cancel: no se pudo reanudar en Mercado Pago:', mpErr?.message || mpErr);
      return res.status(500).json({ error: 'no_se_pudo_reanudar_el_pago' });
    }
  }

  const { error: updateError } = await supa
    .from('subscriptions')
    .update({ status: 'active', cancel_requested_at: null, cancellation_code: null })
    .eq('id', subscription.id);

  if (updateError) {
    console.error('revert-cancel: update error:', updateError.message);
    return res.status(500).json({ error: 'error_interno' });
  }

  return res.status(200).json({ status: 'ok' });
}
