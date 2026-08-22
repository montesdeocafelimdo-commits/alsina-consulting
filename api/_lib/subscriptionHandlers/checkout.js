import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';
import { getActivePlanPrice } from '../plans.js';

// ALSINA — alta/upgrade de un plan pago (Intendente, Gobernador) vía
// Mercado Pago. Concejal NO pasa por acá — se asigna automáticamente al
// registrarse (AD-04, trigger on_auth_user_created).
//
// Seguridad de pagos (AD-03, sección "SEGURIDAD DE PAGOS" del plan
// aprobado): el servidor determina plan/precio/moneda a partir de
// plan_prices — nunca se acepta un importe enviado por el navegador. El
// cliente solo manda qué plan quiere.

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';
const PAYABLE_PLANS = new Set(['intendente', 'gobernador']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return; // requireAuthenticatedAccount ya respondió 401

  const { planSlug } = req.body || {};
  if (!PAYABLE_PLANS.has(planSlug)) {
    return res.status(400).json({ error: 'plan_invalido' });
  }

  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';
  if (!paymentsEnabled) {
    // Mismo criterio que el resto del sitio: con pagos apagados, no se
    // llama nunca a la API de Mercado Pago (AD-07 / README-PAGOS.md).
    // A diferencia de un visitante anónimo, quien pide esto ya tiene
    // cuenta — se registra el interés igual, para poder avisarle cuando
    // los pagos se activen.
    try {
      const supa = getSupabaseAdmin();
      await supa.from('contacts').upsert(
        { email: account.email, source: `waitlist:${planSlug}` },
        { onConflict: 'email', ignoreDuplicates: true }
      );
    } catch (err) {
      console.error('checkout: no se pudo registrar waitlist:', err.message);
    }
    return res.status(503).json({ error: 'pagos_no_habilitados', waitlisted: true });
  }
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('PAYMENTS_ENABLED=true pero falta MP_ACCESS_TOKEN');
    return res.status(500).json({ error: 'pagos_no_configurados' });
  }

  const resolved = await getActivePlanPrice(planSlug);
  if (!resolved) {
    console.error('Sin plan_prices disponible para altas:', planSlug);
    return res.status(500).json({ error: 'plan_no_disponible' });
  }
  const { plan, price } = resolved;

  const supa = getSupabaseAdmin();

  // IMPORTANTE (bug real encontrado probando en vivo): esto ANTES escribía
  // plan_id/price_id/status='incomplete' acá, antes de que Mercado Pago
  // confirmara nada. El efecto: la cuenta se mostraba como "ya sos
  // Intendente" en /planes.html apenas alguien tocaba "Suscribirme" —
  // aunque el pago nunca se hubiera completado (se abandonó el checkout,
  // MP lo rechazó, etc.) — y bloqueaba reintentar. El webhook YA resuelve
  // plan_id/price_id de forma independiente desde external_reference
  // (ver api/mercadopago-webhook.js) — no hace falta pre-escribirlos acá.
  // Esta cuenta sigue siendo la que ya tenía (Concejal, activa) hasta que
  // el pago se confirme de verdad.
  const { data: existing, error: subError } = await supa
    .from('subscriptions')
    .select('id')
    .eq('account_id', account.accountId)
    .maybeSingle();
  if (subError || !existing) {
    console.error('checkout: no se encontró subscription existente:', subError?.message);
    return res.status(500).json({ error: 'error_interno' });
  }
  const subscription = existing;

  try {
    const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preapproval = new PreApproval(client);

    // IMPORTANTE (encontrado probando en real): PreApproval.create() con
    // preapproval_plan_id es para cuando VOS ya tokenizaste una tarjeta
    // (requiere card_token_id) — no sirve para el flujo de "redirigir a
    // la web de Mercado Pago y que la persona cargue la tarjeta ahí".
    // Ese flujo necesita auto_recurring ad-hoc, con el importe/moneda que
    // ya resolvió el servidor desde plan_prices (AD-03) — nunca del
    // preapproval_plan (que igual se crea/guarda aparte vía ensureMpPlan
    // para llevar el registro del lado servidor, ver api/_lib/plans.js,
    // pero no se usa acá).
    // payer_email es obligatorio para la API de Mercado Pago (probado:
    // sin él, PreApproval.create() rechaza con "payer_email is
    // required" — se intentó sacarlo y no funciona). Se manda el email
    // de la cuenta Alsina. Si en el checkout de MP el botón "Confirmar"
    // queda inhabilitado, lo más probable es que el comprador de prueba
    // con el que se inició sesión en Mercado Pago tenga un email
    // distinto de este — MP en modo suscripción pide que coincidan. La
    // cuenta que se acredita en Alsina la determina external_reference,
    // nunca el email, pero MP igual exige el match para dejar confirmar.
    const result = await preapproval.create({
      body: {
        reason: `Alsina ${plan.name} — suscripción mensual`,
        external_reference: `sub:${account.accountId}:${planSlug}:${price.id}`,
        payer_email: account.email,
        back_url: `${SITE_URL}/cuenta.html?checkout=pendiente`,
        auto_recurring: {
          frequency: 1, frequency_type: 'months',
          transaction_amount: Number(price.amount), currency_id: price.currency,
        },
      },
    });

    await supa
      .from('subscriptions')
      .update({ provider_subscription_id: String(result.id) })
      .eq('id', subscription.id);

    return res.status(200).json({ status: 'ok', checkoutUrl: result.init_point });
  } catch (err) {
    console.error('Mercado Pago checkout (subscriptions) error:', err?.message || err);
    return res.status(500).json({ error: 'Error al iniciar el pago. Intentá de nuevo.' });
  }
}
