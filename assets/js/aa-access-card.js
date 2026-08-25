/* ALSINA — ficha técnica de acceso (.aa-card), compartida entre la
   bienvenida de cuenta.html y la landing de planes.html. Arma el markup
   a partir de window.ALSINA_PLANS (plans-catalog.js) — nunca inventa
   beneficios propios, solo los renderiza. Requiere que la página incluya
   antes assets/js/plans-catalog.js. */
(function () {
  const ICONS = {
    mail: '<path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    compare: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
    bank: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21V13h6v8"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
    star: '<path d="M12 2 9.2 8.6 2 9.2l5.5 4.7L5.8 21 12 17.3 18.2 21l-1.7-7.1L22 9.2l-7.2-.6Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    lock: '<rect width="14" height="10" x="5" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  };

  function icon(name) {
    return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.doc}</svg>`;
  }

  /**
   * @param {HTMLElement} el - contenedor donde va la ficha (se reemplaza su innerHTML)
   * @param {{planSlug:string, accessNumber?:string, statusLabel?:string, priceText?:string,
   *          isFounderPrice?:boolean, showLocked?:boolean, tagline?:string}} opts
   */
  function renderAccessCard(el, opts) {
    const plan = window.ALSINA_PLANS[opts.planSlug];
    if (!plan || !el) return;
    const accessNumber = opts.accessNumber || '001';
    const rows = plan.granted.map((item) => `
      <li class="aa-access-row${item.soon ? ' aa-soon' : ''}">
        <span class="aa-access-ic">${icon(item.icon)}</span>
        <span class="aa-access-txt">${item.label}${item.soon ? '<span class="aa-soon-tag">Próximamente</span>' : ''}</span>
        <span class="aa-access-dot"></span>
      </li>`).join('');
    const lockedRows = (opts.showLocked && plan.locked.length)
      ? plan.locked.map((item) => `
      <li class="aa-access-row aa-soon">
        <span class="aa-access-ic">${icon('lock')}</span>
        <span class="aa-access-txt">${item.label}</span>
        <span class="aa-access-dot"></span>
      </li>`).join('')
      : '';
    const priceText = opts.priceText || (plan.price ? `${plan.priceLabel}${plan.periodicity || ''}` : plan.priceLabel);
    // isFounderPrice: si no se pasa explícito (p.ej. desde /api/account, que
    // sabe el estado real de ESA cuenta), se infiere del catálogo — hoy
    // Intendente y Gobernador siempre tienen tag:'Precio fundador'.
    const isFounder = opts.isFounderPrice !== undefined ? opts.isFounderPrice : !!plan.tag;

    el.innerHTML = `
      <div class="aa-card-head">
        <span>ALSINA / ACCESO ${accessNumber}</span>
        <span class="aa-card-lock">${icon('lock')}</span>
      </div>
      <div class="aa-card-label">Tu plan</div>
      <div class="aa-card-planname">${plan.name}</div>
      <div class="aa-card-meta">
        <span class="num">${priceText}${isFounder ? ' · fundador' : ''}</span>
        ${opts.statusLabel ? `<span class="aa-pill">${opts.statusLabel}</span>` : ''}
      </div>
      <div class="aa-card-divider"></div>
      <div class="aa-card-access-label">Tenés acceso a:</div>
      <ul class="aa-access-list">${rows}${lockedRows}</ul>
      <div class="aa-signal" aria-hidden="true">
        <svg viewBox="0 0 320 40" preserveAspectRatio="none">
          <polyline points="0,30 40,22 80,26 120,10 160,18 200,6 240,16 280,12 320,20" fill="none" stroke="#00C7D4" stroke-width="1.5"/>
          <circle cx="120" cy="10" r="2.5" fill="#00C7D4"/>
          <circle cx="200" cy="6" r="2.5" fill="#00C7D4"/>
        </svg>
      </div>
      <div class="aa-card-tagline">${opts.tagline || 'Datos públicos dispersos. <strong>Decisiones claras.</strong>'}</div>
    `;
  }

  window.AlsinaAccessCard = { renderAccessCard };
})();
