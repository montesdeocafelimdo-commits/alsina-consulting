/* ALSINA — Plausible Analytics (sin banner de cookies: no usa
   cookies ni almacenamiento persistente para trackear visitantes).
   El equipo solo necesita crear la cuenta en plausible.io y agregar
   el dominio alsinaar.com — este script y el <script> de carga en el
   <head> de cada página ya están listos, cero cambios de código.

   Eventos del funnel de suscripción (auditoría 2026-08-25, ver
   docs/subscriptions-audit/14-*.md):
   - signup_started / signup_completed {location, plan}
   - email_confirmation_completed
   - plan_viewed {plan}
   - plan_selected {plan}
   - checkout_started / checkout_completed / checkout_abandoned {plan}
   - upgrade_clicked {from, to}
   - monitor_open / informes_view
   - waitlist_signup {resource} / checkout_start {type, resource} (informes sueltos, api/checkout.js) */
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

  // Vuelta desde Mercado Pago tras un pago aprobado (back_url de
  // api/checkout.js, informes sueltos) — ver ?compra=ok en informes.html.
  const params = new URLSearchParams(location.search);
  if (params.get('compra') === 'ok') {
    trackEvent('checkout_success');
  }
});
