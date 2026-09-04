import { Resend } from 'resend';

// ALSINA — diagnóstico puntual: estado real de un email ya enviado por
// Resend (GET /emails/:id), incluido si tiene tracking pixel/links
// reescritos. Se armó para chequear si el envío del newsletter del
// 2026-09-04 (109 destinatarios) alcanzó a llevar tracking activo o no
// — se mandó mientras el dominio todavía tenía el subdominio de
// tracking sin verificar del todo. Gateado con CRON_SECRET.
// body: { id: '<resend email id>' }

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'resend_no_configurado' });

  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id_requerido' });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.get(id);
  if (error) return res.status(502).json({ error: error.message });
  return res.status(200).json({ status: 'ok', emailRaw: data });
}
