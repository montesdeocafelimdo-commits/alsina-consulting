import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — diagnóstico puntual: estado completo (profile/account/
// subscription) de una cuenta por email. Gateado con CRON_SECRET.
// Se armó para investigar reclamos de gente que dice no poder acceder
// al plan gratis (Concejal) — para distinguir entre "nunca llegó a
// registrarse" (sin profile) y "se registró pero algo quedó a medias"
// (profile sin account/subscription, normalmente creados juntos por el
// trigger on_auth_user_created — AD-04).

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;
  const email = (req.query?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'email_requerido' });

  const supa = getSupabaseAdmin();

  const { data: profile, error: profileError } = await supa
    .from('profiles').select('*').ilike('email', email).maybeSingle();

  if (profileError || !profile) {
    // Sin profile puede significar dos cosas bien distintas: (a) nunca
    // llegó a autenticarse (nunca existió como auth.users), o (b) sí se
    // autenticó pero el trigger on_auth_user_created (AD-04, crea
    // profile+account+subscription juntos) falló para esta persona —
    // dejaría un auth.users huérfano, sin nada más. Se busca directo en
    // auth.users (la API de administración no filtra por email, así que
    // se pagina) para distinguir un caso del otro.
    let authUser = null;
    try {
      for (let page = 1; page <= 5; page++) {
        const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
        if (error || !data?.users?.length) break;
        authUser = data.users.find((u) => (u.email || '').toLowerCase() === email) || null;
        if (authUser || data.users.length < 1000) break;
      }
    } catch (e) {
      console.error('diag-account: error buscando en auth.users:', e.message);
    }
    return res.status(200).json({
      found: false,
      profile: null,
      account: null,
      subscription: null,
      profileError: profileError?.message || null,
      authUser: authUser ? { id: authUser.id, email: authUser.email, created_at: authUser.created_at, confirmed_at: authUser.confirmed_at || authUser.email_confirmed_at, last_sign_in_at: authUser.last_sign_in_at } : null,
    });
  }

  const { data: account, error: accountError } = await supa
    .from('accounts').select('*').eq('owner_profile_id', profile.id).maybeSingle();

  let subscription = null, subError = null;
  if (account) {
    const r = await supa
      .from('subscriptions').select('*, plans!plan_id(name, slug)').eq('account_id', account.id).maybeSingle();
    subscription = r.data;
    subError = r.error?.message || null;
  }

  // profile.id === auth.users.id (AD-04) — útil para saber si esta
  // persona alguna vez completó un login real (last_sign_in_at) o si
  // el registro le quedó "confirmado" sin que ella hiciera nada (ver
  // nota de manual-signup.js).
  let authUser = null;
  try {
    const { data: authData } = await supa.auth.admin.getUserById(profile.id);
    if (authData?.user) {
      const u = authData.user;
      authUser = { id: u.id, email: u.email, created_at: u.created_at, confirmed_at: u.confirmed_at || u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at };
    }
  } catch (e) {
    console.error('diag-account: error en getUserById:', e.message);
  }

  return res.status(200).json({
    found: true,
    profile,
    account: account || null,
    accountError: accountError?.message || null,
    subscription,
    subError,
    authUser,
  });
}
