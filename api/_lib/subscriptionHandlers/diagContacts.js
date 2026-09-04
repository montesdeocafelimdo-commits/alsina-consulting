import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — diagnóstico puntual: estado real de la tabla contacts (altas
// de newsletter/leads). Gateado con CRON_SECRET. Se armó para preparar
// el primer envío real del newsletter por Resend (2026-09-04) — antes
// de armar el envío masivo hace falta saber exactamente a quién le
// llegaría y en qué estado están sus filas.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  const supa = getSupabaseAdmin();

  const { data: sample, error: sampleError } = await supa.from('contacts').select('*').limit(3);

  const { count: total } = await supa.from('contacts').select('id', { count: 'exact', head: true });
  const { count: confirmed } = await supa.from('contacts').select('id', { count: 'exact', head: true }).eq('confirmed', true);
  const { count: confirmedNewsletter } = await supa.from('contacts').select('id', { count: 'exact', head: true }).eq('confirmed', true).eq('source', 'newsletter');

  const { data: bySource } = await supa.from('contacts').select('source').eq('confirmed', true);
  const sourceCounts = {};
  for (const r of bySource || []) sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;

  return res.status(200).json({
    sampleRow: sample?.[0] || null,
    sampleError: sampleError?.message || null,
    columns: sample?.[0] ? Object.keys(sample[0]) : [],
    total,
    confirmed,
    confirmedNewsletterSource: confirmedNewsletter,
    confirmedBySource: sourceCounts,
  });
}
