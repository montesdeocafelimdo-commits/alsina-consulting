/* ALSINA — fuente única de precios de VISUALIZACIÓN (AD-01/AD-02/AD-03).
   Estos valores son solo para mostrar texto en la página — nunca se
   envían al backend ni determinan lo que se cobra: el importe real lo
   resuelve el servidor desde plan_prices (ver api/_lib/plans.js). Si
   cambia un precio acá y no en la base, lo que se muestra y lo que se
   cobra van a divergir — mantenerlos sincronizados a mano hasta que esta
   página también lea /api/plans (pendiente, no crítico mientras
   PAYMENTS_ENABLED=false). */
window.ALSINA_PRICING = {
  informeDesde: '$25.000',
  concejalMensual: 'Gratis',
  intendenteMensual: '$25.000',
  gobernadorMensual: '$45.000',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-precio="informe-desde"]').forEach(el => {
    el.textContent = window.ALSINA_PRICING.informeDesde;
  });
});
