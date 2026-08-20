import { createClient } from '@supabase/supabase-js';

// ALSINA — cliente administrativo único de Supabase (service-role).
// SOLO para uso server-side (funciones de /api). Nunca importar esto desde
// código que se sirve al navegador.
//
// Supabase migró su esquema de API keys: la clave administrativa moderna
// es SUPABASE_SECRET_KEY (reemplaza a la vieja SUPABASE_SERVICE_ROLE_KEY).
// Este proyecto tiene SUPABASE_SECRET_KEY cargada en Vercel desde hace
// semanas, pero todo el código seguía leyendo únicamente
// SUPABASE_SERVICE_ROLE_KEY — que no existe en el entorno — así que el
// cliente se estaba creando con una key `undefined` en Preview/Production.
// Ver docs/subscriptions-audit/ (hallazgo de la verificación de Vercel).
//
// Preferencia: SUPABASE_SECRET_KEY (moderna) > SUPABASE_SERVICE_ROLE_KEY
// (legacy, fallback temporal mientras se termina de migrar todo lo que
// pueda depender del nombre viejo — retirar el fallback una vez
// confirmado que ningún entorno depende de él).

let cachedClient = null;

function resolveAdminKey() {
  const modern = process.env.SUPABASE_SECRET_KEY;
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (modern) return { key: modern, source: 'SUPABASE_SECRET_KEY' };
  if (legacy) return { key: legacy, source: 'SUPABASE_SERVICE_ROLE_KEY (legacy fallback)' };
  return null;
}

/**
 * Devuelve un cliente de Supabase con privilegios administrativos
 * (service-role / secret key). Falla explícitamente si no hay ninguna
 * clave administrativa configurada — nunca crea un cliente con una key
 * `undefined` en silencio.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseAdmin() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL no está configurada en este entorno.');
  }

  const resolved = resolveAdminKey();
  if (!resolved) {
    // Nunca loguear el valor de nada acá — solo qué falta.
    throw new Error(
      'Falta la clave administrativa de Supabase: configurá SUPABASE_SECRET_KEY ' +
      '(o, temporalmente, SUPABASE_SERVICE_ROLE_KEY) en las variables de entorno de este proyecto.'
    );
  }

  if (resolved.source.includes('legacy')) {
    // Señal de auditoría no sensible (solo dice qué variable se usó, no
    // su valor) — ayuda a confirmar cuándo ya se puede retirar el fallback.
    console.warn('[supabaseAdmin] usando SUPABASE_SERVICE_ROLE_KEY como fallback legacy — migrar a SUPABASE_SECRET_KEY.');
  }

  cachedClient = createClient(url, resolved.key, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
