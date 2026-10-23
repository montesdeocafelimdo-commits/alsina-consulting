/* ALSINA — sistema de gating de contenido (Fase 5).
   Dos mecanismos independientes, ambos comparten la misma señal de
   "ya dejó el mail" (localStorage) para no pedirlo dos veces.
   Requiere que la página también incluya assets/js/config.js. */
(function () {
  const GIVEN_KEY = 'alsina_email_given';
  const SOFT_DISMISS_KEY = 'alsina_soft_gate_dismissed';

  function alreadyGiven() {
    return !!localStorage.getItem(GIVEN_KEY);
  }

  // Suscribirse = crear la cuenta gratis (assets/js/signup.js, 2026-10-23).
  // Antes posteaba a /api/subscribe, que escribe en una tabla `contacts`
  // que no existe en producción: cada alta fallaba.
  function loadSignup() {
    if (window.AlsinaSignup) return Promise.resolve(window.AlsinaSignup);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/assets/js/signup.js';
      s.onload = () => resolve(window.AlsinaSignup);
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function createAccount(email, location) {
    const signup = await loadSignup();
    await signup.createAccount(email, location);
  }

  // ── SOFT GATE — modal no bloqueante (Monitor 135, Mapa Político) ──
  function initSoftGate(opts) {
    opts = opts || {};
    const delayMs = opts.delayMs || 20000;
    const clicksNeeded = opts.clicksNeeded || 2;
    const interactionEl = opts.interactionEl || document.body;

    if (alreadyGiven() || sessionStorage.getItem(SOFT_DISMISS_KEY)) return;

    let shown = false;
    let clicks = 0;

    function show() {
      if (shown || alreadyGiven() || sessionStorage.getItem(SOFT_DISMISS_KEY)) return;
      shown = true;

      const modal = document.createElement('div');
      modal.className = 'alsina-soft-gate';
      modal.innerHTML = `
        <button type="button" class="alsina-soft-gate-close" aria-label="Cerrar">&times;</button>
        <div class="alsina-soft-gate-title">Seguí explorando gratis</div>
        <p class="alsina-soft-gate-sub">Creá tu cuenta gratis con tu mail: seguís explorando y recibís el newsletter de Alsina.</p>
        <form class="alsina-soft-gate-form">
          <input type="email" class="alsina-soft-gate-input" placeholder="tu@mail.com" required>
          <button type="submit" class="btn alsina-soft-gate-btn">Seguir →</button>
        </form>
        <div class="alsina-soft-gate-status"></div>
      `;
      document.body.appendChild(modal);
      requestAnimationFrame(() => modal.classList.add('open'));

      function dismiss() {
        sessionStorage.setItem(SOFT_DISMISS_KEY, '1');
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 300);
      }
      modal.querySelector('.alsina-soft-gate-close').addEventListener('click', dismiss);

      modal.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = modal.querySelector('.alsina-soft-gate-input');
        const btn = modal.querySelector('.alsina-soft-gate-btn');
        const status = modal.querySelector('.alsina-soft-gate-status');
        const email = input.value.trim();
        btn.disabled = true;
        btn.textContent = 'Enviando…';
        status.className = 'alsina-soft-gate-status';
        status.textContent = '';
        try {
          await createAccount(email, 'modal');
          status.className = 'alsina-soft-gate-status ok';
          status.textContent = '¡Listo! Revisá tu mail y hacé clic en el link para activar tu cuenta.';
          setTimeout(dismiss, 4000);
        } catch (err) {
          status.className = 'alsina-soft-gate-status err';
          status.textContent = 'Algo salió mal. Intentá de nuevo.';
          btn.disabled = false;
          btn.textContent = 'Seguir →';
        }
      });
    }

    setTimeout(show, delayMs);
    interactionEl.addEventListener('click', () => {
      clicks += 1;
      if (clicks >= clicksNeeded) show();
    });
  }

  // ── SCROLL GATE — corte con degradé al ~30% (notas largas) ──
  function initScrollGate(opts) {
    opts = opts || {};
    const threshold = opts.percent || 0.3;
    if (alreadyGiven()) return;

    let paymentsEnabled = !!(window.ALSINA_CONFIG && window.ALSINA_CONFIG.PAYMENTS_ENABLED);
    if (window.ALSINA_CONFIG_READY) {
      window.ALSINA_CONFIG_READY.then((cfg) => { paymentsEnabled = !!cfg.PAYMENTS_ENABLED; });
    }
    let triggered = false;

    function unlock(gate) {
      gate.classList.remove('open');
      setTimeout(() => gate.remove(), 400);
    }

    function lock() {
      if (triggered || alreadyGiven()) return;
      triggered = true;

      const gate = document.createElement('div');
      gate.className = 'alsina-scroll-gate';

      const body = paymentsEnabled
        ? `<div class="alsina-scroll-gate-title">Seguí leyendo con tu cuenta Alsina</div>
           <p class="alsina-scroll-gate-sub">Este informe completo es exclusivo para cuentas Alsina. Sumate gratis a Concejal o comprá este informe individual.</p>
           <div class="alsina-scroll-gate-actions">
             <a class="btn" href="/planes.html">Crear mi cuenta →</a>
             <a class="btn-ghost" href="/informes.html">Comprar este informe →</a>
           </div>`
        : `<div class="alsina-scroll-gate-title">Dejá tu mail y seguí leyendo gratis</div>
           <p class="alsina-scroll-gate-sub">El informe sigue completo más abajo. Un mail, una sola vez — no te lo volvemos a pedir.</p>
           <form class="alsina-scroll-gate-form">
             <input type="email" class="alsina-scroll-gate-input" placeholder="tu@mail.com" required>
             <button type="submit" class="btn">Seguir leyendo →</button>
           </form>
           <div class="alsina-scroll-gate-status"></div>`;

      gate.innerHTML = `<div class="alsina-scroll-gate-fade"></div><div class="alsina-scroll-gate-card">${body}</div>`;
      document.body.appendChild(gate);
      requestAnimationFrame(() => gate.classList.add('open'));

      const form = gate.querySelector('form');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = gate.querySelector('.alsina-scroll-gate-input');
          const btn = form.querySelector('button');
          const status = gate.querySelector('.alsina-scroll-gate-status');
          const email = input.value.trim();
          btn.disabled = true;
          btn.textContent = 'Enviando…';
          status.textContent = '';
          try {
            await createAccount(email, 'scroll_gate');
            unlock(gate);
          } catch (err) {
            status.className = 'alsina-scroll-gate-status err';
            status.textContent = 'Algo salió mal. Intentá de nuevo.';
            btn.disabled = false;
            btn.textContent = 'Seguir leyendo →';
          }
        });
      }
    }

    window.addEventListener('scroll', () => {
      if (triggered) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max >= threshold) lock();
    }, { passive: true });
  }

  window.AlsinaGate = { alreadyGiven, initSoftGate, initScrollGate, GIVEN_KEY };
})();
