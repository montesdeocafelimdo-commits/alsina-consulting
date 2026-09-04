import cancel from '../_lib/subscriptionHandlers/cancel.js';
import checkout from '../_lib/subscriptionHandlers/checkout.js';
import downgrade from '../_lib/subscriptionHandlers/downgrade.js';
import refund from '../_lib/subscriptionHandlers/refund.js';
import revertCancel from '../_lib/subscriptionHandlers/revert-cancel.js';
import revertDowngrade from '../_lib/subscriptionHandlers/revert-downgrade.js';
import upgrade from '../_lib/subscriptionHandlers/upgrade.js';
import selftest from '../_lib/subscriptionHandlers/selftest.js';
import ensureMpPlans from '../_lib/subscriptionHandlers/ensureMpPlans.js';
import sendTestEmail from '../_lib/subscriptionHandlers/sendTestEmail.js';
import fixIncomplete from '../_lib/subscriptionHandlers/fixIncomplete.js';
import grantAdmin from '../_lib/subscriptionHandlers/grantAdmin.js';
import testMagicLink from '../_lib/subscriptionHandlers/testMagicLink.js';
import diagRecent from '../_lib/subscriptionHandlers/diagRecent.js';
import reprocessPayment from '../_lib/subscriptionHandlers/reprocessPayment.js';
import diagPreapproval from '../_lib/subscriptionHandlers/diagPreapproval.js';
import diagPayment from '../_lib/subscriptionHandlers/diagPayment.js';
import restoreAccess from '../_lib/subscriptionHandlers/restoreAccess.js';
import grantPlan from '../_lib/subscriptionHandlers/grantPlan.js';
import diagAccount from '../_lib/subscriptionHandlers/diagAccount.js';
import manualSignup from '../_lib/subscriptionHandlers/manualSignup.js';
import deleteAccount from '../_lib/subscriptionHandlers/deleteAccount.js';
import generateLoginLink from '../_lib/subscriptionHandlers/generateLoginLink.js';
import diagPlan from '../_lib/subscriptionHandlers/diagPlan.js';
import diagMe from '../_lib/subscriptionHandlers/diagMe.js';
import diagContacts from '../_lib/subscriptionHandlers/diagContacts.js';
import unsubscribe from '../_lib/subscriptionHandlers/unsubscribe.js';
import sendNewsletter from '../_lib/subscriptionHandlers/sendNewsletter.js';
import resendDomain from '../_lib/subscriptionHandlers/resendDomain.js';

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
  'ensure-mp-plans': ensureMpPlans,
  'send-test-email': sendTestEmail,
  'fix-incomplete': fixIncomplete,
  'grant-admin': grantAdmin,
  'test-magic-link': testMagicLink,
  'diag-recent': diagRecent,
  'reprocess-payment': reprocessPayment,
  'diag-preapproval': diagPreapproval,
  'diag-payment': diagPayment,
  'restore-access': restoreAccess,
  'grant-plan': grantPlan,
  'diag-account': diagAccount,
  'manual-signup': manualSignup,
  'delete-account': deleteAccount,
  'generate-login-link': generateLoginLink,
  'diag-plan': diagPlan,
  'diag-me': diagMe,
  'diag-contacts': diagContacts,
  unsubscribe,
  'send-newsletter': sendNewsletter,
  'resend-domain': resendDomain,
};

export default async function handler(req, res) {
  const action = req.query?.action;
  const target = ACTIONS[action];
  if (!target) return res.status(404).json({ error: 'not_found' });
  return target(req, res);
}
