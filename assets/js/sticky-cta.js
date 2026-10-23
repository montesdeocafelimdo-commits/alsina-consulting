/* ALSINA — barra/botón de suscripción flotante (Fase 7.3).
   Aparece al scrollear pasado el hero. Nunca se muestra si el
   visitante ya dejó el mail (misma señal que assets/js/gate.js).
   Al hacer click se expande en un capture inline (no navega), para
   poder trackear el alta con location:'sticky'. Desde 2026-10-23 el
   mail crea la cuenta gratis (assets/js/signup.js). */
(function () {
  const GIVEN_KEY = 'alsina_email_given';
  if (localStorage.getItem(GIVEN_KEY)) return;

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

  function init() {
    const hero = document.querySelector('.hero') || document.body.firstElementChild;
    const threshold = hero ? hero.offsetHeight * 0.9 : 400;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'alsina-sticky-cta';
    btn.textContent = 'Suscribirme gratis';

    btn.addEventListener('click', () => {
      btn.classList.add('expanded');
      btn.textContent = '';
      btn.innerHTML = `
        <div style="width:100%;">
          <form class="alsina-sticky-cta-form">
            <input type="email" class="alsina-sticky-cta-input" placeholder="tu@mail.com" required>
            <button type="submit" class="alsina-sticky-cta-submit">Enviar</button>
          </form>
          <div class="alsina-sticky-cta-status"></div>
        </div>
      `;
      const form = btn.querySelector('form');
      form.addEventListener('click', (e) => e.stopPropagation());
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const input = btn.querySelector('.alsina-sticky-cta-input');
        const submitBtn = btn.querySelector('.alsina-sticky-cta-submit');
        const status = btn.querySelector('.alsina-sticky-cta-status');
        const email = input.value.trim();
        submitBtn.disabled = true;
        submitBtn.textContent = '...';
        try {
          // Suscribirse = crear la cuenta gratis (ver assets/js/signup.js).
          const signup = await loadSignup();
          await signup.createAccount(email, 'sticky');
          status.textContent = '¡Listo! Revisá tu mail y activá tu cuenta.';
          setTimeout(() => btn.remove(), 4000);
        } catch (err) {
          status.textContent = 'Algo salió mal. Intentá de nuevo.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Enviar';
        }
      });
    }, { once: true });

    document.body.appendChild(btn);

    function onScroll() {
      if (localStorage.getItem(GIVEN_KEY)) {
        btn.remove();
        window.removeEventListener('scroll', onScroll);
        return;
      }
      btn.classList.toggle('show', window.scrollY > threshold);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
