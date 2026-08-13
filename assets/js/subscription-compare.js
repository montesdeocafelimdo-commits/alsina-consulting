/* ALSINA — tabla comparativa de suscripción (Intendente / Ministro / Gobernador).
   Vainilla JS: un solo array de datos alimenta tanto la tabla de escritorio
   como las pestañas de mobile, para no duplicar el contenido a mano.
   Editar PLANS/CATEGORIES acá alcanza para actualizar ambas vistas. */
const COMPARE_PLANS = [
  {
    id: 'intendente',
    name: 'Nivel Intendente',
    desc: 'Para seguir las principales señales',
    priceKey: 'intendenteMensual',
    priceSuffix: '',
    btnLabel: 'Elegir Intendente',
  },
  {
    id: 'ministro',
    name: 'Nivel Ministro',
    desc: 'Para profundizar en la gestión',
    priceKey: 'ministroMensual',
    priceSuffix: '/mes',
    btnLabel: 'Elegir Ministro',
  },
  {
    id: 'gobernador',
    name: 'Nivel Gobernador',
    desc: 'Para acceder a todo el laboratorio',
    priceKey: 'gobernadorMensual',
    priceSuffix: '/mes',
    btnLabel: 'Elegir Gobernador',
  },
];

const COMPARE_CATEGORIES = [
  {
    name: 'Contenidos y análisis',
    items: [
      { label: 'Señal Alsina: newsletter quincenal', tiers: [1, 1, 1] },
      { label: 'Notas de coyuntura fiscal y productiva', tiers: [1, 1, 1] },
      { label: 'Informe de recaudación de la PBA', tiers: [0, 1, 1] },
      { label: 'Informe de transferencias municipales', tiers: [0, 1, 1] },
      { label: 'Informe legislativo mensual', tiers: [0, 1, 1] },
      { label: 'Acceso al archivo completo de informes', tiers: [0, 0, 1] },
    ],
  },
  {
    name: 'Monitor 135',
    items: [
      { label: 'Indicadores principales de los 135 municipios', tiers: [1, 1, 1] },
      { label: 'Radar electoral municipal', tiers: [1, 1, 1] },
      { label: 'Radar fiscal municipal', tiers: [1, 1, 1] },
      { label: 'Radar productivo municipal', tiers: [1, 1, 1] },
      { label: 'Fichas municipales completas', tiers: [0, 1, 1] },
      { label: 'Comparación entre municipios', tiers: [0, 1, 1] },
      { label: 'Acceso completo a todos los indicadores', tiers: [0, 0, 1] },
    ],
  },
  {
    name: 'Datos y herramientas',
    items: [
      { label: 'Visualizaciones interactivas', tiers: [1, 1, 1] },
      { label: 'Descarga de informes', tiers: [0, 1, 1] },
      { label: 'Datos completos de los 135 municipios', tiers: [0, 0, 1] },
      { label: 'Descarga de bases de datos', tiers: [0, 0, 1] },
      { label: 'Tableros comparativos intermunicipales', tiers: [0, 0, 1] },
    ],
  },
  {
    name: 'Análisis territorial',
    items: [
      { label: 'Informes territoriales por municipio o sección', tiers: [0, 1, 1] },
      { label: 'Radar tributario de la Provincia', tiers: [0, 0, 1] },
      { label: 'Radar regulatorio y legislativo sectorial', tiers: [0, 0, 1] },
      { label: 'Acceso anticipado a nuevos productos', tiers: [0, 0, 1] },
    ],
  },
];

(function () {
  const desktopWrap = document.getElementById('compareDesktop');
  const mobileWrap = document.getElementById('compareMobile');
  if (!desktopWrap || !mobileWrap) return;

  const CHECKOUT_HREF = '/newsletter.html#suscripcion';
  const checkIcon = (label) =>
    `<svg class="ic compare-check" viewBox="0 0 24 24" role="img" aria-label="${label}"><polyline points="20 6 9 17 4 12"/></svg>`;
  const checkIconDecorative = () =>
    `<svg class="ic compare-check" viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

  function priceFor(plan) {
    const prices = window.ALSINA_PRICING || {};
    return prices[plan.priceKey] || '';
  }

  function ctaButton(plan, extraClass) {
    const a = document.createElement('a');
    a.className = `btn compare-plan-btn ${extraClass || ''}`.trim();
    a.href = CHECKOUT_HREF;
    a.dataset.checkoutType = 'pro';
    a.dataset.checkoutResource = plan.id;
    a.dataset.checkoutKeepLabel = '1';
    a.textContent = plan.btnLabel;
    return a;
  }

  // ── Escritorio: <table> semántica ──
  function renderDesktop() {
    const table = document.createElement('table');
    table.className = 'compare-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    const thProduct = document.createElement('th');
    thProduct.scope = 'col';
    thProduct.className = 'compare-th compare-th-product';
    thProduct.textContent = 'Producto';
    headRow.appendChild(thProduct);

    COMPARE_PLANS.forEach((plan) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.id = `compare-col-${plan.id}`;
      th.className = `compare-th compare-th-plan compare-th-${plan.id}`;

      const name = document.createElement('span');
      name.className = 'compare-plan-name';
      name.textContent = plan.name;
      th.appendChild(name);

      const desc = document.createElement('span');
      desc.className = 'compare-plan-desc';
      desc.textContent = plan.desc;
      th.appendChild(desc);

      const price = document.createElement('span');
      price.className = 'compare-plan-price';
      price.append(priceFor(plan));
      if (plan.priceSuffix) {
        const period = document.createElement('span');
        period.className = 'compare-price-period';
        period.textContent = plan.priceSuffix;
        price.appendChild(period);
      }
      th.appendChild(price);

      th.appendChild(ctaButton(plan));
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    COMPARE_CATEGORIES.forEach((cat) => {
      const catRow = document.createElement('tr');
      catRow.className = 'compare-cat-row';
      const catTh = document.createElement('th');
      catTh.scope = 'colgroup';
      catTh.colSpan = COMPARE_PLANS.length + 1;
      catTh.className = 'compare-cat';
      catTh.textContent = cat.name;
      catRow.appendChild(catTh);
      tbody.appendChild(catRow);

      cat.items.forEach((item) => {
        const row = document.createElement('tr');
        row.className = 'compare-row';
        const rowTh = document.createElement('th');
        rowTh.scope = 'row';
        rowTh.className = 'compare-row-label';
        rowTh.textContent = item.label;
        row.appendChild(rowTh);

        COMPARE_PLANS.forEach((plan, i) => {
          const td = document.createElement('td');
          td.className = `compare-cell compare-cell-${plan.id}`;
          td.setAttribute('headers', `compare-col-${plan.id}`);
          if (item.tiers[i]) td.innerHTML = checkIcon('Incluido');
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
    });
    table.appendChild(tbody);

    const tfoot = document.createElement('tfoot');
    const footRow = document.createElement('tr');
    footRow.appendChild(document.createElement('td'));
    COMPARE_PLANS.forEach((plan) => {
      const td = document.createElement('td');
      td.className = `compare-cell-foot compare-cell-${plan.id}`;
      td.appendChild(ctaButton(plan));
      footRow.appendChild(td);
    });
    tfoot.appendChild(footRow);
    table.appendChild(tfoot);

    desktopWrap.appendChild(table);
  }

  // ── Mobile: pestañas + panel por nivel ──
  function renderMobile() {
    const tabs = document.createElement('div');
    tabs.className = 'compare-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Niveles de suscripción');

    const panels = document.createElement('div');
    panels.className = 'compare-panels';

    function selectPlan(id) {
      tabs.querySelectorAll('.compare-tab').forEach((btn) => {
        const active = btn.dataset.plan === id;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.tabIndex = active ? 0 : -1;
      });
      panels.querySelectorAll('.compare-panel').forEach((p) => {
        p.classList.toggle('active', p.dataset.plan === id);
      });
    }

    COMPARE_PLANS.forEach((plan, idx) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'compare-tab' + (idx === 0 ? ' active' : '');
      tab.dataset.plan = plan.id;
      tab.id = `compare-tab-${plan.id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `compare-panel-${plan.id}`);
      tab.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      tab.tabIndex = idx === 0 ? 0 : -1;
      tab.textContent = plan.name;
      tab.addEventListener('click', () => selectPlan(plan.id));
      tabs.appendChild(tab);

      const panel = document.createElement('div');
      panel.className = 'compare-panel' + (idx === 0 ? ' active' : '');
      panel.dataset.plan = plan.id;
      panel.id = `compare-panel-${plan.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `compare-tab-${plan.id}`);

      const head = document.createElement('div');
      head.className = 'compare-panel-head';
      const name = document.createElement('div');
      name.className = 'compare-panel-name';
      name.textContent = plan.name;
      const desc = document.createElement('div');
      desc.className = 'compare-panel-desc';
      desc.textContent = plan.desc;
      const price = document.createElement('div');
      price.className = 'compare-panel-price';
      price.append(priceFor(plan));
      if (plan.priceSuffix) {
        const period = document.createElement('span');
        period.className = 'compare-price-period';
        period.textContent = plan.priceSuffix;
        price.appendChild(period);
      }
      head.append(name, desc, price, ctaButton(plan));
      panel.appendChild(head);

      COMPARE_CATEGORIES.forEach((cat) => {
        const included = cat.items.filter((item) => item.tiers[idx]);
        if (!included.length) return;
        const catLabel = document.createElement('div');
        catLabel.className = 'compare-panel-cat';
        catLabel.textContent = cat.name;
        panel.appendChild(catLabel);

        const list = document.createElement('ul');
        list.className = 'compare-panel-list';
        included.forEach((item) => {
          const li = document.createElement('li');
          li.innerHTML = `${checkIconDecorative()}<span>${item.label}</span>`;
          list.appendChild(li);
        });
        panel.appendChild(list);
      });

      panels.appendChild(panel);
    });

    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const current = Array.from(tabs.children).findIndex((b) => b.classList.contains('active'));
      const next = e.key === 'ArrowRight'
        ? (current + 1) % COMPARE_PLANS.length
        : (current - 1 + COMPARE_PLANS.length) % COMPARE_PLANS.length;
      const nextBtn = tabs.children[next];
      selectPlan(nextBtn.dataset.plan);
      nextBtn.focus();
    });

    mobileWrap.append(tabs, panels);
  }

  // ── Header sticky: offset exacto según alto real del nav ──
  // Se fija como inline style directo en cada th (no vía custom property):
  // actualizar --nav-h después del layout inicial no siempre re-dispara el
  // recálculo del "constraint rectangle" de position:sticky en Chromium.
  function setStickyOffset() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    const top = `${nav.offsetHeight}px`;
    desktopWrap.querySelectorAll('.compare-table thead th').forEach((th) => {
      th.style.top = top;
    });
  }

  renderDesktop();
  renderMobile();
  setStickyOffset();
  window.addEventListener('resize', setStickyOffset);
  window.addEventListener('load', setStickyOffset);
})();
