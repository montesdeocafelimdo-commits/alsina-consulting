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

  async function postSubscribe(email) {
    const r = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return r.json();
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
        <p class="alsina-soft-gate-sub">Dejá tu mail y no perdés el acceso — sumate a la Señal Alsina de paso.</p>
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
          const data = await postSubscribe(email);
          if (data.status === 'ok' || data.status === 'already_subscribed') {
            localStorage.setItem(GIVEN_KEY, '1');
            status.className = 'alsina-soft-gate-status ok';
            status.textContent = '¡Listo! Gracias.';
            setTimeout(dismiss, 1400);
          } else {
            throw new Error(data.error || 'Error');
          }
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

    const paymentsEnabled = !!(window.ALSINA_CONFIG && window.ALSINA_CONFIG.PAYMENTS_ENABLED);
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
        ? `<div class="alsina-scroll-gate-title">Seguí leyendo con Alsina Pro</div>
           <p class="alsina-scroll-gate-sub">Este informe completo es exclusivo para suscriptores. Sumate a Alsina Pro o comprá este informe individual.</p>
           <div class="alsina-scroll-gate-actions">
             <a class="btn" href="/index.html#precios">Suscribirme a Pro →</a>
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
            const data = await postSubscribe(email);
            if (data.status === 'ok' || data.status === 'already_subscribed') {
              localStorage.setItem(GIVEN_KEY, '1');
              unlock(gate);
            } else {
              throw new Error(data.error || 'Error');
            }
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
