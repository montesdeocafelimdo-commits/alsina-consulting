/* ALSINA — fuente única de precios.
   Cambiar acá impacta todas las páginas que incluyan este script. */
window.ALSINA_PRICING = {
  informeDesde: '$25.000',
  proMensual: '$45.000',
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-precio="informe-desde"]').forEach(el => {
    el.textContent = window.ALSINA_PRICING.informeDesde;
  });
  document.querySelectorAll('[data-precio="pro-mensual"]').forEach(el => {
    el.textContent = window.ALSINA_PRICING.proMensual;
  });
});
