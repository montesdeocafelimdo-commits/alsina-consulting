// ALSINA — ruta legacy, retirada (AD-07).
//
// Este archivo era el webhook original de Mercado Pago. Tenía un defecto
// de seguridad señalado explícitamente en la auditoría (11-approved-
// decisions.md, AD-07): si faltaba MP_WEBHOOK_SECRET, dejaba pasar la
// notificación sin verificar la firma ("fail open") en vez de rechazarla.
//
// /api/mercadopago-webhook.js es ahora el único endpoint definitivo:
// falla cerrado sin secreto, verifica firma siempre, es idempotente y
// re-consulta el estado real en Mercado Pago antes de tocar la base.
// Este archivo re-exporta ese mismo handler para no romper una
// notification_url vieja que pudiera seguir apuntando acá (en vez de
// duplicar lógica que podría divergir).
export { default } from './mercadopago-webhook.js';
