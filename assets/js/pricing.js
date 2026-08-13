/* ALSINA — fuente única de precios.
   Cambiar acá impacta todas las páginas que incluyan este script. Si
   cambia informeDesde, actualizar también: api/checkout.js (PRICES) y
   el JSON-LD de Product en informes.html (el precio no puede leerse
   de JS porque los crawlers de datos estructurados no ejecutan
   scripts de forma confiable). */
window.ALSINA_PRICING = {
  informeDesde: '$25.000',
  proMensual: '$45.000',
  intendenteMensual: 'Gratis',
  ministroMensual: '$25.000',
  gobernadorMensual: '$45.000',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-precio="informe-desde"]').forEach(el => {
    el.textContent = window.ALSINA_PRICING.informeDesde;
  });
  document.querySelectorAll('[data-precio="pro-mensual"]').forEach(el => {
    el.textContent = window.ALSINA_PRICING.proMensual;
  });
});
