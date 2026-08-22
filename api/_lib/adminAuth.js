import { getSupabaseAdmin } from './supabaseAdmin.js';
import { getAuthenticatedAccount } from './auth.js';

// ALSINA — resolución de rol administrativo (AD-17). Ningún endpoint
// debe decidir "es admin" mirando el frontend — todo pasa por acá,
// contra la tabla admin_users con el service role.

/**
 * Devuelve { profileId, accountId, email, role } o null si quien pide
 * no tiene sesión válida o no está en admin_users. role es
 * 'super_admin' | 'partner'.
 */
export async function getAdmin(req) {
  const account = await getAuthenticatedAccount(req);
  if (!account) return null;

  const supa = getSupabaseAdmin();
  const { data, error } = await supa.from('admin_users').select('role').eq('profile_id', account.profileId).maybeSingle();
  if (error || !data) return null;

  return { ...account, role: data.role };
}

/** 401 si no hay sesión, 403 si hay sesión pero no es admin de ningún tipo. */
export async function requireAdmin(req, res) {
  const account = await getAuthenticatedAccount(req);
  if (!account) {
    res.status(401).json({ error: 'no_autenticado' });
    return null;
  }
  const supa = getSupabaseAdmin();
  const { data } = await supa.from('admin_users').select('role').eq('profile_id', account.profileId).maybeSingle();
  if (!data) {
    res.status(403).json({ error: 'no_autorizado' });
    return null;
  }
  return { ...account, role: data.role };
}

/** 403 si no es específicamente super_admin (partner incluido en el rechazo). */
export async function requireSuperAdmin(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return null;
  if (admin.role !== 'super_admin') {
    res.status(403).json({ error: 'requiere_super_admin' });
    return null;
  }
  return admin;
}
