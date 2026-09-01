import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../auth.js';
import { createCardPreapproval } from '../mpCardPreapproval.js';

// ALSINA — alta/upgrade de un plan pago (Intendente, Gobernador) vía
// Mercado Pago. Concejal NO pasa por acá — se asigna automáticamente al
// registrarse (AD-04, trigger on_auth_user_created).
//
// Seguridad de pagos (AD-03, sección "SEGURIDAD DE PAGOS" del plan
// aprobado): el servidor determina plan/precio/moneda a partir de
// plan_prices — nunca se acepta un importe enviado por el navegador. El
// cliente solo manda qué plan quiere.
//
// CAMBIO (2026-08-31): antes esto redirigía a la web de Mercado Pago
// (auto_recurring ad-hoc, sin card_token_id) — ese flujo exige que quien
// paga esté logueado en MP con el mismo email que payer_email, lo que
// rompía pagos reales cuando el mail de la cuenta de MP no coincidía con
// el de la cuenta Alsina (bug real reportado en producción). Ahora la
// tarjeta se tokeniza en el propio front (Card Form de Mercado Pago, ver
// planes.html) y acá solo se crea la preapproval con ese token — nunca
// se le pide a nadie loguearse en ninguna cuenta de Mercado Pago. Ver
// api/_lib/mpCardPreapproval.js para el detalle de la llamada a la API.

const PAYABLE_PLANS = new Set(['intendente', 'gobernador']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return; // requireAuthenticatedAccount ya respondió 401

  const { planSlug, payerEmail, cardToken, deviceId } = req.body || {};
  if (!PAYABLE_PLANS.has(planSlug)) {
    return res.status(400).json({ error: 'plan_invalido' });
  }

  // El email de la cuenta Alsina y el de la cuenta de Mercado Pago con la
  // que alguien paga no tienen por qué coincidir. Con tarjeta tokenizada
  // esto ya no bloquea el pago (MP no exige ningún login) — pero
  // payer_email lo sigue pidiendo la API igual, como identificador del
  // suscriptor de su lado, así que se sigue resolviendo del mismo modo.
  const resolvedPayerEmail = (typeof payerEmail === 'string' && EMAIL_RE.test(payerEmail.trim()))
    ? payerEmail.trim()
    : account.email;

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
  if (!cardToken) {
    // Solo puede pasar si el front no llegó a tokenizar la tarjeta antes
    // de llamar acá (bug de integración) — nunca un caso normal de uso.
    return res.status(400).json({ error: 'falta_token_de_tarjeta' });
  }

  const supa = getSupabaseAdmin();

  // IMPORTANTE (bug real encontrado probando en vivo): esto ANTES escribía
  // plan_id/price_id/status='incomplete' acá, antes de que Mercado Pago
  // confirmara nada. El efecto: la cuenta se mostraba como "ya sos
  // Intendente" en /planes.html apenas alguien tocaba "Suscribirme" —
  // aunque el pago nunca se hubiera completado. El webhook YA resuelve
  // plan_id/price_id de forma independiente desde external_reference
  // (ver api/mercadopago-webhook.js) — no hace falta pre-escribirlos acá,
  // y sigue sin hacer falta con tarjeta tokenizada: aunque la respuesta
  // de Mercado Pago ya venga "authorized", el webhook es quien deja
  // asentado el cambio real de plan/estado (única fuente de verdad).
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

  const result = await createCardPreapproval({
    planSlug,
    accountId: account.accountId,
    payerEmail: resolvedPayerEmail,
    cardToken,
    deviceId: typeof deviceId === 'string' ? deviceId : null,
    reasonLabel: `Alsina ${planSlug} — suscripción mensual`,
  });

  if (result.status === 'error') {
    // BUG REAL encontrado en producción (2026-08-31): antes esto no
    // dejaba ningún rastro — un cliente probó 3 tarjetas, solo una llegó
    // a crear preapproval, y de las otras dos no quedó forma de saber
    // qué pasó (ni acá, ni en Mercado Pago, solo en los logs efímeros de
    // Vercel). Se audita cada intento fallido, sin guardar nunca datos
    // de la tarjeta (ni acá ni en ningún otro lado los tenemos).
    await supa.from('audit_logs').insert({
      actor_role: 'system',
      action: 'card_preapproval_failed',
      target_table: 'subscriptions',
      target_id: subscription.id,
      after: { planSlug, hadDeviceId: !!deviceId, mpDetail: result.detail || null, message: result.error },
    });
    return res.status(402).json({ error: result.error });
  }

  await supa
    .from('subscriptions')
    .update({ provider_subscription_id: result.preapprovalId })
    .eq('id', subscription.id);

  // Registro aditivo para poder detectar y recordar checkouts abandonados
  // (ver docs/subscriptions-audit/14-*.md, punto 3C) — no reemplaza ni
  // pisa nada de `subscriptions`, es solo una fila histórica del intento.
  const { error: intentError } = await supa.from('checkout_intents').insert({
    account_id: account.accountId,
    email: resolvedPayerEmail,
    plan_slug: planSlug,
    provider_subscription_id: result.preapprovalId,
  });
  if (intentError) console.error('checkout: no se pudo registrar checkout_intents:', intentError.message);

  // status 'ok' = el MANDATO de cobro quedó autorizado (la tarjeta es
  // válida y Mercado Pago la puede debitar) — esto NO significa que el
  // primer cobro real ya se haya efectuado (bug real encontrado en
  // producción el 2026-08-31: una preapproval "authorized" puede tardar
  // horas en tener su primer cobro real). 'pending' = ni siquiera el
  // mandato quedó confirmado todavía. En ningún caso de los dos el front
  // debe decirle a la persona "ya sos {plan}" — eso solo pasa cuando el
  // webhook confirma el cobro real y cambia el plan (ver
  // api/mercadopago-webhook.js).
  return res.status(200).json({ status: result.status === 'ok' ? 'ok' : 'pending', plan: result.planName });
}
