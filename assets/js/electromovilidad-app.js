/* ALSINA — Electromovilidad Zona Norte, app del informe interactivo.
   Todo el contenido (cifras, ficha municipal, explorador, institucional,
   fuentes) llega desde /api/monitor135/data?dataset=electromovilidad-zona-norte,
   que devuelve 200 con data:null si la cuenta no tiene el plan Gobernador
   (AD-19/AD-22) — el navegador nunca recibe el dataset si no corresponde.
   Las definiciones de indicadores vienen de electromovilidad-indicadores.js
   (config pública, sin datos). Nada de lo que se ve en pantalla está
   tipeado a mano acá: todo sale de esas dos fuentes.

   Arquitectura de selección (rediseño mapa-como-interfaz-principal): un
   único STATE compartido por mapa, ranking, panel contextual, comparador,
   matriz y gráfico relacional. Cualquier interacción pasa por selectMuni()
   / toggleComparison() / STATE.indicator y dispara syncAll(), que
   re-renderiza los seis componentes en el mismo tick — así nunca quedan
   desincronizados entre sí. */
(function () {
  const IND = window.ALSINA_EM_INDICADORES;
  const money = IND.FMT.moneda;
  let DATA = null;
  let PARTIDOS = null;

  const STATE = {
    indicator: 'enchufablesPorDiezMilHab',
    selectedMuni: null,
    comparison: [], // hasta 3 slugs, en orden de selección (define el color 1/2/3)
    scatterX: 'enchufablesPorDiezMilHab',
    scatterY: 'enchufablesPorSitio',
    matrixFamilia: 'electromovilidad',
    matrixSort: { key: null, dir: 'desc' },
  };

  // variables habilitadas para colorear el mapa y para los ejes del
  // gráfico relacional — orden curado (no alfabético ni de categoría).
  const MAP_INDICATOR_ORDER = [
    'ceroKm', 'ceroKmPorMilHab', 'valorFiscalCeroKm', 'valorFiscalPorHabitante',
    'transferencias', 'crecimientoPoblacional', 'bev', 'phev', 'enchufables',
    'enchufablesPorDiezMilHab', 'sitiosCargaMin', 'enchufablesPorSitio',
  ];

  const MATRIX_FAMILIAS = [
    { key: 'mercado', label: 'Mercado', categorias: ['mercado-0km', 'mercado-usados', 'valor-fiscal', 'perfil-titular'] },
    { key: 'electromovilidad', label: 'Electromovilidad', categorias: ['electromovilidad'] },
    { key: 'infraestructura', label: 'Infraestructura', categorias: ['infraestructura'] },
    { key: 'demografia', label: 'Demografía', categorias: ['demografia'] },
  ];

  const COMPARE_COLORS = ['#071D2B', '#008E9B', '#00C7D4'];

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
  function numeric(v) { return typeof v === 'number' && Number.isFinite(v); }

  // ── escala de color secuencial marfil→cian→navy, dominio por variable ──
  function colorScale(value, min, max) {
    if (value == null || max === min) return '#c9d6d9';
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
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
    cards.forEach((c) => {
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

  // ═══════════════════ helpers de posición dentro del conjunto ═══════════════════
  function rankInfo(key, slug) {
    const vals = DATA.municipios.map((m) => ({ slug: m.slug, v: m[key] })).filter((x) => numeric(x.v));
    const sorted = [...vals].sort((a, b) => b.v - a.v);
    const rank = sorted.findIndex((x) => x.slug === slug) + 1;
    const m = DATA.municipios.find((x) => x.slug === slug);
    const value = m[key];
    const med = median(vals.map((x) => x.v));
    const pct = numeric(value) && med ? ((value - med) / Math.abs(med)) * 100 : null;
    return { rank, total: vals.length, value, median: med, mean: mean(vals.map((x) => x.v)), pct };
  }

  function pctLabel(pct) {
    if (pct == null || !Number.isFinite(pct)) return 'sin datos suficientes para comparar con la mediana.';
    const sign = pct > 0 ? '+' : '';
    const rel = Math.abs(pct) < 0.5 ? 'en línea con' : (pct > 0 ? 'por encima de' : 'por debajo de');
    return `${sign}${pct.toFixed(0)}% respecto de la mediana (${rel} la mediana del conjunto).`;
  }

  // ═══════════════════ selección compartida: mapa · ranking · contexto · comparador · matriz · scatter ═══════════════════
  function selectMuni(slug) {
    if (STATE.selectedMuni === slug) {
      toggleComparison(slug); // segundo clic sobre el mismo municipio: atajo para compararlo
      return;
    }
    STATE.selectedMuni = slug;
    syncAll();
  }

  function toggleComparison(slug) {
    const i = STATE.comparison.indexOf(slug);
    if (i >= 0) {
      STATE.comparison.splice(i, 1);
    } else {
      if (STATE.comparison.length >= 3) {
        const hint = $('#emComparadorHint');
        if (hint) {
          const prev = hint.textContent;
          hint.textContent = 'Máximo tres municipios — quitá uno para agregar otro.';
          hint.style.color = 'var(--aa-rojo,#C83A3A)';
          setTimeout(() => { hint.textContent = prev; hint.style.color = ''; }, 2600);
        }
        return;
      }
      STATE.comparison.push(slug);
    }
    syncAll();
  }

  function compareIndex(slug) { return STATE.comparison.indexOf(slug); }

  function syncAll() {
    renderMuniChips();
    renderMap();
    renderRanking();
    renderContextPanel();
    renderComparador();
    renderMatrix();
    renderScatter();
  }

  // ═══════════════════ chips de municipio (comparador) ═══════════════════
  function renderMuniChips() {
    const wrap = $('#emMuniChips');
    wrap.innerHTML = '';
    DATA.municipios.forEach((m) => {
      const idx = compareIndex(m.slug);
      const chip = el('button', { type: 'button', class: 'em-muni-chip' + (idx >= 0 ? ` compare-${idx + 1}` : '') }, m.nombre);
      chip.addEventListener('click', () => toggleComparison(m.slug));
      wrap.appendChild(chip);
    });
  }

  // ═══════════════════ controles del mapa (variable + abs/hab) ═══════════════════
  function populateMapControls() {
    const mapaSelect = $('#emMapaVariable');
    mapaSelect.innerHTML = MAP_INDICATOR_ORDER.map((k) => `<option value="${k}">${IND.BY_KEY.get(k).nombre}</option>`).join('');
    mapaSelect.value = STATE.indicator;

    function syncModoChips() {
      const ind = IND.BY_KEY.get(STATE.indicator);
      const porHab = !!(ind && ind.porHabitante);
      document.querySelectorAll('#mapa .em-chip[data-modo]').forEach((b) => {
        b.classList.toggle('active', (b.dataset.modo === 'habitante') === porHab);
      });
    }

    mapaSelect.addEventListener('change', () => {
      STATE.indicator = mapaSelect.value;
      syncModoChips();
      syncAll();
    });

    document.querySelectorAll('#mapa .em-chip[data-modo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wantHabitante = btn.dataset.modo === 'habitante';
        const current = IND.BY_KEY.get(STATE.indicator);
        if (current && !!current.porHabitante !== wantHabitante && current.parKey && IND.BY_KEY.has(current.parKey)) {
          STATE.indicator = current.parKey;
          mapaSelect.value = STATE.indicator;
        }
        syncModoChips();
        syncAll();
      });
    });

    syncModoChips();
  }

  // ═══════════════════ gráfico de barras horizontales (genérico) ═══════════════════
  function renderBarChart(containerId, items, opts) {
    const container = $(containerId);
    container.innerHTML = '';
    const max = Math.max(...items.map((i) => i.value || 0), 0.0001);
    items.sort((a, b) => (b.value || 0) - (a.value || 0)).forEach((it) => {
      const pct = ((it.value || 0) / max) * 100;
      const row = el('div', { class: 'em-bar-row' + (it.highlight ? ' hl' : '') }, `
        <span class="em-bar-name">${it.badge || ''}${it.label}</span>
        <div class="em-bar-track"><div class="em-bar-fill" style="width:${pct}%;background:${it.color || '#00C7D4'}"></div></div>
        <span class="em-bar-val">${it.formatted}</span>
      `);
      if (opts && opts.onClick) row.addEventListener('click', () => opts.onClick(it));
      container.appendChild(row);
    });
  }

  // ═══════════════════ ranking (único gráfico de barras que sobrevive) ═══════════════════
  function renderRanking() {
    const ind = IND.BY_KEY.get(STATE.indicator);
    $('#emRankingLabel').textContent = ind.nombre;
    const items = DATA.municipios.map((m) => ({
      label: m.nombre, value: m[STATE.indicator],
      formatted: IND.formatValue(STATE.indicator, m[STATE.indicator]),
      slug: m.slug,
      highlight: m.slug === STATE.selectedMuni,
      badge: compareIndex(m.slug) >= 0 ? `<span class="em-badge-compare" style="background:${COMPARE_COLORS[compareIndex(m.slug)]}">${compareIndex(m.slug) + 1}</span>` : '',
    }));
    renderBarChart('#emBarChart', items, { onClick: (it) => selectMuni(it.slug) });
  }

  // ═══════════════════ mapa ═══════════════════
  function renderMap() {
    const svg = $('#emSvgMap');
    if (!PARTIDOS) return;
    const key = STATE.indicator;
    const values = DATA.municipios.map((m) => m[key]).filter(numeric);
    const min = Math.min(...values), max = Math.max(...values);
    svg.setAttribute('viewBox', PARTIDOS.viewBox);
    svg.innerHTML = '';

    const NS = 'http://www.w3.org/2000/svg';
    const markers = []; // se dibujan en un segundo paso, todas por encima de los 10 rellenos
    DATA.municipios.forEach((m) => {
      const geo = PARTIDOS.partidos[m.slug];
      if (!geo) return;
      const value = m[key];
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', geo.d);
      path.setAttribute('fill', colorScale(value, min, max));
      path.dataset.slug = m.slug;
      path.addEventListener('mousemove', (e) => showTooltip(e, m, key));
      path.addEventListener('mouseleave', hideTooltip);
      path.addEventListener('click', () => selectMuni(m.slug));
      svg.appendChild(path);

      const cIdx = compareIndex(m.slug);
      const isSelected = m.slug === STATE.selectedMuni;
      if (isSelected || cIdx >= 0) markers.push({ m, path, cIdx, isSelected });
    });

    // marcador de centroide (no un contorno sobre el borde): el relleno
    // recorre la misma paleta cian→navy que usamos para marcar selección o
    // comparación, así que un contorno de color a veces se pierde contra el
    // relleno (p. ej. navy sobre navy). Un círculo con fondo blanco propio,
    // dibujado por encima de todo, contrasta siempre sin importar el color
    // de ningún municipio.
    const vbWidth = parseFloat(PARTIDOS.viewBox.split(' ')[2]) || 100;
    const R = vbWidth * 0.024; // radio del marcador, proporcional al viewBox real (sea cual sea su escala)
    markers.forEach(({ m, path, cIdx, isSelected }) => {
      const bbox = path.getBBox();
      const cx = bbox.x + bbox.width / 2, cy = bbox.y + bbox.height / 2;
      const color = cIdx >= 0 ? COMPARE_COLORS[cIdx] : '#071D2B';
      const g = document.createElementNS(NS, 'g');
      g.style.pointerEvents = 'none';
      const bg = document.createElementNS(NS, 'circle');
      bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', String(R));
      bg.setAttribute('fill', '#fff');
      bg.setAttribute('stroke', color);
      bg.setAttribute('stroke-width', String(R * 0.35));
      g.appendChild(bg);
      if (cIdx >= 0) {
        const txt = document.createElementNS(NS, 'text');
        txt.setAttribute('x', cx); txt.setAttribute('y', cy);
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'central');
        txt.setAttribute('font-size', String(R * 1.15));
        txt.setAttribute('font-weight', '800');
        txt.setAttribute('font-family', "'Barlow', sans-serif");
        txt.setAttribute('fill', color);
        txt.textContent = String(cIdx + 1);
        g.appendChild(txt);
      } else if (isSelected) {
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', String(R * 0.4));
        dot.setAttribute('fill', color);
        g.appendChild(dot);
      }
      svg.appendChild(g);
    });

    $('#emLegendMin').textContent = IND.formatValue(key, min);
    $('#emLegendMax').textContent = IND.formatValue(key, max);
    $('#emMapaCeroNota').style.display = (key === 'sitiosCargaMin' || key === 'enchufablesPorSitio') ? 'block' : 'none';
  }

  function showTooltip(e, m, indicatorKey) {
    const tt = $('#emTooltip');
    const ind = IND.BY_KEY.get(indicatorKey);
    const extra = ['ceroKmPorMilHab', 'enchufablesPorDiezMilHab', 'sitiosCargaMin']
      .filter((k) => k !== indicatorKey).slice(0, 2);
    tt.innerHTML = `<b>${m.nombre}</b><br>${ind.nombre}: <b>${IND.formatValue(indicatorKey, m[indicatorKey])}</b>` +
      extra.map((k) => `<br>${IND.BY_KEY.get(k).nombre}: ${IND.formatValue(k, m[k])}`).join('');
    tt.style.left = Math.min(e.clientX + 14, window.innerWidth - 260) + 'px';
    tt.style.top = Math.max(e.clientY - 10, 10) + 'px';
    tt.style.display = 'block';
  }
  function hideTooltip() { $('#emTooltip').style.display = 'none'; }

  // ═══════════════════ panel contextual (aparece al elegir un municipio) ═══════════════════
  function complementarios(activeKey) {
    const priority = ['enchufablesPorDiezMilHab', 'ceroKmPorMilHab', 'sitiosCargaMin', 'valorFiscalPorHabitante', 'poblacion2022'];
    return priority.filter((k) => k !== activeKey).slice(0, 3);
  }

  function renderContextPanel() {
    const panel = $('#emContextPanel');
    const slug = STATE.selectedMuni;
    if (!slug) {
      panel.innerHTML = `<p class="em-context-empty">Elegí un municipio en el mapa (o en el ranking) para ver su detalle acá: valor, posición entre los diez, e indicadores complementarios.</p>`;
      return;
    }
    const m = DATA.municipios.find((x) => x.slug === slug);
    const key = STATE.indicator;
    const ind = IND.BY_KEY.get(key);
    const info = rankInfo(key, slug);
    const parKey = ind.parKey;
    const cIdx = compareIndex(slug);
    const inComparison = cIdx >= 0;

    panel.innerHTML = `
      <div class="em-context-indicator">${ind.nombre}</div>
      <h4>${m.nombre}</h4>
      <div class="em-context-value">${IND.formatValue(key, info.value)}</div>
      <div class="em-context-sub">
        Posición ${info.rank} de ${info.total} en esta variable.<br>
        ${pctLabel(info.pct)}
        ${parKey ? `<br>${IND.BY_KEY.get(parKey).nombre}: <b>${IND.formatValue(parKey, m[parKey])}</b>` : ''}
      </div>
      <div class="em-context-complementarios">
        ${complementarios(key).map((k) => `<div class="row"><span class="l">${IND.BY_KEY.get(k).nombre}</span><span class="v">${IND.formatValue(k, m[k])}</span></div>`).join('')}
      </div>
      <div class="em-context-def">${ind.definicion}</div>
      <div class="em-context-actions">
        <button type="button" class="${inComparison ? '' : 'primary'}" id="emCtxCompareBtn" ${(!inComparison && STATE.comparison.length >= 3) ? 'disabled' : ''}>
          ${inComparison ? 'Quitar de comparación' : 'Agregar a comparación'}
        </button>
        <button type="button" id="emCtxFichaBtn">Ver ficha completa</button>
      </div>
    `;
    $('#emCtxCompareBtn').addEventListener('click', () => toggleComparison(slug));
    $('#emCtxFichaBtn').addEventListener('click', () => openFicha(slug));
  }

  // ═══════════════════ comparador (hasta 3 municipios) ═══════════════════
  const COMPARADOR_INDICADORES = [
    'poblacion2022', 'ceroKm', 'ceroKmPorMilHab', 'transferencias',
    'valorFiscalCeroKm', 'bev', 'phev', 'enchufables', 'enchufablesPorDiezMilHab', 'sitiosCargaMin',
  ];

  function renderComparador() {
    const box = $('#emComparador');
    const slugs = STATE.comparison;
    if (!slugs.length) {
      box.innerHTML = `<p class="em-comparador-empty">Todavía no seleccionaste ningún municipio para comparar. Elegí hasta tres desde el mapa, el ranking o la lista de arriba.</p>`;
      return;
    }
    const munis = slugs.map((s) => DATA.municipios.find((m) => m.slug === s));
    const cols = munis.length + 2; // + promedio + mediana
    const gridCols = `160px repeat(${cols}, 1fr)`;

    let html = `<div class="em-comparador-grid" style="grid-template-columns:${gridCols};">`;
    html += `<div class="em-comparador-row" style="grid-column:1/-1;display:grid;grid-template-columns:${gridCols};">`;
    html += `<div class="lbl"></div>`;
    munis.forEach((m, i) => {
      html += `<div class="cell" style="text-align:center;color:${COMPARE_COLORS[i]};"><span class="em-badge-compare" style="background:${COMPARE_COLORS[i]};">${i + 1}</span>${m.nombre}</div>`;
    });
    html += `<div class="cell" style="text-align:center;color:var(--aa-navy-muted,rgba(7,29,43,.55));">Promedio</div>`;
    html += `<div class="cell" style="text-align:center;color:var(--aa-navy-muted,rgba(7,29,43,.55));">Mediana</div>`;
    html += `</div>`;

    COMPARADOR_INDICADORES.forEach((key) => {
      const allVals = DATA.municipios.map((m) => m[key]).filter(numeric);
      const min = Math.min(...allVals), max = Math.max(...allVals);
      const avg = mean(allVals), med = median(allVals);
      const pos = (v) => max === min ? 50 : ((v - min) / (max - min)) * 100;

      html += `<div class="em-comparador-row" style="grid-template-columns:${gridCols};">`;
      html += `<div class="lbl">${IND.BY_KEY.get(key).nombre}</div>`;
      munis.forEach((m) => { html += `<div class="cell">${IND.formatValue(key, m[key])}</div>`; });
      html += `<div class="cell" style="color:var(--aa-navy-muted,rgba(7,29,43,.6));font-weight:600;">${IND.formatValue(key, avg)}</div>`;
      html += `<div class="cell" style="color:var(--aa-navy-muted,rgba(7,29,43,.6));font-weight:600;">${IND.formatValue(key, med)}</div>`;
      html += `</div>`;

      html += `<div class="em-comparador-row" style="grid-template-columns:${gridCols};grid-column:1/-1;display:grid;">`;
      html += `<div class="lbl"></div>`;
      html += `<div style="grid-column:2/-1;position:relative;padding:10px 12px;">`;
      html += `<div class="em-comparador-scale">`;
      if (numeric(avg)) html += `<div class="marker" style="left:${pos(avg)}%;" title="Promedio"></div>`;
      munis.forEach((m, i) => {
        const v = m[key];
        if (numeric(v)) html += `<div class="dot" style="left:${pos(v)}%;background:${COMPARE_COLORS[i]};"></div>`;
      });
      html += `</div></div></div>`;
    });
    html += `</div>`;
    box.innerHTML = html;
  }

  // ═══════════════════ matriz comparativa ═══════════════════
  function populateMatrixControls() {
    const sel = $('#emMatrizFamilia');
    sel.innerHTML = MATRIX_FAMILIAS.map((f) => `<option value="${f.key}">${f.label}</option>`).join('');
    sel.value = STATE.matrixFamilia;
    sel.addEventListener('change', () => { STATE.matrixFamilia = sel.value; STATE.matrixSort = { key: null, dir: 'desc' }; renderMatrix(); });
  }

  function renderMatrix() {
    const fam = MATRIX_FAMILIAS.find((f) => f.key === STATE.matrixFamilia) || MATRIX_FAMILIAS[0];
    const cols = IND.INDICADORES.filter((i) => fam.categorias.includes(i.categoria));
    let sortKey = STATE.matrixSort.key || cols[0].key;
    let sortDir = STATE.matrixSort.dir;

    const colStats = {};
    cols.forEach((c) => {
      const vals = DATA.municipios.map((m) => m[c.key]).filter(numeric);
      colStats[c.key] = { min: Math.min(...vals), max: Math.max(...vals) };
    });

    const sorted = [...DATA.municipios].sort((a, b) => {
      const va = numeric(a[sortKey]) ? a[sortKey] : -Infinity;
      const vb = numeric(b[sortKey]) ? b[sortKey] : -Infinity;
      return sortDir === 'asc' ? va - vb : vb - va;
    });

    const table = $('#emMatrizTable');
    table.innerHTML = `
      <thead><tr>
        <th data-key="nombre" style="text-align:left;cursor:default;">Municipio</th>
        ${cols.map((c) => `<th data-key="${c.key}" title="${c.definicion.replace(/"/g, '&quot;')}" class="${sortKey === c.key ? 'sorted ' + sortDir : ''}">${c.nombre}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${sorted.map((m) => {
          const cIdx = compareIndex(m.slug);
          const rowStyle = m.slug === STATE.selectedMuni ? 'outline:2px solid var(--aa-navy,#071D2B);outline-offset:-2px;' : '';
          return `<tr data-slug="${m.slug}" style="${rowStyle}">
            <td style="text-align:left;font-weight:700;">${cIdx >= 0 ? `<span class="em-badge-compare" style="background:${COMPARE_COLORS[cIdx]};">${cIdx + 1}</span>` : ''}${m.nombre}</td>
            ${cols.map((c) => {
              const v = m[c.key];
              const bg = numeric(v) ? colorScale(v, colStats[c.key].min, colStats[c.key].max) : '#eee';
              const dark = numeric(v) && (v - colStats[c.key].min) / ((colStats[c.key].max - colStats[c.key].min) || 1) > 0.6;
              return `<td style="background:${bg};color:${dark ? '#fff' : '#071D2B'};">${IND.formatValue(c.key, v)}</td>`;
            }).join('')}
          </tr>`;
        }).join('')}
      </tbody>
    `;
    table.querySelectorAll('th[data-key]:not([data-key="nombre"])').forEach((th) => {
      th.addEventListener('click', () => {
        const k = th.dataset.key;
        STATE.matrixSort.dir = (STATE.matrixSort.key === k && STATE.matrixSort.dir === 'desc') ? 'asc' : 'desc';
        STATE.matrixSort.key = k;
        renderMatrix();
      });
    });
    table.querySelectorAll('tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => selectMuni(tr.dataset.slug));
    });
  }

  // ═══════════════════ gráfico relacional (scatter) ═══════════════════
  function populateScatterControls() {
    const xSel = $('#emScatterX'), ySel = $('#emScatterY');
    const opts = MAP_INDICATOR_ORDER.map((k) => `<option value="${k}">${IND.BY_KEY.get(k).nombre}</option>`).join('');
    xSel.innerHTML = opts; ySel.innerHTML = opts;
    xSel.value = STATE.scatterX; ySel.value = STATE.scatterY;
    xSel.addEventListener('change', () => { STATE.scatterX = xSel.value; renderScatter(); });
    ySel.addEventListener('change', () => { STATE.scatterY = ySel.value; renderScatter(); });
  }

  function renderScatter() {
    const svg = $('#emScatterSvg');
    const W = 640, H = 440, PAD = { l: 60, r: 46, t: 46, b: 50 };
    const xKey = STATE.scatterX, yKey = STATE.scatterY;
    const sizeKey = 'valorFiscalCeroKm', colorKey = 'crecimientoPoblacional';

    const usable = DATA.municipios.filter((m) => numeric(m[xKey]) && numeric(m[yKey]));
    const excluded = DATA.municipios.length - usable.length;
    $('#emScatterNote').textContent = excluded > 0
      ? `${excluded} municipio(s) sin dato numérico para ${excluded === 1 ? 'uno de los ejes elegidos' : 'los ejes elegidos'} — no se grafican.`
      : '';

    if (!usable.length) { svg.innerHTML = ''; return; }

    const xs = usable.map((m) => m[xKey]), ys = usable.map((m) => m[yKey]);
    const sizes = DATA.municipios.map((m) => m[sizeKey]).filter(numeric);
    const colors = DATA.municipios.map((m) => m[colorKey]).filter(numeric);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const sMin = Math.min(...sizes), sMax = Math.max(...sizes);
    const cMin = Math.min(...colors), cMax = Math.max(...colors);

    const px = (v) => PAD.l + (xMax === xMin ? 0.5 : (v - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
    const py = (v) => H - PAD.b - (yMax === yMin ? 0.5 : (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
    const pr = (v) => {
      if (!numeric(v) || sMax === sMin) return 10;
      return 7 + Math.sqrt((v - sMin) / (sMax - sMin)) * 16;
    };

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let html = '';
    // grillas + ejes
    for (let i = 0; i <= 4; i++) {
      const gx = PAD.l + (i / 4) * (W - PAD.l - PAD.r);
      const gy = PAD.t + (i / 4) * (H - PAD.t - PAD.b);
      html += `<line class="em-scatter-grid" x1="${gx}" y1="${PAD.t}" x2="${gx}" y2="${H - PAD.b}"/>`;
      html += `<line class="em-scatter-grid" x1="${PAD.l}" y1="${gy}" x2="${W - PAD.r}" y2="${gy}"/>`;
    }
    html += `<line class="em-scatter-axis" x1="${PAD.l}" y1="${H - PAD.b}" x2="${W - PAD.r}" y2="${H - PAD.b}"/>`;
    html += `<line class="em-scatter-axis" x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${H - PAD.b}"/>`;
    html += `<text class="em-scatter-label" x="${PAD.l}" y="${H - PAD.b + 16}">${IND.formatValue(xKey, xMin)}</text>`;
    html += `<text class="em-scatter-label" x="${W - PAD.r}" y="${H - PAD.b + 16}" text-anchor="end">${IND.formatValue(xKey, xMax)}</text>`;
    html += `<text class="em-scatter-label" x="${(PAD.l + W - PAD.r) / 2}" y="${H - 6}" text-anchor="middle" font-weight="700">${IND.BY_KEY.get(xKey).nombre}</text>`;
    html += `<text class="em-scatter-label" x="${PAD.l - 6}" y="${H - PAD.b}" text-anchor="end">${IND.formatValue(yKey, yMin)}</text>`;
    html += `<text class="em-scatter-label" x="${PAD.l - 6}" y="${PAD.t + 8}" text-anchor="end">${IND.formatValue(yKey, yMax)}</text>`;
    html += `<text class="em-scatter-label" x="14" y="${(PAD.t + H - PAD.b) / 2}" text-anchor="middle" font-weight="700" transform="rotate(-90 14 ${(PAD.t + H - PAD.b) / 2})">${IND.BY_KEY.get(yKey).nombre}</text>`;

    usable.forEach((m) => {
      const x = px(m[xKey]), y = py(m[yKey]), r = pr(m[sizeKey]);
      const fill = numeric(m[colorKey]) ? colorScale(m[colorKey], cMin, cMax) : '#c9d6d9';
      const cIdx = compareIndex(m.slug);
      const isSelected = m.slug === STATE.selectedMuni;
      html += `<circle class="em-scatter-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}" data-slug="${m.slug}"/>`;
      html += `<text class="em-scatter-muni-label" x="${x.toFixed(1)}" y="${(y - r - 9).toFixed(1)}" text-anchor="middle">${m.nombre}</text>`;
      // marcador con fondo blanco propio (no un aro sobre el punto): el
      // color del punto también sale de la paleta cian→navy y un aro de
      // color puede perderse contra un relleno similar.
      if (isSelected || cIdx >= 0) {
        const color = cIdx >= 0 ? COMPARE_COLORS[cIdx] : '#071D2B';
        const mx = x + r + 7, my = y - r - 7;
        html += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="8" fill="#fff" stroke="${color}" stroke-width="2" pointer-events="none"/>`;
        if (cIdx >= 0) {
          html += `<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="800" fill="${color}" pointer-events="none">${cIdx + 1}</text>`;
        } else {
          html += `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="3" fill="${color}" pointer-events="none"/>`;
        }
      }
    });

    svg.innerHTML = html;
    svg.querySelectorAll('.em-scatter-point').forEach((c) => {
      c.addEventListener('click', () => selectMuni(c.dataset.slug));
      c.addEventListener('mousemove', (e) => {
        const m = DATA.municipios.find((x) => x.slug === c.dataset.slug);
        showTooltip(e, m, xKey);
      });
      c.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ═══════════════════ 5 · FICHA MUNICIPAL ═══════════════════
  function miniScale(key, value) {
    const vals = DATA.municipios.map((m) => m[key]).filter(numeric);
    if (!numeric(value) || !vals.length) return '';
    const min = Math.min(...vals), max = Math.max(...vals);
    const pos = max === min ? 50 : ((value - min) / (max - min)) * 100;
    return `<div class="em-mini-scale"><div class="fill" style="left:${pos}%;"></div></div>`;
  }

  function openFicha(slug) {
    const m = DATA.municipios.find((x) => x.slug === slug);
    if (!m) return;
    function cmp(key) {
      const v = m[key];
      if (!numeric(v)) return '';
      const info = rankInfo(key, slug);
      return `Posición ${info.rank} de ${info.total} · ${pctLabel(info.pct)}`;
    }
    const rows = (pairs) => pairs.map(([k, label]) => `
      <div class="em-ficha-row"><span class="l">${label || IND.BY_KEY.get(k).nombre}</span>
        <span class="v">${IND.formatValue(k, m[k])}${IND.BY_KEY.get(k).enFicha !== false ? `<small>${cmp(k)}</small>${miniScale(k, m[k])}` : ''}</span>
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
        <div class="em-ficha-group">Electromovilidad (composición BEV/PHEV)</div>
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
      'Los polígonos del mapa provienen del servicio WFS del IGN (capa ign:departamento, límites catastrales de ARBA), simplificados para uso web — no aptos para mediciones catastrales.',
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
    populateMapControls();
    populateMatrixControls();
    populateScatterControls();
    syncAll();
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
