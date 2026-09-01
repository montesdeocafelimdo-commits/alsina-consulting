import { getSupabaseAdmin } from '../supabaseAdmin.js';

// ALSINA — borrado completo de una cuenta (perfil + cuenta + suscripción +
// todo lo que cuelga de ahí, más el usuario de auth.users). No hay
// cascade automático entre estas tablas — mismo orden de borrado que ya
// usa selftest.js para limpiar sus propias cuentas de prueba. Pensado
// para dar de baja cuentas creadas por error (ej. de prueba) o pedidos
// reales de baja de datos. Gateado con CRON_SECRET. body: { accountId }.
// Requiere el accountId exacto (no email) a propósito — evita borrar la
// cuenta equivocada por un typo de mail.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { accountId } = req.body || {};
  if (!accountId) return res.status(400).json({ error: 'accountId_requerido' });

  const supa = getSupabaseAdmin();
  const { data: account, error: accountError } = await supa.from('accounts').select('id, owner_profile_id').eq('id', accountId).maybeSingle();
  if (accountError || !account) return res.status(404).json({ error: 'cuenta_no_encontrada' });

  const cleanupErrors = [];
  let r;
  r = await supa.from('entitlements').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['entitlements', r.error.message]);
  r = await supa.from('subscriptions').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['subscriptions', r.error.message]);
  r = await supa.from('email_preferences').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['email_preferences', r.error.message]);
  r = await supa.from('email_outbox').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['email_outbox', r.error.message]);
  r = await supa.from('audit_logs').delete().eq('target_id', accountId); if (r.error) cleanupErrors.push(['audit_logs', r.error.message]);
  r = await supa.from('accounts').delete().eq('id', accountId); if (r.error) cleanupErrors.push(['accounts', r.error.message]);
  r = await supa.from('profiles').delete().eq('id', account.owner_profile_id); if (r.error) cleanupErrors.push(['profiles', r.error.message]);
  const { error: deleteUserError } = await supa.auth.admin.deleteUser(account.owner_profile_id);
  if (deleteUserError) cleanupErrors.push(['auth.deleteUser', deleteUserError.message]);

  return res.status(200).json({ status: cleanupErrors.length ? 'parcial' : 'ok', cleanupErrors });
}
