/* ALSINA — catálogo único de planes para el frontend (Concejal/Intendente/
   Gobernador). Fuente canónica de nombres, precios y accesos reales que ya
   se venían tipeando por separado en planes.html/index.html — se extrajo
   acá tal cual estaba (mismo texto, mismo orden), sin agregar ni inventar
   ningún beneficio nuevo, para que la ficha de bienvenida (cuenta.html) y
   la landing de planes (planes.html) lean de un solo lugar.

   El precio/estado REAL de una cuenta puntual sigue viniendo siempre de
   /api/account (Supabase) — esto es solo el catálogo estático de lo que
   cada plan incluye, para copy y presentación, nunca para decidir acceso. */
(function () {
  window.ALSINA_PLANS = {
    concejal: {
      slug: 'concejal',
      name: 'Concejal',
      price: 0,
      priceLabel: 'Gratis',
      periodicity: null,
      tag: null,
      tagline: 'Para entrar sin costo',
      includesFrom: null,
      granted: [
        { icon: 'mail', label: 'Señal Alsina (newsletter quincenal)' },
        { icon: 'chart', label: 'Monitor 135 + indicadores principales' },
        { icon: 'doc', label: 'Notas e informes públicos' },
      ],
      locked: [
        { label: 'Consulta municipal completa' },
        { label: 'Indicadores avanzados y comparación entre municipios' },
      ],
    },
    intendente: {
      slug: 'intendente',
      name: 'Intendente',
      price: 25000,
      priceLabel: '$25.000',
      periodicity: '/mes',
      currency: 'ARS',
      tag: 'Precio fundador',
      tagline: 'Para seguir la gestión con datos completos',
      includesFrom: 'concejal',
      granted: [
        { icon: 'chart', label: 'Monitor 135 completo, sin recortes' },
        { icon: 'compare', label: 'Comparación entre municipios' },
        { icon: 'bank', label: 'Balance fiscal e Indicadores fiscales municipales' },
        { icon: 'doc', label: 'Recaudación tributaria y Transferencias a municipios' },
      ],
      locked: [
        { label: 'Descarga y exportación de bases' },
        { label: 'Archivo completo de informes' },
      ],
    },
    gobernador: {
      slug: 'gobernador',
      name: 'Gobernador',
      price: 45000,
      priceLabel: '$45.000',
      periodicity: '/mes',
      currency: 'ARS',
      tag: 'Precio fundador',
      tagline: 'El laboratorio de datos entero, sin límites',
      includesFrom: 'intendente',
      granted: [
        { icon: 'download', label: 'Descarga y exportación de bases completas' },
        { icon: 'archive', label: 'Archivo completo de informes' },
        { icon: 'star', label: 'Acceso anticipado a nuevos productos' },
        { icon: 'doc', label: 'Informes premium (PBG Municipal, Un empleo cada 23 vecinos)' },
        { icon: 'clock', label: 'Brief Gobernador mensual', soon: true },
        { icon: 'bell', label: 'Alertas y seguimiento de municipios', soon: true },
      ],
      locked: [],
    },
  };

  window.ALSINA_PLAN_ORDER = ['concejal', 'intendente', 'gobernador'];
})();
