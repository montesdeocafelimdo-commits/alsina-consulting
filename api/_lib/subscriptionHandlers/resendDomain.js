import { Resend } from 'resend';

// ALSINA — diagnóstico + activación puntual de las estadísticas de
// apertura/clics de Resend (2026-09-04). openTracking/clickTracking son
// una configuración a nivel DOMINIO en Resend (no por envío individual,
// ver UpdateDomainsOptions del SDK) — por eso esto vive separado del
// envío en sí. Gateado con CRON_SECRET.
//
// body: {} -> solo lista el estado actual (no cambia nada).
// body: { enable: true } -> prende openTracking y clickTracking para el
// dominio alsinaar.com si todavía no estaban activos.

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

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data: domains, error: listError } = await resend.domains.list();
  if (listError) return res.status(502).json({ error: listError.message });

  const domain = (domains?.data || []).find(d => d.name === 'alsinaar.com');
  if (!domain) return res.status(404).json({ error: 'dominio_no_encontrado', domains: domains?.data || [] });

  const { enable } = req.body || {};
  if (!enable) {
    // Se devuelve el objeto crudo tal cual lo manda Resend — el .d.ts
    // del SDK no declara los campos de tracking en la respuesta (solo
    // como input de .update()), así que no se adivina el nombre exacto
    // acá (¿open_tracking? ¿openTracking?). Mejor verlo tal cual es.
    return res.status(200).json({ status: 'ok', domainRaw: domain });
  }

  const { data: updated, error: updateError } = await resend.domains.update({ id: domain.id, openTracking: true, clickTracking: true });
  if (updateError) return res.status(502).json({ error: updateError.message });
  return res.status(200).json({ status: 'enabled', updatedResponseRaw: updated });
}
