/* ALSINA — reveal sutil al hacer scroll + counters animados.
   Fallback sin JS: los elementos .reveal ya son visibles por defecto
   (la clase que los oculta la agrega este mismo script), y los
   contadores muestran su valor final como contenido estático en el
   HTML — animar es una mejora, no un requisito para leer la página. */
(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (prefersReducedMotion) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    els.forEach((el) => el.classList.add('reveal-pending'));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
  }

  function initCounters() {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length || prefersReducedMotion) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          const el = entry.target;
          const target = parseFloat(el.dataset.count);
          if (!target) return;
          const duration = 1100;
          const start = performance.now();
          function tick(now) {
            const p = Math.min((now - start) / duration, 1);
            el.textContent = Math.floor(p * target).toLocaleString('es-AR');
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = target.toLocaleString('es-AR');
          }
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.5 }
    );
    els.forEach((el) => io.observe(el));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initReveal();
      initCounters();
    });
  } else {
    initReveal();
    initCounters();
  }
})();
