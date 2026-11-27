// ALSINA — registro de errores del alta (2026-11-27). Lo llama
// assets/js/auth.js cada vez que Supabase rechaza un alta o el navegador no
// llega a pedirla. Solo escribe una línea en los logs de Vercel (buscar
// "[signup-error]"): no toca la base, así que funciona aunque Supabase esté
// pausado. Público a propósito (lo llama cualquier visitante); por eso todo
// se recorta y nunca se guarda el mail completo, solo el dominio.

const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const b = (req.body && typeof req.body === 'object') ? req.body : {};
  const entry = {
    code: clip(b.code, 60),
    status: Number.isFinite(b.status) ? b.status : null,
    name: clip(b.name, 60),
    message: clip(b.message, 300),
    domain: clip(b.domain, 100),
    page: clip(b.page, 120),
    ua: clip(req.headers['user-agent'], 160),
  };
  console.warn('[signup-error]', JSON.stringify(entry));
  return res.status(204).end();
}
