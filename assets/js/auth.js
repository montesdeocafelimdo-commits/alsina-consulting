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
    // Si falló la carga (CDN caído, config que no llegó), no dejar la
    // promesa rechazada cacheada: el próximo intento vuelve a probar.
    clientPromise.catch(() => { clientPromise = null; });
    return clientPromise;
  }

  // 2026-11-27: antes todo error del alta mostraba "Algo salió mal" y no
  // quedaba registro del motivo (caso real: alguien no se pudo suscribir y
  // no hubo forma de saber por qué). Ahora cada error trae un mensaje
  // concreto en err.userMessage y se reporta a Plausible (signup_failed) y
  // a los logs de Vercel (/api/subscriptions/signup-error, solo el dominio
  // del mail, nunca la dirección completa).
  function describeSignupError(err) {
    const code = (err && err.code) || '';
    const status = err && err.status;
    const msg = String((err && err.message) || '');
    const wait = msg.match(/after (\d+) seconds?/i);
    if (wait) return `Ya te mandamos un mail hace instantes. Revisá tu casilla (también spam) o esperá ${wait[1]} segundos y probá de nuevo.`;
    if (code === 'over_email_send_rate_limit' || status === 429) return 'Estamos recibiendo muchas altas en este momento. Probá de nuevo en unos minutos; si sigue, escribinos a info@alsinaar.com.';
    if (code === 'email_address_invalid' || code === 'validation_failed' || (/invalid/i.test(msg) && /email/i.test(msg))) return 'Revisá que el mail esté bien escrito.';
    if (!status || status >= 500) return 'No pudimos conectarnos con el servidor. Probá de nuevo en unos minutos; si sigue, escribinos a info@alsinaar.com.';
    return 'No pudimos completar el alta. Probá de nuevo; si sigue, escribinos a info@alsinaar.com.';
  }

  function reportSignupError(err, email) {
    const info = {
      code: (err && err.code) || null,
      status: (err && typeof err.status === 'number') ? err.status : null,
      name: (err && err.name) || null,
      message: String((err && err.message) || err || '').slice(0, 300),
      domain: String(email || '').split('@')[1] || null,
      page: window.location.pathname,
    };
    try {
      if (window.AlsinaAnalytics) window.AlsinaAnalytics.trackEvent('signup_failed', { code: info.code || info.name || 'desconocido' });
    } catch (_) {}
    try {
      fetch('/api/subscriptions/signup-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  // Alta = login: un solo email, un solo botón, en todos lados del sitio.
  // No pide contraseña — el link de confirmación es la autenticación.
  // redirectPath opcional: a dónde vuelve el link (default /cuenta.html).
  // Lo usa planes.html para volver a sí misma y retomar un checkout que
  // quedó pendiente de crear la cuenta (alta directa a un plan pago).
  async function signInWithMagicLink(email, redirectPath) {
    try {
      const supa = await getClient();
      const redirectTo = `${window.location.origin}${redirectPath || '/cuenta.html'}`;
      const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      reportSignupError(e, email);
      e.userMessage = describeSignupError(e);
      throw e;
    }
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
