import { getSupabaseAdmin } from './supabaseAdmin.js';

// ALSINA — resolución centralizada de capacidades (AD-22, prompt maestro).
// "Los recursos declaran capacidades y los planes conceden capacidades.
//  No dispersar reglas como plan === 'gobernador' por el código."
// Este es el ÚNICO lugar del backend que debe leer la tabla entitlements.

const LEVEL_RANK = { basic: 1, full: 2 };

// ── PROMO "mes de acceso libre" (pedido 2026-09-02) ──────────────────
// Mientras esté en true, cualquier cuenta logueada (Concejal incluido)
// resuelve TODAS las capacidades en 'full' — Monitor 135 completo,
// cualquier informe/recurso gateado por resource_features, todo — sin
// tocar plan_id/status real de nadie (la suscripción de fondo sigue
// intacta: quien ya paga sigue figurando como paga, y el checkout/
// upgrade normal sigue funcionando igual). Un visitante SIN cuenta
// sigue viendo el adelanto normal — el pedido fue "cualquiera con la
// suscripción gratuita", no cualquiera sin cuenta.
//
// A propósito NO tiene fecha de corte automática — "no le pongas un
// timer definido, yo te voy a decir cuando lo corregimos": para
// revertir, poner esta constante en `false` y pushear (además de sacar
// el banner de index.html, ver comentario ahí).
export const UNLOCK_ALL_PROMO_ACTIVE = true;

// BUG REAL en producción (2026-09-02, unas horas después del deploy de
// la promo): esto era una clase que solo implementaba .get() ("duck
// types" un Map) — pero api/account.js hace
// `Array.from(entitlements.entries())` para listar las capacidades de
// la cuenta, y .entries() no existía acá. Resultado: /api/account
// tiraba una excepción sin capturar para CUALQUIER cuenta logueada
// desde que la promo se activó — lo que rompía la pantalla de
// bienvenida (?welcome=1, que depende de /api/account) justo después
// de que alguien confirmaba su mail. Esto es, con altísima probabilidad,
// la causa real de "usuarios con problemas para suscribirse" reportada
// — las cuentas se creaban bien (el trigger de Postgres no depende de
// este endpoint), pero la persona se quedaba con la pantalla colgada
// después de loguearse.
//
// Fix: un Map real (no un duck-type) con todas las features conocidas
// en 'full' — compatible con .entries()/.keys()/.values()/for-of/
// spread/JSON.stringify, cualquier uso futuro de Map, no solo .get().
// Cacheado en memoria por poco tiempo (las features casi no cambian)
// para no consultar la tabla en cada request.
let unlockAllCache = null; // { map, fetchedAt }
const UNLOCK_ALL_CACHE_MS = 5 * 60 * 1000;

async function buildUnlockAllEntitlements(supa) {
  if (unlockAllCache && Date.now() - unlockAllCache.fetchedAt < UNLOCK_ALL_CACHE_MS) {
    return unlockAllCache.map;
  }
  const { data, error } = await supa.from('features').select('key');
  const map = new Map();
  if (error) {
    console.error('getEntitlements: no se pudo listar features para la promo:', error.message);
  } else {
    for (const f of data || []) if (f.key) map.set(f.key, 'full');
  }
  unlockAllCache = { map, fetchedAt: Date.now() };
  return map;
}

/**
 * Devuelve un Map<feature_key, level> con todo lo que la cuenta tiene
 * habilitado hoy (plan + accesos manuales vigentes). accountId puede ser
 * null (visitante anónimo) -> devuelve un Map vacío.
 */
export async function getEntitlements(accountId) {
  if (!accountId) return new Map();

  const supa = getSupabaseAdmin();

  // "Ver como" de super_admin (AD-17): nunca toca subscriptions ni
  // cobra nada — sustituye qué entitlements se le resuelven a ESE admin
  // para poder probar cada plan navegando. Cualquier otra cuenta sigue
  // el camino normal de abajo.
  const { data: account } = await supa.from('accounts').select('owner_profile_id').eq('id', accountId).maybeSingle();
  if (account) {
    const { data: adminRow } = await supa
      .from('admin_users')
      .select('role, view_as_plan')
      .eq('profile_id', account.owner_profile_id)
      .maybeSingle();
    if (adminRow?.role === 'super_admin' && adminRow.view_as_plan) {
      const { data: viewPlan } = await supa.from('plans').select('id').eq('slug', adminRow.view_as_plan).maybeSingle();
      if (viewPlan) {
        const { data: pf, error: pfError } = await supa.from('plan_features').select('level, features(key)').eq('plan_id', viewPlan.id);
        if (!pfError) {
          const viewMap = new Map();
          for (const row of pf || []) {
            const key = row.features?.key;
            if (key) viewMap.set(key, row.level);
          }
          return viewMap;
        }
      }
    }
  }

  // Ver nota arriba (UNLOCK_ALL_PROMO_ACTIVE) — después del "ver como" de
  // super_admin a propósito, para que esa herramienta de QA se pueda
  // seguir usando para probar cómo se ve cada plan durante la promo.
  if (UNLOCK_ALL_PROMO_ACTIVE) return buildUnlockAllEntitlements(supa);

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
