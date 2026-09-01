// ALSINA — diagnóstico puntual: consulta un preapproval_plan (plantilla)
// por su propio ID directo contra la API de Mercado Pago. Gateado con
// CRON_SECRET. Se armó para investigar "The template with id X does not
// exist" (2026-09-01) — ensureMpPlan() decía haber creado/verificado la
// plantilla, pero preapproval.create() la rechazaba igual.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: 'id_requerido' });
  const r = await fetch(`https://api.mercadopago.com/preapproval_plan/${id}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  const body = await r.json();
  return res.status(200).json({ httpStatus: r.status, body, usingTestToken: (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-') });
}
