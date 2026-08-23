import metrics from '../_lib/adminHandlers/metrics.js';
import accounts from '../_lib/adminHandlers/accounts.js';
import cancelSubscription from '../_lib/adminHandlers/cancelSubscription.js';
import setViewAs from '../_lib/adminHandlers/setViewAs.js';

// ALSINA — ruta dinámica para /api/admin/* (mismo motivo que
// api/subscriptions/[action].js: límite de 12 Serverless Functions).
// metrics: super_admin y partner. accounts/cancel-subscription: solo
// super_admin (requireSuperAdmin adentro de cada handler, no acá).
const ACTIONS = {
  metrics,
  accounts,
  'cancel-subscription': cancelSubscription,
  'set-view-as': setViewAs,
};

export default async function handler(req, res) {
  const action = req.query?.action;
  const target = ACTIONS[action];
  if (!target) return res.status(404).json({ error: 'not_found' });
  return target(req, res);
}
