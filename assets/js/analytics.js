/* ALSINA — Plausible Analytics (sin banner de cookies: no usa
   cookies ni almacenamiento persistente para trackear visitantes).
   El equipo solo necesita crear la cuenta en plausible.io y agregar
   el dominio alsinaar.com — este script y el <script> de carga en el
   <head> de cada página ya están listos, cero cambios de código.

   Eventos mínimos (Fase 8.3):
   - newsletter_signup {location: hero|final|modal|sticky}
   - monitor_open
   - informes_view
   - waitlist_signup {resource}
   - checkout_start {type, resource}
   - checkout_success
   - pro_click */
window.plausible =
  window.plausible ||
  function () {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };

function trackEvent(name, props) {
  window.plausible(name, props ? { props } : undefined);
}
window.AlsinaAnalytics = { trackEvent };

document.addEventListener('DOMContentLoaded', () => {
  // Evento de página declarado por la propia página: <body data-track-event="monitor_open">
  const pageEvent = document.body.dataset.trackEvent;
  if (pageEvent) trackEvent(pageEvent);

  // Cualquier botón/link de Alsina Pro dispara pro_click, esté o no
  // activado el checkout real.
  document.querySelectorAll('[data-checkout-type="pro"]').forEach((el) => {
    el.addEventListener('click', () => trackEvent('pro_click'));
  });

  // Vuelta desde Mercado Pago tras un pago aprobado (back_urls de
  // api/checkout.js) — ver ?compra=ok en informes.html y ?pro=ok en index.html.
  const params = new URLSearchParams(location.search);
  if (params.get('compra') === 'ok' || params.get('pro') === 'ok') {
    trackEvent('checkout_success');
  }
});
