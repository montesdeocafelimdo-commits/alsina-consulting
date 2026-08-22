import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';
import { getActivePlanPrice } from '../plans.js';

// ALSINA — upgrade Intendente → Gobernador (AD-11). Único camino de
// upgrade soportado (Concejal → pago es un alta nueva, ver
// api/subscriptions/checkout.js, no un upgrade).
//
// Inmediato: se cobra el importe completo de Gobernador ahora mismo, sin
// crédito por lo que quedaba pagado de Intendente. El plan NO cambia acá
// — solo se crea la preapproval nueva y se guarda en pending_provider_
// subscription_id. El cambio real (plan/precio/aniversario/cancelar la
// preapproval vieja) lo hace api/mercadopago-webhook.js recién cuando
// ese pago nuevo se aprueba. Si el pago falla o el usuario abandona el
// checkout, no se modificó nada de lo que ya tenía.

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  if (!paymentsEnabled) return res.status(503).json({ error: 'pagos_no_habilitados' });
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('PAYMENTS_ENABLED=true pero falta MP_ACCESS_TOKEN');
    return res.status(500).json({ error: 'pagos_no_configurados' });
  }

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, status, provider, plans!plan_id(slug)')
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (error || !subscription) return res.status(404).json({ error: 'sin_suscripcion' });

  if (subscription.plans?.slug !== 'intendente') {
    return res.status(400).json({ error: 'upgrade_solo_desde_intendente' });
  }
  if (!['active', 'past_due', 'grace_period'].includes(subscription.status)) {
    return res.status(400).json({ error: 'estado_no_permite_upgrade' });
  }

  const resolved = await getActivePlanPrice('gobernador');
  if (!resolved) {
    console.error('Sin plan_prices disponible para altas:', 'gobernador');
    return res.status(500).json({ error: 'plan_no_disponible' });
  }
  const { plan, price } = resolved;

  try {
    const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preapproval = new PreApproval(client);

    // Ver la nota en api/_lib/subscriptionHandlers/checkout.js: MP exige
    // card_token_id si se pasa preapproval_plan_id — no sirve para
    // redirigir a la web de MP. Auto_recurring ad-hoc, mismo criterio.
    const result = await preapproval.create({
      body: {
        reason: `Alsina ${plan.name} — suscripción mensual (upgrade)`,
        external_reference: `sub:${account.accountId}:gobernador:${price.id}`,
        payer_email: account.email,
        back_url: `${SITE_URL}/cuenta.html?upgrade=pendiente`,
        auto_recurring: {
          frequency: 1, frequency_type: 'months',
          transaction_amount: Number(price.amount), currency_id: price.currency,
        },
      },
    });

    await supa.from('subscriptions').update({ pending_provider_subscription_id: String(result.id) }).eq('id', subscription.id);

    return res.status(200).json({
      status: 'ok',
      checkoutUrl: result.init_point,
      amount: price.amount,
      currency: price.currency,
      notice: 'Se te va a cobrar el importe completo de Gobernador ahora — no hay crédito por lo que quedaba pagado de Intendente.',
    });
  } catch (err) {
    console.error('Mercado Pago upgrade error:', err?.message || err);
    return res.status(500).json({ error: 'Error al iniciar el upgrade. Intentá de nuevo.' });
  }
}
