import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — genera un link de acceso directo (magic link) para una cuenta
// existente, sin depender de que Supabase le mande el mail a la persona.
// Pensado para casos como el de 2026-09-01: gente cuyo magic link nunca
// llegó (sospecha de deliverability con Hotmail/Outlook) — acá se genera
// el link y se lo manda uno mismo por el canal que sea (WhatsApp, mail
// desde otra cuenta, etc.), evitando depender de nuevo del mismo envío
// que ya falló. admin.generateLink() solo genera el link — no manda
// ningún mail (a diferencia de signInWithMagicLink del lado del cliente).
// Gateado con CRON_SECRET. body: { email, redirectTo? }.
//
// El link es de un solo uso y expira (misma validez que cualquier OTP de
// Supabase Auth) — generarlo justo antes de mandarlo, no de antemano.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email_requerido' });
  const redirectTo = req.body?.redirectTo || 'https://www.alsinaar.com/cuenta.html?welcome=1';

  const supa = getSupabaseAdmin();
  const { data: profile } = await supa.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (!profile) return res.status(404).json({ error: 'sin_cuenta_para_este_mail' });

  const { data, error } = await supa.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
  if (error) return res.status(502).json({ error: error.message });

  return res.status(200).json({ status: 'ok', email, actionLink: data?.properties?.action_link || null });
}
