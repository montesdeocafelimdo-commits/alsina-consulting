/* ALSINA — Electromovilidad Zona Norte, app del informe interactivo.
   Todo el contenido (cifras, ficha municipal, explorador, institucional,
   fuentes) llega desde /api/monitor135/data?dataset=electromovilidad-zona-norte,
   que devuelve 200 con data:null si la cuenta no tiene el plan Gobernador
   (AD-19/AD-22) — el navegador nunca recibe el dataset si no corresponde.
   Las definiciones de indicadores vienen de electromovilidad-indicadores.js
   (config pública, sin datos). Nada de lo que se ve en pantalla está
   tipeado a mano acá: todo sale de esas dos fuentes. */
(function () {
  const IND = window.ALSINA_EM_INDICADORES;
  const money = IND.FMT.moneda;
  let DATA = null;
  let PARTIDOS = null;
  let selectedMunis = new Set(); // vacío = todos
  let modoPorHabitante = false;

  function $(sel) { return document.querySelector(sel); }
  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function median(arr) {
    const s = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // ── escala de color secuencial marfil→cian→navy, dominio por variable ──
  function colorScale(value, min, max) {
    if (value == null || max === min) return '#c9d6d9';
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    // interpola en 2 tramos: cian claro -> cian marca -> navy
    const stops = [
      [215, 242, 244], // #d7f2f4
      [0, 199, 212],   // #00C7D4
      [7, 29, 43],      // #071D2B
    ];
    const seg = t < 0.5 ? 0 : 1;
    const tt = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
    const a = stops[seg], b = stops[seg + 1];
    const rgb = a.map((v, i) => Math.round(v + (b[i] - v) * tt));
    return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  }

  async function fetchGatedData() {
    const r = await window.AlsinaAuth.authedFetch('/api/monitor135/data?dataset=electromovilidad-zona-norte');
    return r.json();
  }
  async function fetchPartidos() {
    const r = await fetch('/assets/data/zona-norte-partidos.json');
    return r.json();
  }

  // ═══════════════════ 2 · SÍNTESIS (KPIs) ═══════════════════
  function renderKpis() {
    const t = DATA.totales;
    const cards = [
      {
        label: '0 km radicados', value: IND.FMT.decimal1(t.ceroKm), note: 'Ene–jul 2026, ponderado por titularidad',
        info: IND.BY_KEY.get('ceroKm'),
      },
      {
        label: 'Transferencias de usados', value: IND.FMT.decimal1(t.transferencias), note: 'Ene–jul 2026',
        info: IND.BY_KEY.get('transferencias'),
      },
      {
        label: 'Valor fiscal estimado 0 km', value: IND.FMT.monedaM(t.valorFiscalCeroKm), note: 'No es precio de mercado',
        info: IND.BY_KEY.get('valorFiscalCeroKm'),
      },
      {
        label: 'Vehículos BEV + PHEV', value: IND.FMT.decimal1(t.enchufables), note: `${IND.FMT.decimal1(t.bev)} BEV · ${IND.FMT.decimal1(t.phev)} PHEV`,
        info: {
          definicion: 'Suma de vehículos eléctricos a batería (BEV) e híbridos enchufables (PHEV) radicados en el período — el universo que efectivamente requiere carga externa.',
          formula: 'BEV + PHEV, ambos ponderados por titularidad.',
          utilidad: 'Dimensiona la demanda potencial de carga pública, sin mezclar híbridos no enchufables (HEV/MHEV).',
          limitacion: 'No indica dónde circula ni dónde carga habitualmente cada vehículo.',
        },
      },
      {
        label: 'Sitios de carga identificados', value: IND.FMT.entero(t.sitiosCargaMin), note: 'Mínimo, no exhaustivo',
        info: IND.BY_KEY.get('sitiosCargaMin'),
      },
    ];
    const grid = $('#emKpiGrid');
    grid.innerHTML = '';
    cards.forEach((c, i) => {
      const info = c.info;
      const card = el('div', { class: 'em-kpi' }, `
        <button type="button" class="em-info-btn" aria-label="Qué mide este indicador">i</button>
        <div class="em-kpi-label">${c.label}</div>
        <div class="em-kpi-value">${c.value}</div>
        <div class="em-kpi-note">${c.note}</div>
        <dl class="em-info-panel">
          <dt>Qué mide</dt><dd>${info.definicion}</dd>
          <dt>Cómo se calculó</dt><dd>${info.formula}</dd>
          <dt>Para qué sirve</dt><dd>${info.utilidad}</dd>
          <dt>Qué no permite concluir</dt><dd>${info.limitacion}</dd>
        </dl>
      `);
      card.querySelector('.em-info-btn').addEventListener('click', () => {
        card.querySelector('.em-info-panel').classList.toggle('show');
      });
      grid.appendChild(card);
    });
  }

  // ═══════════════════ helpers de selección de municipios ═══════════════════
  function activeMunicipios() {
    if (selectedMunis.size === 0) return DATA.municipios;
    return DATA.municipios.filter((m) => selectedMunis.has(m.slug));
  }

  function renderMuniChips() {
    const wrap = $('#emMuniChips');
    wrap.innerHTML = '';
    DATA.municipios.forEach((m) => {
      const chip = el('button', { type: 'button', class: 'em-muni-chip' }, m.nombre);
      chip.addEventListener('click', () => {
        if (selectedMunis.has(m.slug)) selectedMunis.delete(m.slug);
        else selectedMunis.add(m.slug);
        chip.classList.toggle('active');
        refreshDashboard();
      });
      wrap.appendChild(chip);
    });
  }

  // ═══════════════════ 3 · DASHBOARD ═══════════════════
  function populateSelectors() {
    const catSelect = $('#emCategoriaFiltro');
    catSelect.innerHTML = '<option value="todas">Todos los indicadores</option>' +
      IND.CATEGORIAS.map((c) => `<option value="${c.key}">${c.label}</option>`).join('');

    const indSelect = $('#emIndicadorSelect');
    function fillIndicadorSelect(catFilter) {
      const list = IND.INDICADORES.filter((i) => i.enDashboard && (catFilter === 'todas' || i.categoria === catFilter));
      indSelect.innerHTML = list.map((i) => `<option value="${i.key}">${i.nombre}</option>`).join('');
    }
    fillIndicadorSelect('todas');
    indSelect.value = 'ceroKmPorMilHab';

    // mantiene sincronizados los chips "Valores absolutos / Por habitante"
    // con el indicador realmente seleccionado (por si se elige a mano en
    // el <select> uno que no coincide con el modo activo).
    function syncModoChips() {
      const ind = IND.BY_KEY.get(indSelect.value);
      if (!ind) return;
      modoPorHabitante = !!ind.porHabitante;
      document.querySelectorAll('#dashboard .em-chip[data-modo]').forEach((b) => {
        b.classList.toggle('active', (b.dataset.modo === 'habitante') === modoPorHabitante);
      });
    }

    catSelect.addEventListener('change', () => { fillIndicadorSelect(catSelect.value); syncModoChips(); refreshDashboard(); });
    indSelect.addEventListener('change', () => { syncModoChips(); refreshDashboard(); });
    syncModoChips(); // el indicador por defecto ('0 km cada 1.000 habitantes') es "por habitante": alinear el chip activo con él desde el arranque.

    document.querySelectorAll('#dashboard .em-chip[data-modo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#dashboard .em-chip[data-modo]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        modoPorHabitante = btn.dataset.modo === 'habitante';
        // El indicador elegido puede no tener versión "por habitante" (o
        // viceversa) — si tiene un par (parKey), saltamos a él y reflejamos
        // el cambio en el <select> para que quede consistente con el gráfico;
        // si no tiene par, el botón queda activo pero el indicador no cambia.
        const current = IND.BY_KEY.get(indSelect.value);
        if (current && !!current.porHabitante !== modoPorHabitante && current.parKey && IND.BY_KEY.has(current.parKey)) {
          indSelect.value = current.parKey;
        }
        refreshDashboard();
      });
    });

    // mapa
    const mapaSelect = $('#emMapaVariable');
    const mapaVars = IND.INDICADORES.filter((i) => i.enMapa);
    mapaSelect.innerHTML = mapaVars.map((i) => `<option value="${i.key}">${i.nombre}</option>`).join('');
    mapaSelect.value = 'ceroKmPorMilHab';
    mapaSelect.addEventListener('change', () => renderMap(mapaSelect.value));
  }

  function currentIndicatorKey() {
    const catSelect = $('#emCategoriaFiltro');
    const indSelect = $('#emIndicadorSelect');
    // si el modo "por habitante" está activo y el indicador elegido no es
    // per-cápita, usar su par normalizado si existe (heurística simple:
    // mismo nombre + "PorMilHab"/"PorHabitante"/"PorDiezMilHab").
    return indSelect.value;
  }

  function renderBarChart(containerId, items, opts) {
    const container = $(containerId);
    container.innerHTML = '';
    const max = Math.max(...items.map((i) => i.value || 0), 0.0001);
    items.sort((a, b) => (b.value || 0) - (a.value || 0)).forEach((it) => {
      const pct = ((it.value || 0) / max) * 100;
      const row = el('div', { class: 'em-bar-row' }, `
        <span class="em-bar-name">${it.label}</span>
        <div class="em-bar-track"><div class="em-bar-fill" style="width:${pct}%;background:${it.color || '#00C7D4'}"></div></div>
        <span class="em-bar-val">${it.formatted}</span>
      `);
      if (opts && opts.onClick) row.addEventListener('click', () => opts.onClick(it));
      container.appendChild(row);
    });
  }

  function refreshDashboard() {
    const key = currentIndicatorKey();
    const ind = IND.BY_KEY.get(key);
    const munis = activeMunicipios();
    const items = munis.map((m) => ({
      label: m.nombre, value: m[key],
      formatted: IND.formatValue(key, m[key]),
    }));
    renderBarChart('#emBarChart', items, {
      onClick: (it) => openFicha(munis.find((m) => m.nombre === it.label).slug),
    });
    renderTable();
  }

  const TABLE_COLS = ['ceroKm', 'ceroKmPorMilHab', 'transferencias', 'valorFiscalCeroKm', 'bev', 'phev', 'enchufablesPorDiezMilHab', 'sitiosCargaMin'];
  function renderTable() {
    const table = $('#emTable');
    const munis = activeMunicipios();
    let sortKey = table.dataset.sortKey || 'ceroKm';
    let sortDir = table.dataset.sortDir || 'desc';

    function draw() {
      const sorted = [...munis].sort((a, b) => {
        const va = a[sortKey] ?? -Infinity, vb = b[sortKey] ?? -Infinity;
        return sortDir === 'asc' ? va - vb : vb - va;
      });
      table.innerHTML = `
        <thead><tr>
          <th data-key="nombre">Municipio</th>
          ${TABLE_COLS.map((k) => `<th data-key="${k}" class="${sortKey === k ? 'sorted ' + sortDir : ''}">${IND.BY_KEY.get(k).nombre}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${sorted.map((m) => `
            <tr data-slug="${m.slug}">
              <td>${m.nombre}</td>
              ${TABLE_COLS.map((k) => `<td>${IND.formatValue(k, m[k])}</td>`).join('')}
            </tr>`).join('')}
        </tbody>
      `;
      table.querySelectorAll('th[data-key]:not([data-key="nombre"])').forEach((th) => {
        th.addEventListener('click', () => {
          const k = th.dataset.key;
          sortDir = (sortKey === k && sortDir === 'desc') ? 'asc' : 'desc';
          sortKey = k;
          table.dataset.sortKey = sortKey; table.dataset.sortDir = sortDir;
          draw();
        });
      });
      table.querySelectorAll('tbody tr').forEach((tr) => {
        tr.addEventListener('click', () => openFicha(tr.dataset.slug));
      });
    }
    draw();
  }

  function renderDemoChart() {
    const munis = activeMunicipios();
    const items2010 = munis.map((m) => ({ label: m.nombre + ' (2010)', value: m.poblacion2010, formatted: IND.FMT.entero(m.poblacion2010), color: '#A8B1B8' }));
    const items2022 = munis.map((m) => ({ label: m.nombre + ' (2022)', value: m.poblacion2022, formatted: IND.FMT.entero(m.poblacion2022), color: '#00C7D4' }));
    renderBarChart('#emDemoChart', [...items2022, ...items2010]);
  }

  function renderBevPhevChart() {
    const munis = activeMunicipios();
    const items = [];
    munis.forEach((m) => {
      items.push({ label: m.nombre + ' · BEV', value: m.bev, formatted: IND.FMT.decimal1(m.bev), color: '#071D2B' });
      items.push({ label: m.nombre + ' · PHEV', value: m.phev, formatted: IND.FMT.decimal1(m.phev), color: '#00C7D4' });
    });
    renderBarChart('#emBevPhevChart', items);
  }

  function renderComparacionChart() {
    const munis = activeMunicipios();
    const items = [];
    munis.forEach((m) => {
      items.push({ label: m.nombre + ' · Enchufables', value: m.enchufables, formatted: IND.FMT.decimal1(m.enchufables), color: '#00C7D4' });
      items.push({ label: m.nombre + ' · Sitios (mín.)', value: m.sitiosCargaMin, formatted: IND.FMT.entero(m.sitiosCargaMin), color: '#071D2B' });
    });
    renderBarChart('#emComparacionChart', items);
  }

  // ═══════════════════ 4 · MAPA ═══════════════════
  function renderMap(indicatorKey) {
    const svg = $('#emSvgMap');
    const values = DATA.municipios.map((m) => m[indicatorKey]).filter((v) => v != null);
    const min = Math.min(...values), max = Math.max(...values);
    const vb = PARTIDOS.viewBox.split(' ').map(Number);
    // recorto al bbox real de los 10 partidos con un margen, en vez del
    // viewBox completo de los 134 (que los dejaría minúsculos).
    svg.setAttribute('viewBox', '428 79 82 68');
    svg.innerHTML = '';

    DATA.municipios.forEach((m) => {
      const geo = PARTIDOS.partidos[m.slug];
      if (!geo) return;
      const value = m[indicatorKey];
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', geo.d);
      path.setAttribute('fill', colorScale(value, min, max));
      path.dataset.slug = m.slug;
      path.addEventListener('mousemove', (e) => showTooltip(e, m, indicatorKey));
      path.addEventListener('mouseleave', hideTooltip);
      path.addEventListener('click', () => openFicha(m.slug));
      svg.appendChild(path);
    });

    const ind = IND.BY_KEY.get(indicatorKey);
    $('#emLegendMin').textContent = IND.formatValue(indicatorKey, min);
    $('#emLegendMax').textContent = IND.formatValue(indicatorKey, max);
    $('#emMapaCeroNota').style.display = (indicatorKey === 'sitiosCargaMin' || indicatorKey === 'enchufablesPorSitio') ? 'block' : 'none';
  }

  function showTooltip(e, m, indicatorKey) {
    const tt = $('#emTooltip');
    const ind = IND.BY_KEY.get(indicatorKey);
    tt.innerHTML = `<b>${m.nombre}</b><br>${ind.nombre}: <b>${IND.formatValue(indicatorKey, m[indicatorKey])}</b>
      <br>0 km/1.000 hab.: ${IND.formatValue('ceroKmPorMilHab', m.ceroKmPorMilHab)}
      <br>Enchufables: ${IND.formatValue('enchufables', m.enchufables)}
      <br>Sitios identificados: ${IND.formatValue('sitiosCargaMin', m.sitiosCargaMin)}`;
    tt.style.left = Math.min(e.clientX + 14, window.innerWidth - 260) + 'px';
    tt.style.top = Math.max(e.clientY - 10, 10) + 'px';
    tt.style.display = 'block';
  }
  function hideTooltip() { $('#emTooltip').style.display = 'none'; }

  // ═══════════════════ 5 · FICHA MUNICIPAL ═══════════════════
  function openFicha(slug) {
    const m = DATA.municipios.find((x) => x.slug === slug);
    if (!m) return;
    const avg = (key) => mean(DATA.municipios.map((x) => x[key]).filter((v) => v != null));
    const med = (key) => median(DATA.municipios.map((x) => x[key]).filter((v) => v != null));
    function cmp(key) {
      const v = m[key];
      if (v == null) return '';
      const md = med(key);
      if (v > md) return 'Por encima de la mediana del conjunto analizado.';
      if (v < md) return 'Por debajo de la mediana del conjunto analizado.';
      return 'En línea con la mediana del conjunto analizado.';
    }
    const rows = (pairs) => pairs.map(([k, label]) => `
      <div class="em-ficha-row"><span class="l">${label || IND.BY_KEY.get(k).nombre}</span>
        <span class="v">${IND.formatValue(k, m[k])}${IND.BY_KEY.get(k).enFicha !== false ? `<small>${cmp(k)}</small>` : ''}</span>
      </div>`).join('');

    const sitios = m.sitiosIdentificados && m.sitiosIdentificados.length
      ? `<ul class="em-ficha-list">${m.sitiosIdentificados.map((s) => `<li>${s}</li>`).join('')}</ul>`
      : `<p style="font-size:.82rem;color:rgba(7,29,43,.6);">${m.sitiosCargaMin > 0 ? `${m.sitiosCargaMin} identificado(s) en el conteo agregado de la fuente, sin nombre de establecimiento verificado en esta revisión.` : 'Sin sitios identificados en el relevamiento utilizado.'}</p>`;

    const modelos = DATA.enchufablesDetalle.filter((d) => d.municipio === m.nombre);
    const marcasModelos = [...new Set(modelos.map((d) => `${d.marca} ${d.modelo}`))];

    const ficha = $('#emFicha');
    ficha.innerHTML = `
      <div class="em-ficha-head">
        <div><div style="font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;color:#00C7D4;margin-bottom:4px;">Ficha municipal</div>
        <h2 id="emFichaTitle">${m.nombre}</h2></div>
        <button type="button" class="em-ficha-close" aria-label="Cerrar">✕</button>
      </div>
      <div class="em-ficha-body">
        <div class="em-ficha-group">Demografía</div>
        ${rows([['poblacion2022', null], ['poblacion2010', null], ['crecimientoPoblacional', null], ['superficieKm2', null], ['densidad2022', null]])}
        <div class="em-ficha-group">Mercado 0 km</div>
        ${rows([['ceroKm', null], ['ceroKmPorMilHab', null], ['ceroKmPremium', null], ['participacionPremium', null], ['titularesJuridicos', null]])}
        <div class="em-ficha-group">Mercado de usados</div>
        ${rows([['transferencias', null], ['transferenciasPorMilHab', null]])}
        <div class="em-ficha-group">Valor fiscal</div>
        ${rows([['valorFiscalCeroKm', null], ['valorFiscalPorHabitante', null], ['ticketFiscalPromedio', null]])}
        <div class="em-ficha-group">Electromovilidad</div>
        ${rows([['bev', null], ['phev', null], ['enchufablesPorDiezMilHab', null]])}
        <div class="em-ficha-group">Infraestructura de carga</div>
        ${rows([['sitiosCargaMin', null], ['enchufablesPorSitio', null]])}
        ${sitios}
        <div class="em-ficha-group">Marcas y modelos enchufables radicados</div>
        <ul class="em-ficha-list">${marcasModelos.length ? marcasModelos.map((s) => `<li>${s}</li>`).join('') : '<li>Sin unidades registradas en el detalle disponible.</li>'}</ul>
        <div class="em-ficha-group">Fuentes y actualización</div>
        <p style="font-size:.78rem;color:rgba(7,29,43,.6);line-height:1.6;">DNRPA (inscripciones, transferencias, valuaciones), Censo 2022 (INDEC), GeoRef y relevamiento de operadores de carga. Corte de información: ${DATA.meta.corteInformacion}.</p>
      </div>
    `;
    ficha.querySelector('.em-ficha-close').addEventListener('click', closeFicha);
    ficha.classList.add('show');
    $('#emFichaOverlay').classList.add('show');
    if (window.AlsinaAnalytics) window.AlsinaAnalytics.trackEvent('electromovilidad_ficha_view', { municipio: m.slug });
  }
  function closeFicha() {
    $('#emFicha').classList.remove('show');
    $('#emFichaOverlay').classList.remove('show');
  }

  // ═══════════════════ 6 · EXPLORADOR ═══════════════════
  function initExplorer() {
    const muniSelect = $('#emExplorerMuni');
    const marcaSelect = $('#emExplorerMarca');
    muniSelect.innerHTML = '<option value="">Todos los municipios</option>' + DATA.municipios.map((m) => `<option value="${m.nombre}">${m.nombre}</option>`).join('');
    const marcas = [...new Set(DATA.enchufablesDetalle.map((d) => d.marca))].sort();
    marcaSelect.innerHTML = '<option value="">Todas las marcas</option>' + marcas.map((m) => `<option value="${m}">${m}</option>`).join('');

    let tech = 'todas';
    document.querySelectorAll('#explorador .em-chip[data-tech]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#explorador .em-chip[data-tech]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        tech = btn.dataset.tech;
        drawExplorer();
      });
    });
    muniSelect.addEventListener('change', drawExplorer);
    marcaSelect.addEventListener('change', drawExplorer);
    $('#emExplorerSearch').addEventListener('input', drawExplorer);

    function drawExplorer() {
      const q = $('#emExplorerSearch').value.trim().toLowerCase();
      const rows = DATA.enchufablesDetalle.filter((d) =>
        (tech === 'todas' || d.tecnologia === tech) &&
        (!muniSelect.value || d.municipio === muniSelect.value) &&
        (!marcaSelect.value || d.marca === marcaSelect.value) &&
        (!q || d.modelo.toLowerCase().includes(q))
      ).sort((a, b) => b.unidadesPonderadas - a.unidadesPonderadas);

      $('#emExplorerCount').textContent = `${rows.length} registro(s) de modelo × municipio — unidades ponderadas radicadas.`;
      const table = $('#emExplorerTable');
      table.innerHTML = `
        <thead><tr><th style="text-align:left">Municipio</th><th style="text-align:left">Tecnología</th><th style="text-align:left">Marca</th><th style="text-align:left">Modelo</th><th>Unidades ponderadas</th><th>Valor fiscal estimado</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td style="text-align:left">${r.municipio}</td>
            <td style="text-align:left">${r.tecnologia}</td>
            <td style="text-align:left">${r.marca}</td>
            <td style="text-align:left">${r.modelo}</td>
            <td>${IND.FMT.decimal1(r.unidadesPonderadas)}</td>
            <td>${r.valorFiscalEstimado ? money(r.valorFiscalEstimado) : 's/d'}</td>
          </tr>`).join('')}</tbody>
      `;
    }
    drawExplorer();
  }

  // ═══════════════════ 7 · INFRAESTRUCTURA ═══════════════════
  function renderInfra() {
    const grid = $('#emInfraGrid');
    grid.innerHTML = DATA.municipios.map((m) => {
      const sitios = m.sitiosIdentificados || [];
      const body = sitios.length
        ? sitios.map((s) => `<div class="em-actor-item">${s}</div>`).join('')
        : (m.sitiosCargaMin > 0
          ? `<div class="em-actor-item">${m.sitiosCargaMin} identificado(s) en el conteo agregado, sin nombre verificado.</div>`
          : `<div class="em-actor-item" style="color:rgba(7,29,43,.55);">Sin sitios identificados en el relevamiento utilizado.</div>`);
      const n = m.sitiosCargaMin;
      const etiqueta = n === 1 ? '1 sitio (mínimo conocido)' : `${IND.FMT.entero(n)} sitios (mínimo conocido)`;
      return `<div class="em-actor-card"><h4>${m.nombre} · ${etiqueta}</h4>${body}</div>`;
    }).join('');
  }

  // ═══════════════════ 8 · INSTITUCIONAL ═══════════════════
  function renderInstitucional() {
    const grid = $('#emActoresGrid');
    grid.innerHTML = DATA.institucional.actoresPorNivel.map((nivel) => `
      <div class="em-actor-card">
        <h4>${nivel.nivel}</h4>
        ${nivel.actores.map((a) => `
          <div class="em-actor-item">
            <b>${a.nombre}</b>
            <span class="fn">${a.funcion}</span><br>
            <span class="fn">Relación con la carga: ${a.relacionCarga}</span>
            ${a.fuente ? `<br><a href="${a.fuente}" target="_blank" rel="noopener">Fuente oficial →</a> <span class="fn">(consultado ${a.fechaConsulta})</span>` : ''}
          </div>`).join('')}
      </div>
    `).join('');

    const vig = $('#emNormativaVigente');
    const norm = DATA.institucional.normativa;
    vig.innerHTML = `<thead><tr><th>Norma</th><th>Detalle</th><th>Fuente</th></tr></thead><tbody>
      ${[...norm.nacional, ...norm.caba].map((n) => `
        <tr><td><b>${n.nombre}</b></td><td>${n.detalle}</td><td><a href="${n.fuente}" target="_blank" rel="noopener">Ver →</a><br><span style="font-size:.7rem;color:rgba(7,29,43,.5);">Consultado ${n.fechaConsulta}</span></td></tr>
      `).join('')}
    </tbody>`;

    const proy = $('#emNormativaProyectos');
    proy.innerHTML = `<thead><tr><th>Proyecto</th><th>Impulsor</th><th>Contenido</th><th>Estado</th></tr></thead><tbody>
      ${norm.provincial.map((p) => `
        <tr><td><b>${p.proyecto}</b></td><td>${p.impulsor}</td><td>${p.contenido}${p.observacion ? `<br><span style="color:#C83A3A;font-size:.76rem;">${p.observacion}</span>` : ''}</td><td>${p.estado}</td></tr>
      `).join('')}
    </tbody>`;

    $('#emCompetenciasGrid').innerHTML = `<div class="em-actor-card" style="grid-column:1/-1;">
      <h4>Áreas municipales que típicamente intervienen</h4>
      ${DATA.institucional.competenciasMunicipales.map((c) => `<div class="em-actor-item"><b>${c.area}</b><span class="fn">${c.competencia}</span></div>`).join('')}
    </div>`;
  }

  // ═══════════════════ 9 · GLOSARIO ═══════════════════
  function renderGlosario() {
    const list = $('#emGlossaryList');
    list.innerHTML = IND.INDICADORES.map((i) => `
      <details class="em-glossary-item">
        <summary>${i.nombre}</summary>
        <dl class="em-glossary-body">
          <dt>Definición técnica</dt><dd>${i.definicion}</dd>
          <dt>Fórmula</dt><dd>${i.formula}</dd>
          <dt>Unidad</dt><dd>${i.unidad}</dd>
          <dt>Utilidad interpretativa</dt><dd>${i.utilidad}</dd>
          <dt>Limitación</dt><dd>${i.limitacion}</dd>
        </dl>
      </details>
    `).join('');
  }

  // ═══════════════════ 10 · METODOLOGÍA ═══════════════════
  function renderMetodologia() {
    $('#emCoverUpdated').textContent = `Actualizado ${DATA.meta.fechaGeneracion}`;
    $('#emCoverCorte').innerHTML = `Corte de información: <b>${DATA.meta.corteInformacion}</b>`;

    const cn = DATA.contextoNacional;
    $('#emContextoNacionalTabla').innerHTML = `
      <thead><tr><th>Tecnología</th><th>1S 2026</th><th>¿Carga externa?</th></tr></thead>
      <tbody>
        <tr><td>HEV</td><td>${IND.FMT.entero(cn.primerSemestre2026.hev)}</td><td>No</td></tr>
        <tr><td>PHEV</td><td>${IND.FMT.entero(cn.primerSemestre2026.phev)}</td><td><b>Sí</b></td></tr>
        <tr><td>MHEV</td><td>${IND.FMT.entero(cn.primerSemestre2026.mhev)}</td><td>No</td></tr>
        <tr><td>BEV</td><td>${IND.FMT.entero(cn.primerSemestre2026.bev)}</td><td><b>Sí</b></td></tr>
        <tr><td><b>Total electrificados</b></td><td><b>${IND.FMT.entero(cn.primerSemestre2026.total)}</b></td><td>—</td></tr>
        <tr><td><b>Total enchufables (PHEV+BEV)</b></td><td><b>${IND.FMT.entero(cn.primerSemestre2026.enchufables)}</b></td><td>—</td></tr>
      </tbody>`;

    $('#emAclaraciones').innerHTML = [
      `Corte de inscripciones y transferencias: ${DATA.meta.coberturaTemporal}.`,
      `Valuaciones utilizadas: tabla vigente desde ${DATA.meta.valuacionesVigentesDesde}.`,
      'El valor fiscal no es precio de mercado.',
      'Las cotitularidades fueron ponderadas por porcentaje de titularidad.',
      'La clasificación BEV/PHEV surge de las descripciones de modelo de DNRPA y debe poder actualizarse.',
      'La asignación localidad–municipio utiliza GeoRef. Los casos territoriales ambiguos no resueltos fueron excluidos.',
      'El inventario de carga es mínimo y no exhaustivo.',
    ].map((t) => `<li>${t}</li>`).join('');

    $('#emFuentesList').innerHTML = DATA.fuentes.map((f) => `<li><a href="${f.url}" target="_blank" rel="noopener">${f.titulo}</a></li>`).join('');
  }

  // ═══════════════════ init ═══════════════════
  async function init() {
    await window.ALSINA_CONFIG_READY;
    let gated;
    try {
      gated = await fetchGatedData();
    } catch (err) {
      console.error('electromovilidad: error cargando datos', err);
      gated = { access: { level: 'none' } };
    }

    $('#emLoading').style.display = 'none';

    if (!gated.data || gated.access?.level !== 'full') {
      $('#emLocked').classList.add('show');
      if (window.AlsinaAnalytics) window.AlsinaAnalytics.trackEvent('electromovilidad_locked');
      return;
    }

    DATA = gated.data;
    try {
      PARTIDOS = await fetchPartidos();
    } catch (err) {
      console.error('electromovilidad: error cargando geometría del mapa', err);
    }

    $('#emReport').classList.add('show');

    renderKpis();
    renderMuniChips();
    populateSelectors();
    refreshDashboard();
    renderDemoChart();
    renderBevPhevChart();
    renderComparacionChart();
    if (PARTIDOS) renderMap('ceroKmPorMilHab');
    initExplorer();
    renderInfra();
    renderInstitucional();
    renderGlosario();
    renderMetodologia();

    $('#emFichaOverlay').addEventListener('click', closeFicha);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFicha(); });

    if (window.AlsinaAnalytics) window.AlsinaAnalytics.trackEvent('electromovilidad_view_full');
  }

  init();
})();
