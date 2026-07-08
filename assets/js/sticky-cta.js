/* ALSINA — barra/botón de suscripción flotante (Fase 7.3).
   Aparece al scrollear pasado el hero. Nunca se muestra si el
   visitante ya dejó el mail (misma señal que assets/js/gate.js).
   Al hacer click se expande en un capture inline (no navega), para
   poder trackear newsletter_signup con location:'sticky'. */
(function () {
  const GIVEN_KEY = 'alsina_email_given';
  if (localStorage.getItem(GIVEN_KEY)) return;

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
          const r = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await r.json();
          if (data.status === 'ok' || data.status === 'already_subscribed') {
            localStorage.setItem(GIVEN_KEY, '1');
            if (window.AlsinaAnalytics) window.AlsinaAnalytics.trackEvent('newsletter_signup', { location: 'sticky' });
            status.textContent = '¡Listo! Gracias.';
            setTimeout(() => btn.remove(), 1400);
          } else {
            throw new Error(data.error || 'Error');
          }
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
