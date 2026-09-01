import { getActivePlanPrice, ensureMpPlan } from './plans.js';

// ALSINA — creación de una suscripción (preapproval) de Mercado Pago a
// partir de una tarjeta ya tokenizada del lado del cliente (Card Form,
// ver planes.html). Reemplaza el flujo anterior de "redirigir a la web
// de Mercado Pago" — ese flujo exigía que quien paga esté logueado en MP
// con el mismo email que payer_email, y eso rompía pagos reales cuando
// el mail de la cuenta de MP no coincidía con el de la cuenta Alsina
// (ver memoria de sesión 2026-08-31 / fix en planes.html del mismo día).
// Con la tarjeta tokenizada, MP nunca pide loguearse en ninguna cuenta —
// el problema del mail que no coincide deja de existir.
//
// Referencia (confirmado contra la documentación oficial de Mercado
// Pago, no supuesto): POST /preapproval acepta card_token_id +
// preapproval_plan_id + status:"authorized" para crear una suscripción
// ya autorizada contra una tarjeta tokenizada, sin checkout redirigido.
// preapproval_plan_id sale de ensureMpPlan() (ya existía en el código,
// preparado exactamente para este flujo pero sin usar todavía).

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

// Traducciones de los status_detail más comunes que devuelve Mercado
// Pago cuando una tarjeta tokenizada no puede autorizarse. Lista no
// exhaustiva — cualquier código no listado cae en un mensaje genérico
// (nunca se le muestra a la persona un código interno de MP).
const DECLINE_MESSAGES = {
  cc_rejected_insufficient_amount: 'Fondos insuficientes.',
  cc_rejected_bad_filled_card_number: 'Revisá el número de tarjeta.',
  cc_rejected_bad_filled_date: 'Revisá la fecha de vencimiento.',
  cc_rejected_bad_filled_security_code: 'Revisá el código de seguridad (CVV).',
  cc_rejected_bad_filled_other: 'Revisá los datos de la tarjeta.',
  cc_rejected_call_for_authorize: 'Tu banco pide que autorices el pago con ellos antes de reintentar.',
  cc_rejected_card_disabled: 'Esa tarjeta no está habilitada para este tipo de operación — consultá con tu banco.',
  cc_rejected_duplicated_payment: 'Ya se procesó un intento igual hace instantes.',
  cc_rejected_high_risk: 'El pago fue rechazado por un control de seguridad de Mercado Pago.',
  cc_rejected_max_attempts: 'Alcanzaste el máximo de intentos permitidos con esta tarjeta.',
  cc_rejected_other_reason: 'Tu banco rechazó el pago sin especificar el motivo — probá con otra tarjeta.',
};

function friendlyError(err) {
  const detail = err?.cause?.[0]?.code || err?.cause?.[0]?.description || null;
  return { detail, message: (detail && DECLINE_MESSAGES[detail]) || null };
}

/**
 * @param {{ planSlug: string, accountId: string, payerEmail: string, cardToken: string, reasonLabel: string, deviceId?: string|null }} params
 * @returns {Promise<
 *   | { status: 'ok', preapprovalId: string, planName: string }   // mandato autorizado — el cobro real todavía puede tardar, no asumir plan activo
 *   | { status: 'pending', preapprovalId: string, mpStatus: string }
 *   | { status: 'error', error: string, detail?: string|null }   // detail = código interno de MP (cc_rejected_*), para auditar
 * >}
 */
export async function createCardPreapproval({ planSlug, accountId, payerEmail, cardToken, reasonLabel, deviceId }) {
  if (!cardToken) return { status: 'error', error: 'falta_token_de_tarjeta', detail: null };

  const resolved = await getActivePlanPrice(planSlug);
  if (!resolved) return { status: 'error', error: 'plan_no_disponible', detail: null };
  const { plan, price } = resolved;

  const ensured = await ensureMpPlan(planSlug);
  if (ensured.status !== 'ok') {
    console.error('createCardPreapproval: ensureMpPlan falló:', ensured.error);
    return { status: 'error', error: 'No se pudo preparar el plan en Mercado Pago. Probá de nuevo en un momento.', detail: null };
  }

  // Mismo formato que ya esperaba api/mercadopago-webhook.js (payment):
  // "sub:<accountId>:<planSlug>:<priceId>" — no cambiar sin actualizar
  // ahí también (línea que hace external_reference.split(':')).
  const externalReference = `sub:${accountId}:${planSlug}:${price.id}`;

  try {
    const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preapproval = new PreApproval(client);

    const result = await preapproval.create({
      body: {
        preapproval_plan_id: ensured.providerPlanId,
        reason: reasonLabel,
        external_reference: externalReference,
        payer_email: payerEmail,
        card_token_id: cardToken,
        status: 'authorized',
        back_url: `${SITE_URL}/cuenta.html`,
      },
      // Device ID (huella antifraude de Mercado Pago, ver planes.html /
      // getDeviceId): sin esto, Mercado Pago no tiene señal de riesgo real
      // y trata el pago como anónimo — se comprobó en producción que eso
      // deriva en rechazos cc_rejected_high_risk en el primer cobro de una
      // tarjeta nueva contra un cobrador nuevo (2026-08-31). meliSessionId
      // es el nombre que usa el SDK para mandar el header X-Meli-Session-Id
      // que pide Mercado Pago (ver mercadopago/dist/types.d.ts, Options).
      ...(deviceId ? { requestOptions: { meliSessionId: deviceId } } : {}),
    });

    // OJO (bug real encontrado en el primer pago real de producción,
    // 2026-08-31): "authorized" acá es el MANDATO de cobro recurrente
    // (la tarjeta quedó validada y Mercado Pago la puede debitar), NO
    // que el primer cobro real ya se haya efectuado. Se comprobó con
    // diag-preapproval que una preapproval puede quedar "authorized"
    // durante horas con summarized.charged_quantity/last_charged_date
    // todavía en null — el cobro real lo dispara después, de forma
    // asíncrona, el motor de facturación recurrente de Mercado Pago. El
    // status 'ok' de acá NO debe traducirse en el front como "ya sos
    // {plan}" ni activar nada — la única fuente de verdad de que el
    // cobro real ocurrió es el webhook (api/mercadopago-webhook.js),
    // que es quien de verdad cambia plan_id/status y manda el mail de
    // bienvenida.
    if (result.status === 'authorized') {
      return { status: 'ok', preapprovalId: String(result.id), planName: plan.name };
    }
    // MP creó la preapproval pero el mandato en sí no quedó autorizado de
    // forma síncrona (puede pasar — verificación adicional del banco,
    // demora, etc.). No es necesariamente un rechazo: el webhook va a
    // terminar de resolver el estado real apenas Mercado Pago lo confirme.
    return { status: 'pending', preapprovalId: String(result.id), mpStatus: result.status };
  } catch (err) {
    const { detail, message } = friendlyError(err);
    console.error('createCardPreapproval error:', err?.message || err, detail ? `(${detail})` : '');
    // detail = el código interno de Mercado Pago (cc_rejected_high_risk,
    // etc.) — antes solo quedaba en console.error (Vercel lo retiene poco
    // tiempo). Se devuelve acá para que checkout.js/upgrade.js lo dejen
    // asentado en audit_logs y quede investigable después (bug real:
    // 2026-08-31, un cliente probó 3 tarjetas y no quedó rastro de las 2
    // que fallaron antes de llegar a crear la preapproval).
    return { status: 'error', error: message || 'El pago no pudo procesarse. Revisá los datos de tu tarjeta o probá con otra.', detail: detail || null };
  }
}
