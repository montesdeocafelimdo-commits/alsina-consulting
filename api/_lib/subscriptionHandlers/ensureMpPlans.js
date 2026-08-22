import { ensureMpPlan, isTestModeMp } from '../plans.js';

// ALSINA — crea/verifica idempotentemente los preapproval_plan de
// Mercado Pago para Intendente y Gobernador en el entorno actual (test o
// producción, según el access token real — ver isTestModeMp()). No crea
// ninguna suscripción de cliente ni genera ningún cobro: un
// preapproval_plan es solo una plantilla. Gateado con CRON_SECRET, mismo
// nivel de confianza que el resto de api/_lib/subscriptionHandlers/selftest.js.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const testMode = isTestModeMp();
  const results = {};
  for (const slug of ['intendente', 'gobernador']) {
    results[slug] = await ensureMpPlan(slug);
  }

  return res.status(200).json({ testMode, results });
}
