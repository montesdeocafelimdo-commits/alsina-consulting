/* ALSINA — alta de cuenta Concejal desde cualquier botón de suscripción
   (2026-10-23). Suscribirse al newsletter = crear la cuenta gratis: mismo
   magic link que handleConcejalSignup() de index.html/newsletter.html, y
   la cuenta nueva ya queda con el newsletter activado
   (email_preferences.editorial_opt_in = true).
   Lo cargan solos assets/js/sticky-cta.js y assets/js/gate.js. Muchas
   páginas no incluyen config.js/auth.js, así que los carga si faltan. */
(function () {
  if (window.AlsinaSignup) return;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureAuth() {
    if (!window.ALSINA_CONFIG_READY) await loadScript('/assets/js/config.js');
    if (!window.AlsinaAuth) await loadScript('/assets/js/auth.js');
    return window.AlsinaAuth;
  }

  async function createAccount(email, location) {
    const track = (name) => {
      if (window.AlsinaAnalytics) window.AlsinaAnalytics.trackEvent(name, { location, plan: 'concejal' });
    };
    track('signup_started');
    const auth = await ensureAuth();
    await auth.signInWithMagicLink(email, '/cuenta.html?welcome=1');
    localStorage.setItem('alsina_email_given', '1');
    track('signup_completed');
  }

  window.AlsinaSignup = { createAccount };
})();
