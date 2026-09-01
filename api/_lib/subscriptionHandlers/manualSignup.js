import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — alta manual de una cuenta cuando el magic link de Supabase Auth
// nunca le llegó a la persona (caso real 2026-09-01: reclamos puntuales de
// gente con @hotmail.com que nunca llegó a autenticarse — ni auth.users,
// ni profile, ni account — ver diag-account).
// Crea el usuario directo con auth.admin.createUser({email_confirm:true}),
// sin mandar ningún mail — dispara el mismo trigger on_auth_user_created
// (AD-04) que crea profile+account+subscription Concejal como en un alta
// normal. La persona puede loguearse después con el magic link normal
// (probá que le llegue una vez que exista la cuenta) o vía cualquier otro
// medio que uses para avisarle. Gateado con CRON_SECRET. body: { email }.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'email_invalido' });

  const supa = getSupabaseAdmin();

  const { data: existingProfile } = await supa.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (existingProfile) return res.status(409).json({ error: 'ya_existe_un_profile_para_este_mail' });

  const { data, error } = await supa.auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    // "already registered" acá significa que sí existe en auth.users pero
    // sin profile (el trigger falló en su momento) — caso distinto al de
    // "nunca se autenticó" que motivó este endpoint. No se repara solo:
    // hace falta ver por qué el trigger no corrió para ese user id.
    return res.status(409).json({ error: error.message, hint: 'si dice que ya existe, hay un auth.users huérfano sin profile — revisar el trigger on_auth_user_created para ese usuario a mano.' });
  }

  await supa.from('audit_logs').insert({
    actor_role: 'system',
    action: 'manual_signup_created',
    target_table: 'accounts',
    target_id: data.user.id,
    after: { email },
  });

  // Confirmar que el trigger efectivamente armó profile+account+subscription
  // (no asumirlo — si el trigger no corrió, mejor saberlo ahora).
  const { data: profile } = await supa.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
  const { data: account } = profile
    ? await supa.from('accounts').select('id').eq('owner_profile_id', profile.id).maybeSingle()
    : { data: null };

  return res.status(200).json({
    status: 'ok',
    email,
    userId: data.user.id,
    profileCreated: !!profile,
    accountCreated: !!account,
  });
}
