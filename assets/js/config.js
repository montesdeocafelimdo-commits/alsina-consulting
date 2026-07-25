/* ALSINA — flags de configuración global.
   PAYMENTS_ENABLED se lee en vivo desde /api/config (que a su vez lee
   la env var del mismo nombre en Vercel). Activar pagos es SOLO
   cambiar esa variable de entorno — ninguna página estática ni este
   archivo necesitan tocarse. Mientras carga, se asume `false` (modo
   seguro por defecto). */
window.ALSINA_CONFIG = {
  PAYMENTS_ENABLED: false,
};

window.ALSINA_CONFIG_READY = fetch('/api/config')
  .then((r) => r.json())
  .then((data) => {
    window.ALSINA_CONFIG.PAYMENTS_ENABLED = !!data.paymentsEnabled;
    return window.ALSINA_CONFIG;
  })
  .catch(() => window.ALSINA_CONFIG);
