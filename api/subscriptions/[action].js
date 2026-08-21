import cancel from '../_lib/subscriptionHandlers/cancel.js';
import checkout from '../_lib/subscriptionHandlers/checkout.js';
import downgrade from '../_lib/subscriptionHandlers/downgrade.js';
import refund from '../_lib/subscriptionHandlers/refund.js';
import revertCancel from '../_lib/subscriptionHandlers/revert-cancel.js';
import revertDowngrade from '../_lib/subscriptionHandlers/revert-downgrade.js';
import upgrade from '../_lib/subscriptionHandlers/upgrade.js';
import selftest from '../_lib/subscriptionHandlers/selftest.js';

// ALSINA — un solo archivo de ruta dinámica para /api/subscriptions/*.
//
// El Hobby plan de Vercel limita a 12 Serverless Functions por deploy —
// siete endpoints de suscripción sueltos superaban el límite (ver
// discusión en la conversación al desplegar la Preview). Vercel enruta
// [action].js de forma transparente: la URL pública sigue siendo
// /api/subscriptions/cancel, /api/subscriptions/checkout, etc. — nada
// cambia para el frontend (assets/js/*, planes.html, cuenta.html no se
// tocan). La lógica de cada acción es exactamente la misma, movida sin
// cambios a api/_lib/subscriptionHandlers/ (que no cuenta como ruta —
// los directorios con "_" están excluidos del router de Vercel).
const ACTIONS = {
  cancel,
  checkout,
  downgrade,
  refund,
  'revert-cancel': revertCancel,
  'revert-downgrade': revertDowngrade,
  upgrade,
  // Diagnóstico interno gateado con CRON_SECRET — ver
  // api/_lib/subscriptionHandlers/selftest.js. No es una acción de
  // negocio; no aparece en ningún lugar del frontend.
  selftest,
};

export default async function handler(req, res) {
  const action = req.query?.action;
  const target = ACTIONS[action];
  if (!target) return res.status(404).json({ error: 'not_found' });
  return target(req, res);
}
