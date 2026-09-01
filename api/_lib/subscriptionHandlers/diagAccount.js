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
    return res.status(200).json({ found: false, profile: null, account: null, subscription: null, profileError: profileError?.message || null });
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

  return res.status(200).json({
    found: true,
    profile,
    account: account || null,
    accountError: accountError?.message || null,
    subscription,
    subError,
  });
}
