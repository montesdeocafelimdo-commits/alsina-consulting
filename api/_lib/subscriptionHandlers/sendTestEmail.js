import { sendEmail, templates } from '../email.js';

// ALSINA — envío controlado de un email real, para verificar Resend +
// dominio verificado + remitentes correctos de punta a punta. Gateado
// con CRON_SECRET. body: { to }. Nunca se dispara solo — hay que pasarle
// la dirección explícitamente en cada llamada, no queda hardcodeada acá.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { to } = req.body || {};
  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'to_invalido' });
  }

  const result = await sendEmail({
    to,
    subject: 'Alsina — prueba controlada de email transaccional',
    html: templates.subscriptionActive('Intendente (prueba)'),
    templateKey: 'controlled_test',
    accountId: null,
    channel: 'transactional',
  });

  return res.status(200).json({ to, result });
}
