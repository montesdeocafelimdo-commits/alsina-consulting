import { createClient } from '@supabase/supabase-js';

// ALSINA — diagnóstico: reproduce signInWithOtp() del lado servidor para
// ver el error REAL que Supabase devuelve (el navegador lo mostraba
// genérico como "No pudimos enviar el mail"). Gateado con CRON_SECRET.
// body: { email }. OJO: si Supabase efectivamente puede mandarlo, esto
// manda un magic link real a esa dirección — usar solo con un email ya
// autorizado por quien pide el diagnóstico.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email_requerido' });

  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.SITE_URL || 'https://alsinaar.com'}/cuenta.html` },
  });

  return res.status(200).json({
    ok: !error,
    error: error ? { message: error.message, status: error.status, code: error.code || null } : null,
    data: data ? { user: !!data.user, session: !!data.session } : null,
  });
}
