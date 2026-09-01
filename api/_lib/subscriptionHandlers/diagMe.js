// ALSINA — diagnóstico puntual: consulta GET /users/me contra la API de
// Mercado Pago con nuestro propio MP_ACCESS_TOKEN — para ver a qué "site"
// (país) está registrado nuestro propio collector. Gateado con
// CRON_SECRET. Se armó para investigar "Payer is associated with a
// different site" (2026-09-01): si nuestro propio collector no está en
// site_id MLA (Argentina), eso explicaría el rechazo sin que sea nada
// del lado de quien paga.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  const r = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  const body = await r.json();
  return res.status(200).json({
    httpStatus: r.status,
    id: body.id,
    site_id: body.site_id,
    country_id: body.country_id,
    live_mode: body.live_mode,
    tags: body.tags,
  });
}
