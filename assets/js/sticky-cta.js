/* ALSINA — barra/botón de suscripción flotante (Fase 7.3).
   Aparece al scrollear pasado el hero. Nunca se muestra si el
   visitante ya dejó el mail (misma señal que assets/js/gate.js). */
(function () {
  const GIVEN_KEY = 'alsina_email_given';
  if (localStorage.getItem(GIVEN_KEY)) return;

  function init() {
    const hero = document.querySelector('.hero') || document.body.firstElementChild;
    const threshold = hero ? hero.offsetHeight * 0.9 : 400;

    const btn = document.createElement('a');
    btn.className = 'alsina-sticky-cta';
    btn.href = document.getElementById('precios') ? '#precios' : '/index.html#precios';
    btn.textContent = 'Suscribirme gratis';
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
