import dunning from '../_lib/cronHandlers/dunning.js';
import reconcile from '../_lib/cronHandlers/reconcile.js';

// Mismo motivo que api/subscriptions/[action].js: presupuesto de 12
// funciones del plan Hobby. vercel.json sigue apuntando a
// /api/cron/dunning y /api/cron/reconcile — Vercel resuelve el segmento
// dinámico igual, ninguna URL cambia.
const JOBS = { dunning, reconcile };

export default async function handler(req, res) {
  const job = req.query?.job;
  const target = JOBS[job];
  if (!target) return res.status(404).json({ error: 'not_found' });
  return target(req, res);
}
