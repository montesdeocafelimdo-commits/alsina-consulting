import { getSupabaseAdmin } from './supabaseAdmin.js';

// ALSINA — resolución de identidad server-side (FASE 2).
// El frontend nunca es la autoridad para conceder acceso (prompt maestro,
// FASE 2): esta función es el único lugar que traduce un "Authorization:
// Bearer <token>" en una cuenta real, validando el JWT contra Supabase
// Auth en el servidor.

/**
 * Extrae y valida el JWT de Supabase Auth del header Authorization.
 * Devuelve { profileId, accountId, email } o null si no hay sesión válida.
 * Nunca lanza por falta de sesión — la ausencia de sesión es un caso
 * normal (visitante anónimo), no un error.
 */
export async function getAuthenticatedAccount(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const supa = getSupabaseAdmin();
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: account, error: accountError } = await supa
    .from('accounts')
    .select('id')
    .eq('owner_profile_id', data.user.id)
    .maybeSingle();
  if (accountError || !account) return null;

  return { profileId: data.user.id, accountId: account.id, email: data.user.email };
}

/**
 * Igual que getAuthenticatedAccount, pero responde 401 y devuelve null si
 * no hay sesión — para endpoints que requieren estar logueado.
 */
export async function requireAuthenticatedAccount(req, res) {
  const account = await getAuthenticatedAccount(req);
  if (!account) {
    res.status(401).json({ error: 'no_autenticado' });
    return null;
  }
  return account;
}
