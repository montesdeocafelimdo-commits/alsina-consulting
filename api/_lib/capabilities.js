import { getSupabaseAdmin } from './supabaseAdmin.js';

// ALSINA — resolución centralizada de capacidades (AD-22, prompt maestro).
// "Los recursos declaran capacidades y los planes conceden capacidades.
//  No dispersar reglas como plan === 'gobernador' por el código."
// Este es el ÚNICO lugar del backend que debe leer la tabla entitlements.

const LEVEL_RANK = { basic: 1, full: 2 };

/**
 * Devuelve un Map<feature_key, level> con todo lo que la cuenta tiene
 * habilitado hoy (plan + accesos manuales vigentes). accountId puede ser
 * null (visitante anónimo) -> devuelve un Map vacío.
 */
export async function getEntitlements(accountId) {
  if (!accountId) return new Map();

  const supa = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supa
    .from('entitlements')
    .select('level, valid_until, features(key)')
    .eq('account_id', accountId)
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`);

  if (error) {
    console.error('getEntitlements error:', error.message);
    return new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    const key = row.features?.key;
    if (!key) continue;
    const current = map.get(key);
    // Si hay más de un entitlement para la misma capacidad (ej. plan +
    // acceso manual), se queda con el nivel más alto.
    if (!current || LEVEL_RANK[row.level] > LEVEL_RANK[current]) {
      map.set(key, row.level);
    }
  }
  return map;
}

/**
 * ¿La cuenta tiene la capacidad pedida, en al menos el nivel pedido?
 * requiredLevel por defecto 'basic' (alcanza con cualquier nivel).
 */
export function hasCapability(entitlementsMap, featureKey, requiredLevel = 'basic') {
  const level = entitlementsMap.get(featureKey);
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[requiredLevel];
}

/**
 * Resuelve qué nivel de acceso tiene una cuenta (o un visitante) sobre un
 * recurso puntual, consultando resource_features. Un recurso sin fila en
 * resource_features es público (AD-18) -> devuelve 'full' para cualquiera.
 *
 * @returns {Promise<'none'|'basic'|'full'>}
 */
export async function getResourceAccessLevel(accountId, resourceSlug) {
  const supa = getSupabaseAdmin();
  const { data: resource, error: resourceError } = await supa
    .from('resources')
    .select('id')
    .eq('slug', resourceSlug)
    .maybeSingle();

  if (resourceError || !resource) {
    // Recurso no catalogado: por diseño, tratarlo como público antes que
    // bloquear contenido por accidente (ver 10-access-decision-matrix.md,
    // "no restrinjas las notas públicas por accidente").
    return 'full';
  }

  const { data: requirements, error: reqError } = await supa
    .from('resource_features')
    .select('required_level, features(key)')
    .eq('resource_id', resource.id);

  if (reqError) {
    console.error('getResourceAccessLevel error:', reqError.message);
    return 'none';
  }
  if (!requirements || requirements.length === 0) return 'full'; // público

  const entitlements = await getEntitlements(accountId);
  const satisfiesAny = requirements.some((r) =>
    hasCapability(entitlements, r.features?.key, r.required_level)
  );
  return satisfiesAny ? 'full' : 'none';
}
