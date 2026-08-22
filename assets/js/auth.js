/* ALSINA — sesión de usuario (FASE 2, AD-04).
   Suscribirse a Señal Alsina = crear la cuenta Concejal: un solo flujo,
   por magic link. Requiere que la página incluya antes
   assets/js/config.js (expone SUPABASE_URL/SUPABASE_ANON_KEY vía
   /api/config). El cliente de Supabase se carga perezosamente desde un
   CDN — este sitio no tiene build step, no hay bundler que lo empaquete
   localmente. */
(function () {
  let clientPromise = null;

  async function getClient() {
    if (clientPromise) return clientPromise;
    clientPromise = (async () => {
      if (window.ALSINA_CONFIG_READY) await window.ALSINA_CONFIG_READY;
      const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.ALSINA_CONFIG || {};
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        throw new Error('Supabase no está configurado en este entorno.');
      }
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    })();
    return clientPromise;
  }

  // Alta = login: un solo email, un solo botón, en todos lados del sitio.
  // No pide contraseña — el link de confirmación es la autenticación.
  async function signInWithMagicLink(email) {
    const supa = await getClient();
    const redirectTo = `${window.location.origin}/cuenta.html`;
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return { status: 'ok' };
  }

  async function getSession() {
    const supa = await getClient();
    const { data } = await supa.auth.getSession();
    return data?.session || null;
  }

  async function getAccessToken() {
    const session = await getSession();
    return session?.access_token || null;
  }

  async function signOut() {
    const supa = await getClient();
    await supa.auth.signOut();
  }

  async function onAuthStateChange(callback) {
    const supa = await getClient();
    return supa.auth.onAuthStateChange((event, session) => callback(event, session));
  }

  // Helper para el resto del sitio: pega el Authorization header si hay
  // sesión, sin forzar a cada script a saber cómo se guarda el token.
  async function authedFetch(url, options) {
    const token = await getAccessToken();
    const headers = Object.assign({}, (options && options.headers) || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(url, Object.assign({}, options, { headers }));
  }

  window.AlsinaAuth = {
    signInWithMagicLink,
    getSession,
    getAccessToken,
    signOut,
    onAuthStateChange,
    authedFetch,
  };
})();
