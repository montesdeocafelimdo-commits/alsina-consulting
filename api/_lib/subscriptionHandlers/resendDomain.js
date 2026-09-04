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

  const { enable, trackingSubdomain, verify } = req.body || {};

  if (verify) {
    const { data: verified, error: verifyError } = await resend.domains.verify(domain.id);
    return res.status(200).json({ status: verifyError ? 'error' : 'verify_requested', verified, verifyError: verifyError?.message || null });
  }

  if (!enable) {
    // Se devuelve el objeto crudo tal cual lo manda Resend — el .d.ts
    // del SDK no declara los campos de tracking en la respuesta (solo
    // como input de .update()), así que no se adivina el nombre exacto
    // acá (¿open_tracking? ¿openTracking?). Mejor verlo tal cual es.
    // Se compara list() contra get(id) — encontramos que list() puede
    // quedar desactualizado después de un update (2026-09-04).
    const { data: viaGet, error: getError } = await resend.domains.get(domain.id);
    return res.status(200).json({ status: 'ok', domainRawFromList: domain, domainRawFromGet: viaGet, getError: getError?.message || null });
  }

  // BUG REAL encontrado (2026-09-04): resend.domains.update() del SDK
  // (v4.8.0) solo manda click_tracking/open_tracking/tls al PATCH real —
  // nunca tracking_subdomain, aunque la API sí lo acepta y lo necesita
  // (activar tracking exige un CNAME de tracking, que solo se genera si
  // se manda tracking_subdomain). El .d.ts tampoco lo declara. Por eso
  // acá se llama al REST de Resend directo, sin pasar por el SDK, para
  // este único caso puntual.
  const r = await fetch(`https://api.resend.com/domains/${domain.id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ open_tracking: true, click_tracking: true, tracking_subdomain: trackingSubdomain || 'links' }),
  });
  const body = await r.json();
  if (!r.ok) return res.status(502).json({ error: body });

  // El registro DNS "Tracking" que hay que agregar (CNAME) recién existe
  // después de este PATCH — se devuelve el dominio actualizado (get) para
  // verlo, junto con el paso que falta: agregar ese CNAME en el proveedor
  // de DNS real (fuera de Resend) y después llamar acá con {"verify":true}.
  const { data: afterUpdate } = await resend.domains.get(domain.id);
  return res.status(200).json({
    status: 'enabled_pending_dns',
    patchResponse: body,
    domainAfterUpdate: afterUpdate,
    next: 'Agregar el registro CNAME "Tracking" que aparece en domainAfterUpdate.records en el proveedor de DNS real de alsinaar.com. Después, llamar de nuevo con {"verify":true} para que Resend lo confirme — el tracking recién queda activo cuando ese CNAME está verificado.',
  });
}
