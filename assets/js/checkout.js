/* ALSINA — activa el checkout real de Mercado Pago cuando
   PAYMENTS_ENABLED=true (leído desde /api/config, ver config.js).
   Mientras esté apagado (default) no hace nada: los botones siguen
   siendo las listas de espera ya construidas en las Fases 3 y 4. */
(function () {
  async function startCheckout(type, resource, email) {
    const r = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, resource, email }),
    });
    const data = await r.json();
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    return data;
  }

  function askEmail() {
    return (window.prompt('Tu email para continuar con el pago:') || '').trim();
  }

  // Botón único (ej. "Suscribirme a Pro") — <a data-checkout-type="pro">
  function wireButtons() {
    document.querySelectorAll('[data-checkout-type]').forEach((el) => {
      const type = el.dataset.checkoutType;
      const resource = el.dataset.checkoutResource || null;
      el.textContent = type === 'pro' ? 'Suscribirme a Pro →' : 'Comprar →';
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = askEmail();
        if (!email) return;
        const original = el.textContent;
        el.textContent = 'Redirigiendo…';
        try {
          await startCheckout(type, resource, email);
        } finally {
          el.textContent = original;
        }
      });
    });
  }

  // Formularios de lista de espera con data-checkout-resource — se
  // reemplazan por un botón de compra directa.
  function wireWaitlistForms() {
    document.querySelectorAll('form[data-checkout-resource]').forEach((form) => {
      const resource = form.dataset.checkoutResource;
      const btn = document.createElement('a');
      btn.className = 'btn';
      btn.href = '#';
      btn.textContent = 'Comprar →';
      btn.dataset.checkoutType = 'informe';
      btn.dataset.checkoutResource = resource;
      form.replaceWith(btn);
    });
  }

  async function init() {
    if (window.ALSINA_CONFIG_READY) await window.ALSINA_CONFIG_READY;
    if (!window.ALSINA_CONFIG || !window.ALSINA_CONFIG.PAYMENTS_ENABLED) return;
    wireWaitlistForms();
    wireButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
