import { WebhookSignatureValidator } from 'mercadopago';

// ALSINA — endpoint definitivo de notificaciones de Mercado Pago (AD-07,
// docs/subscriptions-audit/11-approved-decisions.md). Ruta final de
// producción: no es un archivo descartable ni un mock.
//
// Estado actual, antes de aplicar la migración de FASE 1
// (supabase/migrations/20260820210041_fase1_foundations.sql) contra la
// base real — ver docs/subscriptions-audit/12-fase1-status.md:
//
//   - Sin MP_WEBHOOK_SECRET configurado: responde 503 y no toca nada.
//     Este es el estado esperado hasta cargar el secreto real que genera
//     Mercado Pago al configurar la notificación con esta URL.
//   - Con MP_WEBHOOK_SECRET pero firma ausente/inválida: responde 401 y
//     no toca nada. Nunca "deja pasar" sin firma (fallar cerrado, AD-07 —
//     a diferencia de api/webhook.js, que hoy solo advierte con un
//     console.warn si falta el secreto).
//   - Con firma válida: por ahora, responde 200 (para que Mercado Pago no
//     reintente indefinidamente) pero TODAVÍA NO persiste nada ni concede
//     ningún acceso — ese cableado se conecta recién cuando
//     payment_provider_events/subscriptions/payments (FASE 1) existan en
//     la base de producción. Ver el TODO marcado más abajo.
//
// La URL de retorno del navegador nunca concede acceso — esto no cambia
// acá: este endpoint es el único lugar que, en el futuro, podrá otorgarlo,
// y solo después de validar la firma y consultar el recurso real en la
// API de Mercado Pago.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    // Fallar cerrado: sin secreto no se valida ni se procesa nada.
    return res.status(503).json({ status: 'configuration_incomplete' });
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  const dataId = req.body?.data?.id || req.query?.['data.id'] || req.query?.id;

  if (!xSignature || !xRequestId || !dataId) {
    console.warn('[mercadopago-webhook] notificación incompleta: falta x-signature, x-request-id o data.id');
    return res.status(400).json({ error: 'incomplete_notification' });
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId,
      secret,
      toleranceSeconds: 300,
    });
  } catch (err) {
    // Nunca loguear xSignature/secret — solo el motivo de rechazo del SDK.
    console.error('[mercadopago-webhook] firma rechazada:', err?.reason || err?.message || 'unknown');
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const eventType = req.body?.type || req.query?.type || 'unknown';
  console.log('[mercadopago-webhook] evento con firma válida recibido', { type: eventType, dataId });

  // TODO(FASE 1 → FASE 4, ver docs/subscriptions-audit/09-implementation-plan.md):
  // 1. INSERT en payment_provider_events con
  //    dedup_key = `mercadopago:${eventType}:${dataId}` — si ya existe, no
  //    reprocesar (idempotencia real).
  // 2. Consultar el recurso real en la API de Mercado Pago (nunca confiar
  //    ciegamente en el payload de la notificación).
  // 3. Actualizar subscriptions/payments/entitlements según corresponda.
  // 4. Encolar el email correspondiente en email_outbox.
  // Ninguna de esas tablas existe todavía en la base de producción, así
  // que hasta que se apliquen, este endpoint deliberadamente no escribe
  // nada ni concede ningún acceso — solo confirma recepción.
  return res.status(200).json({ received: true });
}
