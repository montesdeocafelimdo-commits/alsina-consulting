/*
 * MONITOR 135 — Fase 3: experiencia unificada.
 * Depende de los datos legacy embebidos en municipios-data-hub.html
 * (MUNIS, GEO_DATA, EXTRA, DATA, PATHS, DN, ELEC_DATA/window.electoralData)
 * y de la capa de corrección de Fase 2: /assets/data/monitor135-municipios.json
 * (PATCH). No inventa valores: todo lo que no está en PATCH/legacy se
 * muestra como "sin dato disponible" y se excluye de promedios y rankings.
 */
(function () {
  'use strict';

  let PATCH = null;
  let PATCH_EDU = null;
  let CATEGORIES = [];
  let VAR_INDEX = {};
  let state = {
    categoria: 'finanzas',
    variable: 'trans_var_real',
    periodo: '1s',
    modo: 'total',
    selected: null,     // municipio seleccionado (clave MUNIS)
    compare: [],         // hasta 4 municipios
    activeTab: 'radiografia',
    zoom: 'provincia',
  };

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  // ── formatters ──────────────────────────────────────────────
  function normSearch(s) { return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function dn(m) { return (GEO_DATA[m] && GEO_DATA[m].nd) || (PATCH && PATCH.municipios[m] && PATCH.municipios[m].municipio) || m; }
  function fmtMoney(v) {
    if (v === null || v === undefined) return '—';
    const a = Math.abs(v);
    if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + ' B';
    if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + ' M';
    if (a >= 1e3) return '$' + Math.round(v / 1e3).toLocaleString('es-AR') + ' K';
    return '$' + Math.round(v).toLocaleString('es-AR');
  }
  function fmtMoneyFull(v) { return v == null ? '—' : '$' + Math.round(v).toLocaleString('es-AR'); }
  function fmtPct(v, d) { d = d === undefined ? 1 : d; if (v === null || v === undefined) return '—'; const n = v * 100; return (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(d).replace('.', ',') + '%'; }
  function fmtPctPlain(v, d) { d = d === undefined ? 2 : d; if (v === null || v === undefined) return '—'; return v.toFixed(d).replace('.', ',') + '%'; }
  function fmtNum(v, d) { d = d === undefined ? 0 : d; return (v === null || v === undefined) ? '—' : v.toLocaleString('es-AR', { maximumFractionDigits: d }); }
  function median(arr) { const a = arr.slice().sort((x, y) => x - y); const n = a.length; if (!n) return null; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ── paleta cualitativa (fuerzas políticas 2025) ────────────────
  const FUERZA_COLORS = { 'Fuerza Patria': '#2563eb', 'Somos': '#eab308', 'LLA': '#7c3aed', 'La Libertad Avanza': '#7c3aed', 'Hechos': '#ec4899' };
  const QUAL_FALLBACK = ['#00D5D8', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#64748b'];
  const qualColorCache = {};
  function qualColor(catId, value) {
    if (!value) return '#c9d3d8';
    if (catId === 'fuerza' && FUERZA_COLORS[value]) return FUERZA_COLORS[value];
    const key = catId + '::' + value;
    if (!qualColorCache[key]) {
      const used = Object.keys(qualColorCache).filter(k => k.startsWith(catId + '::')).length;
      qualColorCache[key] = QUAL_FALLBACK[used % QUAL_FALLBACK.length];
    }
    return qualColorCache[key];
  }

  // ── VAR REGISTRY ────────────────────────────────────────────
  function buildRegistry() {
    const T = m => (PATCH.municipios[m] || {}).transferencias;
    const per = () => state.periodo === 'jun' ? 'junio' : 'primer_semestre';
    const periodLabel = () => state.periodo === 'jun' ? 'Junio 2026 vs. junio 2025' : '1er semestre 2026 vs. 1S 2025';

    CATEGORIES = [
      {
        id: 'finanzas', label: 'Finanzas y Transferencias', vars: [
          {
            id: 'trans_var_real', label: 'Variación real de transferencias', unidad: '%', tipo: 'div',
            get periodo() { return periodLabel(); }, fuente: 'Ministerio de Economía PBA', url: 'https://www.gba.gob.ar/economia/direccion_provincial_de_coordinacion_municipal_y_programas_de_desarrollo/transferencias_municipios',
            descripcion: 'Variación de lo transferido por la Provincia, descontando la inflación (IPC INDEC, deflactación mensual).',
            get: m => { const t = T(m); return t ? t[per()].variacion_real : null; },
          },
          {
            id: 'trans_var_nominal', label: 'Variación nominal de transferencias', unidad: '%', tipo: 'div',
            get periodo() { return periodLabel(); }, fuente: 'Ministerio de Economía PBA',
            descripcion: 'Variación en pesos corrientes, sin descontar inflación.',
            get: m => { const t = T(m); return t ? t[per()].variacion_nominal : null; },
          },
          {
            id: 'trans_total', label: 'Transferencias recibidas', unidad: '$', tipo: 'seq',
            get periodo() { return state.periodo === 'jun' ? 'Junio 2026' : '1er semestre 2026'; }, fuente: 'Ministerio de Economía PBA',
            descripcion: 'Total transferido por la Provincia (Coparticipación + fondos específicos).',
            get: m => { const t = T(m); return t ? t[per()].total_2026 : null; },
          },
          {
            id: 'trans_percapita', label: 'Transferencias por habitante', unidad: '$/hab', tipo: 'seq',
            get periodo() { return state.periodo === 'jun' ? 'Junio 2026' : '1er semestre 2026'; }, fuente: 'Min. Economía PBA · Censo 2022',
            descripcion: 'Total transferido dividido por la población del Censo 2022.',
            get: m => { const t = T(m); const pop = getPoblacion(m); return (t && pop) ? t[per()].total_2026 / pop : null; },
          },
          {
            id: 'presupuesto', label: 'Presupuesto municipal 2026', unidad: '$', tipo: 'seq', periodo: '2026',
            fuente: 'Min. Economía PBA — Finanzas Municipales', descripcion: 'Presupuesto vigente informado por el municipio a la Provincia.',
            get: m => (PATCH.municipios[m] || {}).presupuesto_2026 ? PATCH.municipios[m].presupuesto_2026.valor : null,
          },
          {
            id: 'presupuesto_pc', label: 'Presupuesto por habitante', unidad: '$/hab', tipo: 'seq', periodo: '2026',
            fuente: 'Min. Economía PBA · Censo 2022', descripcion: 'Presupuesto 2026 dividido por población.',
            get: m => (PATCH.municipios[m] || {}).presupuesto_2026 ? PATCH.municipios[m].presupuesto_2026.valor_per_capita : null,
          },
          {
            id: 'cud', label: 'CUD — Coeficiente Único de Distribución', unidad: '%', tipo: 'seq', periodo: '2026',
            fuente: 'Min. Economía PBA', descripcion: 'Porcentaje de la coparticipación provincial que corresponde a cada municipio.',
            get: m => { const c = (PATCH.municipios[m] || {}).cud_pct_2026; return c && c.estado === 'disponible' ? c.valor : null; },
          },
        ]
      },
      {
        id: 'poblacion', label: 'Población y Territorio', vars: [
          { id: 'poblacion', label: 'Población', unidad: 'hab.', tipo: 'seq', periodo: 'Censo 2022', fuente: 'INDEC / SCBA', descripcion: 'Población total según el Censo Nacional 2022.', get: getPoblacion },
          { id: 'superficie', label: 'Superficie', unidad: 'km²', tipo: 'seq', periodo: '—', fuente: 'SCBA', descripcion: 'Superficie del partido.', get: m => n(GEO_DATA[m] && GEO_DATA[m].sup) },
          { id: 'densidad', label: 'Densidad poblacional', unidad: 'hab/km²', tipo: 'seq', periodo: 'Censo 2022', fuente: 'INDEC / SCBA', descripcion: 'Habitantes por kilómetro cuadrado.', get: m => n(GEO_DATA[m] && GEO_DATA[m].den) },
          { id: 'categoria_pob', label: 'Categoría poblacional', unidad: '', tipo: 'qual', periodo: 'Censo 2022', fuente: 'INDEC / SCBA', descripcion: 'Rango poblacional del municipio.', get: m => (GEO_DATA[m] && GEO_DATA[m].cat) || null },
        ]
      },
      {
        id: 'economia', label: 'Economía y Producción', vars: [
          { id: 'empresas', label: 'Empresas', unidad: 'cant.', tipo: 'seq', periodo: '2019', fuente: 'Base económica Alsina', descripcion: 'Cantidad de empresas registradas en el municipio.', get: m => n(EXTRA[m] && EXTRA[m]['Cantidad Empresas']) },
          { id: 'empresas_exp', label: 'Empresas exportadoras', unidad: 'cant.', tipo: 'seq', periodo: '2019', fuente: 'Base económica Alsina', descripcion: 'Empresas con actividad exportadora identificada.', get: m => n(EXTRA[m] && EXTRA[m]['Cantidad Empresas Exportadoras']) },
          { id: 'pbg', label: 'Producto Bruto Geográfico', unidad: 'M$ (const. 2004)', tipo: 'seq', periodo: '2023', fuente: 'Alsina — Informe PBG', descripcion: 'PBG municipal a precios constantes de 2004. No confundir con el PBG provincial total.', get: m => n(EXTRA[m] && EXTRA[m]['PBG 2023 (M$ const.2004)']) },
          { id: 'pbg_var', label: 'Variación del PBG 2022-2023', unidad: '%', tipo: 'div', periodo: '2022-2023', fuente: 'Alsina — Informe PBG', descripcion: 'Variación interanual del PBG municipal.', get: m => { const v = EXTRA[m] && EXTRA[m]['Var% PBG 22-23']; return v == null ? null : v / 100; } },
          { id: 'recaudacion_propia', label: 'Recaudación propia municipal', unidad: '$', tipo: 'seq', periodo: '2021', fuente: 'Base económica Alsina', descripcion: 'Recursos que el municipio recauda por sus propios medios (tasas, derechos).', get: m => n(EXTRA[m] && EXTRA[m]['Recaudación propia 2021 ($)']) },
          { id: 'nbi', label: 'Necesidades Básicas Insatisfechas', unidad: '%', tipo: 'div_alert', periodo: 'Censo 2010', fuente: 'INDEC', descripcion: 'Porcentaje de población con NBI. Dato no actualizado por el Censo 2022.', get: m => { const v = EXTRA[m] && EXTRA[m]['NBI (%)']; return v == null ? null : v / 100; } },
        ]
      },
      {
        id: 'educacion', label: 'Educación', vars: [
          { id: 'edu_matricula_total', label: 'Matrícula total', unidad: 'alumnos', tipo: 'seq', periodo: '2025', fuente: 'DGCyE PBA — Anuario Estadístico 2025', descripcion: 'Total de alumnos matriculados en todos los niveles y sectores.', get: m => eduVal(m, 'edu_matricula_total') },
          { id: 'edu_var_matricula_2015_2025', label: 'Variación de matrícula total 2015–2025', unidad: '%', tipo: 'div', periodo: '2015–2025', fuente: 'DGCyE PBA', descripcion: 'Variación porcentual de la matrícula total entre 2015 y 2025.', get: m => eduVal(m, 'edu_var_matricula_2015_2025'), getFlag: m => eduFlag(m, 'edu_var_matricula_2015_2025') },
          { id: 'edu_var_secundaria_2019_2025', label: 'Variación de matrícula secundaria 2019–2025', unidad: '%', tipo: 'div', periodo: '2019–2025', fuente: 'DGCyE PBA', descripcion: 'Variación porcentual de la matrícula de nivel secundario entre 2019 y 2025.', get: m => eduVal(m, 'edu_var_secundaria_2019_2025'), getFlag: m => eduFlag(m, 'edu_var_secundaria_2019_2025') },
          { id: 'edu_alumnos_por_sede', label: 'Alumnos por sede educativa', unidad: 'alumnos/sede', tipo: 'seq', periodo: '2025', fuente: 'DGCyE PBA — Nómina de Unidades de Servicio', descripcion: 'Matrícula total dividida por la cantidad de sedes únicas (edificios escolares).', get: m => eduVal(m, 'edu_alumnos_por_sede'), getFlag: m => eduFlag(m, 'edu_alumnos_por_sede') },
          { id: 'edu_alumnos_por_seccion', label: 'Alumnos por sección', unidad: 'alumnos/sección', tipo: 'seq', periodo: '2025', fuente: 'DGCyE PBA', descripcion: 'Matrícula total dividida por la cantidad de secciones (aulas/grados).', get: m => eduVal(m, 'edu_alumnos_por_seccion'), getFlag: m => eduFlag(m, 'edu_alumnos_por_seccion') },
          { id: 'edu_var_unidades_2015_2025', label: 'Variación de unidades de servicio 2015–2025', unidad: '%', tipo: 'div', periodo: '2015–2025', fuente: 'DGCyE PBA', descripcion: 'Variación porcentual de la cantidad de unidades de servicio educativo entre 2015 y 2025.', get: m => eduVal(m, 'edu_var_unidades_2015_2025'), getFlag: m => eduFlag(m, 'edu_var_unidades_2015_2025') },
          { id: 'edu_brecha_matricula_red', label: 'Brecha matrícula/red', unidad: 'p.p.', tipo: 'div', periodo: '2015–2025', fuente: 'Cálculo Alsina', descripcion: 'Variación de matrícula 2015–2025 menos variación de unidades de servicio 2015–2025. Positiva: la matrícula creció más rápido que la red. Negativa: la oferta creció más rápido que la matrícula, o la matrícula se contrajo.', get: m => eduVal(m, 'edu_brecha_matricula_red') },
          { id: 'edu_abandono_secundario', label: 'Abandono interanual secundario', unidad: '%', tipo: 'div_alert', periodo: '2024–2025', fuente: 'DGCyE PBA', descripcion: 'Tasa de abandono interanual del nivel secundario. Puede ser negativa cuando el retorno de alumnos supera al abandono neto entre años — no es un error de carga.', get: m => eduVal(m, 'edu_abandono_secundario'), getFlag: m => eduFlag(m, 'edu_abandono_secundario') },
          { id: 'edu_promocion_secundaria', label: 'Promoción efectiva secundaria', unidad: '%', tipo: 'seq', periodo: '2024–2025', fuente: 'DGCyE PBA', descripcion: 'Porcentaje de alumnos promovidos de manera efectiva en el nivel secundario.', get: m => eduVal(m, 'edu_promocion_secundaria') },
          { id: 'edu_sobreedad_secundaria', label: 'Sobreedad secundaria', unidad: '%', tipo: 'seq', periodo: '2025', fuente: 'DGCyE PBA', descripcion: 'Porcentaje de alumnos con edad superior a la esperada para el año que cursan, nivel secundario.', get: m => eduVal(m, 'edu_sobreedad_secundaria') },
          { id: 'edu_participacion_estatal', label: 'Participación de matrícula estatal', unidad: '%', tipo: 'seq', periodo: '2025', fuente: 'DGCyE PBA', descripcion: 'Porcentaje de la matrícula total que asiste a establecimientos de gestión estatal.', get: m => eduVal(m, 'edu_participacion_estatal') },
        ],
        groups: [
          { label: 'Demanda educativa', varIds: ['edu_matricula_total', 'edu_var_matricula_2015_2025', 'edu_var_secundaria_2019_2025'] },
          { label: 'Presión sobre la red', varIds: ['edu_alumnos_por_sede', 'edu_alumnos_por_seccion', 'edu_var_unidades_2015_2025', 'edu_brecha_matricula_red'] },
          { label: 'Trayectorias educativas', varIds: ['edu_abandono_secundario', 'edu_promocion_secundaria', 'edu_sobreedad_secundaria'] },
          { label: 'Configuración del sistema', varIds: ['edu_participacion_estatal'] },
        ],
      },
      { id: 'salud', label: 'Salud', vars: [], comingSoon: true },
      {
        id: 'gobierno', label: 'Gobierno y Elecciones', vars: [
          { id: 'fuerza', label: 'Fuerza política de gobierno', unidad: '', tipo: 'qual', periodo: '2025-2027', fuente: 'Elecciones municipales 2025', descripcion: 'Fuerza política del intendente en ejercicio.', get: m => (GEO_DATA[m] && GEO_DATA[m].fuerza_2025) || null },
          { id: 'electores', label: 'Electores', unidad: 'personas', tipo: 'seq', periodo: '2025', fuente: 'Junta Electoral PBA', descripcion: 'Padrón electoral (nacionales + extranjeros).', get: m => { const g = GEO_DATA[m]; return g && g.elec_nac != null ? g.elec_nac + (g.elec_ext || 0) : null; } },
        ]
      },
      { id: 'info_publica', label: 'Información Pública', vars: [], comingSoon: true },
    ];

    VAR_INDEX = {};
    CATEGORIES.forEach(c => c.vars.forEach(v => { v.catId = c.id; v.catLabel = c.label; VAR_INDEX[v.id] = v; }));
  }
  function n(v) { return (v === undefined || v === null) ? null : v; }
  function getPoblacion(m) {
    const p = PATCH && PATCH.municipios[m] && PATCH.municipios[m].poblacion;
    if (p && p.valor != null) return p.valor;
    return (GEO_DATA[m] && GEO_DATA[m].p22) || null;
  }
  // ── Educación: assets/data/monitor135-educacion.json (aditivo, ver PATCH_EDU) ──
  function edu(m, campo) {
    const rec = PATCH_EDU && PATCH_EDU.municipios[m] && PATCH_EDU.municipios[m][campo];
    return rec || null;
  }
  function eduVal(m, campo) { const r = edu(m, campo); return r ? r.valor : null; }
  function eduFlag(m, campo) { const r = edu(m, campo); return r ? (r.quality_flag || null) : null; }

  // ── stats por variable ──────────────────────────────────────
  function computeStats(varDef) {
    const withData = [], without = [];
    MUNIS.forEach(m => {
      const v = varDef.get(m);
      if (v === null || v === undefined || Number.isNaN(v)) without.push(m);
      else withData.push({ m, v });
    });
    const values = withData.map(x => x.v);
    const stats = {
      withData, without, n: withData.length, nMissing: without.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      median: values.length ? median(values) : null,
    };
    return stats;
  }

  // ══════════════════════════════════════════════════════════
  // SISTEMA CROMÁTICO — MAPAS COROPLÉTICOS ESTADÍSTICOS
  // Paleta "coral–azul institucional" (opción 4). Se usa EXCLUSIVAMENTE
  // para variables numéricas (tipo 'seq' | 'seq_inv' | 'div' | 'div_alert').
  // El mapa "electoral" de este Data Hub es la vista cualitativa (tipo
  // 'qual': fuerza política, categoría poblacional) — su color sale de
  // qualColor()/FUERZA_COLORS, una función totalmente separada que esta
  // paleta no toca en absoluto. No compartir variables entre ambos.
  // ══════════════════════════════════════════════════════════
  const CHOROPLETH_DIVERGING_COLORS = [
    '#E15C64', // caída extrema
    '#F08A8E', // caída alta
    '#F4B8B8', // caída moderada
    '#F9DADA', // caída leve
    '#F5F7FA', // cero / punto medio
    '#C8DAEF', // suba leve
    '#7FA9D9', // suba moderada
    '#426FA5', // suba alta
    '#173F73', // suba extrema
  ];
  const CHOROPLETH_SEQUENTIAL_COLORS = [
    '#EEF3F9', '#D9E5F2', '#B9CEE6', '#91B1D5', '#668FBE', '#426FA5', '#294F82', '#173F73',
  ];
  const CHOROPLETH_NO_DATA_COLOR = '#DDE3E8';
  const CHOROPLETH_BORDER_COLOR = '#65727C';
  const CHOROPLETH_BORDER_WIDTH = 0.8;
  const CHOROPLETH_HOVER_STROKE = '#081C24';
  const CHOROPLETH_HOVER_STROKE_WIDTH = 1.8;
  const CHOROPLETH_SELECTED_STROKE = '#081C24';
  const CHOROPLETH_SELECTED_STROKE_WIDTH = 2.5;
  const choroplethColorSystem = {
    diverging: CHOROPLETH_DIVERGING_COLORS,
    sequential: CHOROPLETH_SEQUENTIAL_COLORS,
    noData: CHOROPLETH_NO_DATA_COLOR,
  };
  // El sistema electoral (partidos/fuerzas) vive aparte, sin tocar:
  // ver qualColor() / FUERZA_COLORS / QUAL_FALLBACK más arriba.

  function hexToRgb(hex) { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mixHex(h1, h2, t) {
    const c1 = hexToRgb(h1), c2 = hexToRgb(h2);
    return `rgb(${Math.round(c1[0] + (c2[0] - c1[0]) * t)},${Math.round(c1[1] + (c2[1] - c1[1]) * t)},${Math.round(c1[2] + (c2[2] - c1[2]) * t)})`;
  }
  function interpolateStops(stops, t) {
    const tt = Math.max(0, Math.min(1, t));
    const n = stops.length - 1;
    const pos = tt * n;
    const i = Math.max(0, Math.min(n - 1, Math.floor(pos)));
    return mixHex(stops[i], stops[i + 1], pos - i);
  }

  // ── color por valor ─────────────────────────────────────────
  function seqColor(t) { return interpolateStops(choroplethColorSystem.sequential, t); } // t: 0..1
  function divColor(t) { // t: -1..1, con 0 exactamente en el stop central (#F5F7FA)
    const tt = Math.max(-1, Math.min(1, t));
    return interpolateStops(choroplethColorSystem.diverging, (tt + 1) / 2);
  }

  function colorFor(varDef, value, stats) {
    if (value === null || value === undefined) return choroplethColorSystem.noData;
    if (varDef.tipo === 'qual') return qualColor(varDef.id, value); // mapa electoral/categórico: paleta aparte, sin tocar
    if (varDef.tipo === 'div' || varDef.tipo === 'div_alert') {
      // el cero es el centro matemático: cada lado se normaliza de forma
      // independiente contra su propio extremo (min o max), no contra un
      // span compartido — así un rango asimétrico no corre el punto neutro.
      let t;
      if (value >= 0) { const posMax = stats.max > 0 ? stats.max : 1; t = Math.min(1, value / posMax); }
      else { const negMax = stats.min < 0 ? Math.abs(stats.min) : 1; t = -Math.min(1, Math.abs(value) / negMax); }
      return divColor(t);
    }
    if (varDef.tipo === 'seq_inv') { // ranking: 1 = mejor -> extremo azul profundo
      const t = stats.max ? 1 - (value - 1) / (stats.max - 1 || 1) : .5;
      return seqColor(t);
    }
    const t = (stats.max !== stats.min) ? (value - stats.min) / (stats.max - stats.min) : .5;
    return seqColor(t);
  }

  function fmtValue(varDef, v) {
    if (v === null || v === undefined) return 'Sin dato disponible';
    if (varDef.tipo === 'div' || varDef.tipo === 'div_alert') return fmtPct(v, varDef.id === 'pbg_var' ? 1 : 2);
    if (varDef.unidad === '$') return fmtMoney(v);
    if (varDef.unidad === '$/hab') return '$' + Math.round(v).toLocaleString('es-AR');
    if (varDef.unidad === '%') return fmtPctPlain(v, varDef.id === 'cud' ? 5 : 2); // cud ya viene expresado como % (ej. 0.45859 = 0,45859%), no se multiplica por 100
    if (varDef.unidad === '#') return '#' + v;
    if (varDef.tipo === 'qual') return v;
    return fmtNum(v, 1);
  }

  // ══════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    $('#m135App').classList.add('show'); // la app ya se ve (dimmed) detrás de la intro
    wireIntro();
    wireHeaderSearch();
    wireMobileFilters();
    wireTabs();
    $('#btnReplayIntro').addEventListener('click', showIntro);
    $('#mapClearSel').addEventListener('click', () => selectMuni(null));
    $('#zoomProvincia').addEventListener('click', () => setZoom('provincia'));
    $('#zoomAmba').addEventListener('click', () => setZoom('amba'));
    $('#zoomReset').addEventListener('click', () => setZoom('provincia'));
    $('#verComoRanking').addEventListener('click', () => switchTab('ranking'));

    // FASE 5 (AD-19): el dataset ya no es un archivo estático — pasa por
    // /api/monitor135/data, que filtra según la capacidad real de quien
    // pide (resuelta server-side desde la sesión, nunca por el frontend).
    const authedFetch = (window.AlsinaAuth && window.AlsinaAuth.authedFetch) || fetch;

    Promise.all([
      authedFetch('/api/monitor135/data?dataset=municipios').then(r => r.json()),
      authedFetch('/api/monitor135/data?dataset=educacion').then(r => r.json()).catch(err => {
        // La dimensión de Educación es aditiva: si su archivo no carga, el
        // resto de Monitor 135 (finanzas, población, economía, gobierno,
        // mapa electoral) debe seguir funcionando igual.
        console.error('Monitor 135: no se pudo cargar la base de Educación', err);
        return null;
      }),
    ])
      .then(([data, edu]) => {
        if (data.access && data.access.level === 'none') {
          $('#tab-radiografia').innerHTML =
            '<div style="padding:40px 20px;text-align:center;">' +
            '<p style="color:var(--concreto,#9e9992);font-size:.95rem;margin-bottom:16px;">Monitor 135 es un beneficio de cuenta — sumate gratis a Concejal para ver los indicadores.</p>' +
            '<a href="/planes.html" class="btn">Crear mi cuenta gratis →</a></div>';
          return;
        }
        PATCH = data;
        PATCH_EDU = edu;
        boot();
      })
      .catch(err => {
        console.error('Monitor 135: no se pudo cargar la base de datos', err);
        $('#tab-radiografia').innerHTML = '<p style="padding:20px;color:var(--coral-d)">No se pudo cargar la base de datos de Monitor 135 en este momento.</p>';
      });
  });

  function boot() {
    buildRegistry();
    const nInd = CATEGORIES.reduce((a, c) => a + c.vars.length, 0);
    $('#covIndicadores').textContent = nInd;
    const cov = PATCH.meta.cobertura;
    $('#covPresupuesto').textContent = cov.municipios_con_presupuesto_2026 + '/135';

    readURLState();
    renderCtrl();
    renderMap();
    renderLegend();
    renderTab(state.activeTab);
    wireCtrl();
    wireMapPaths();
  }

  // ── INTRO (overlay sobre la app, que ya está visible de fondo) ──
  function wireIntro() {
    const KEY = 'monitor135_intro_seen';
    const intro = $('#m135Intro');
    function enter(tab) {
      intro.style.display = 'none';
      localStorage.setItem(KEY, '1');
      if (tab) switchTab(tab);
      if (tab === 'radiografia') $('#m135Search').focus();
    }
    $('#introEnterBtn').addEventListener('click', () => enter());
    $('#introSearchBtn').addEventListener('click', () => enter('radiografia'));
    $('#introCompareBtn').addEventListener('click', () => enter('comparar'));
    if (localStorage.getItem(KEY) && !location.search.includes('intro=1')) {
      intro.style.display = 'none';
    }
  }
  function showIntro() { $('#m135Intro').style.display = 'flex'; }

  // ── URL STATE ───────────────────────────────────────────────
  function readURLState() {
    const p = new URLSearchParams(location.search);
    const muni = p.get('municipio');
    if (muni && MUNIS.includes(muni)) state.selected = muni;
    if (p.get('var') && VAR_INDEX[p.get('var')]) { state.variable = p.get('var'); state.categoria = VAR_INDEX[p.get('var')].catId; }
    if (p.get('periodo') === 'jun' || p.get('periodo') === '1s') state.periodo = p.get('periodo');
    if (p.get('cmp')) state.compare = p.get('cmp').split(',').filter(m => MUNIS.includes(m)).slice(0, 4);
    if (state.selected || (state.compare && state.compare.length)) {
      $('#m135Intro').style.display = 'none';
      localStorage.setItem('monitor135_intro_seen', '1');
      if (state.compare.length) state.activeTab = 'comparar';
    }
  }
  function writeURLState() {
    const p = new URLSearchParams();
    if (state.selected) p.set('municipio', state.selected);
    p.set('var', state.variable);
    p.set('periodo', state.periodo);
    if (state.compare.length) p.set('cmp', state.compare.join(','));
    history.replaceState(null, '', location.pathname + '?' + p.toString());
  }

  // ── HEADER SEARCH ───────────────────────────────────────────
  function wireHeaderSearch() {
    const input = $('#m135Search'), box = $('#m135SearchResults');
    let idx = -1;
    input.addEventListener('input', () => {
      const q = normSearch(input.value.trim());
      if (!q) { close(); return; }
      const matches = MUNIS.filter(m => normSearch(dn(m)).includes(q)).slice(0, 8);
      render(matches);
    });
    input.addEventListener('keydown', e => {
      const items = $$('.m135-hdr-results button', box);
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); hl(items); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); hl(items); }
      else if (e.key === 'Enter') { if (items[idx]) items[idx].click(); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('click', e => { if (!box.contains(e.target) && e.target !== input) close(); });
    function hl(items) { items.forEach((it, i) => it.classList.toggle('focus', i === idx)); }
    function render(matches) {
      idx = -1;
      box.innerHTML = matches.length ? matches.map(m => `<button type="button" data-m="${esc(m)}" role="option">${esc(dn(m))}</button>`).join('') : '<div style="padding:9px 13px;color:rgba(255,255,255,.4);font-size:12px">Sin resultados</div>';
      box.classList.add('open'); input.setAttribute('aria-expanded', 'true');
      $$('button[data-m]', box).forEach(btn => btn.addEventListener('click', () => { input.value = ''; close(); selectMuni(btn.dataset.m); switchTab('radiografia'); }));
    }
    function close() { box.classList.remove('open'); box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); }
  }

  // ── MOBILE FILTER DRAWER ────────────────────────────────────
  function wireMobileFilters() {
    $('#mobFilterToggle').addEventListener('click', () => $('#m135Ctrl').classList.toggle('open'));
  }

  // ── TABS ────────────────────────────────────────────────────
  function wireTabs() {
    $$('.m135-tab').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  }
  function switchTab(id) {
    state.activeTab = id;
    $$('.m135-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    $$('.m135-tabpanel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + id));
    if (PATCH) renderTab(id);
  }
  function renderTab(id) {
    if (id === 'radiografia') renderRadiografia();
    else if (id === 'comparar') renderComparar();
    else if (id === 'ranking') renderRanking();
  }

  // ── CONTROLES ───────────────────────────────────────────────
  function renderCtrl() {
    const catSel = $('#ctrlCategoria');
    catSel.innerHTML = CATEGORIES.map(c => `<option value="${c.id}" ${c.id === state.categoria ? 'selected' : ''}>${esc(c.label)}${c.comingSoon ? ' (próximamente)' : ''}</option>`).join('');
    renderVarSelect();
    const periodoWrap = $('#ctrlPeriodoWrap');
    const varDef = VAR_INDEX[state.variable];
    const needsPeriodo = varDef && varDef.id.indexOf('trans_') === 0;
    periodoWrap.style.display = needsPeriodo ? '' : 'none';
    $('#ctrlPeriodo').innerHTML = `<option value="1s" ${state.periodo === '1s' ? 'selected' : ''}>1er semestre 2026</option><option value="jun" ${state.periodo === 'jun' ? 'selected' : ''}>Junio 2026</option>`;
  }
  function renderVarSelect() {
    const cat = CATEGORIES.find(c => c.id === state.categoria);
    const sel = $('#ctrlVariable');
    if (!cat || !cat.vars.length) {
      sel.innerHTML = '<option>Sin indicadores disponibles todavía</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    const opt = v => `<option value="${v.id}" ${v.id === state.variable ? 'selected' : ''}>${esc(v.label)}</option>`;
    if (cat.groups && cat.groups.length) {
      // selector jerárquico dentro de una misma categoría (ej. Educación:
      // Demanda / Presión sobre la red / Trayectorias / Configuración),
      // sin agregar un tercer <select> ni tocar el layout de m135-ctrl.
      const byId = {}; cat.vars.forEach(v => { byId[v.id] = v; });
      const grouped = new Set();
      let html = cat.groups.map(g => {
        const vars = g.varIds.map(id => byId[id]).filter(Boolean);
        vars.forEach(v => grouped.add(v.id));
        return vars.length ? `<optgroup label="${esc(g.label)}">${vars.map(opt).join('')}</optgroup>` : '';
      }).join('');
      const rest = cat.vars.filter(v => !grouped.has(v.id));
      if (rest.length) html += rest.map(opt).join('');
      sel.innerHTML = html;
    } else {
      sel.innerHTML = cat.vars.map(opt).join('');
    }
  }
  function wireCtrl() {
    $('#ctrlCategoria').addEventListener('change', e => {
      state.categoria = e.target.value;
      const cat = CATEGORIES.find(c => c.id === state.categoria);
      state.variable = cat.vars.length ? cat.vars[0].id : null;
      renderVarSelect(); afterVarChange();
    });
    $('#ctrlVariable').addEventListener('change', e => { state.variable = e.target.value; afterVarChange(); });
    $('#ctrlPeriodo').addEventListener('change', e => { state.periodo = e.target.value; afterVarChange(); });
  }
  function afterVarChange() {
    renderCtrl();
    renderMap(); renderLegend(); writeURLState();
    if (state.activeTab === 'radiografia') renderRadiografia();
    if (state.activeTab === 'ranking') renderRanking();
  }

  // ══════════════════════════════════════════════════════════
  // MAPA
  // ══════════════════════════════════════════════════════════
  let mapStats = null;
  function renderMap() {
    const svg = $('#m135map');
    const varDef = VAR_INDEX[state.variable];
    if (!varDef) { svg.innerHTML = ''; return; }
    mapStats = computeStats(varDef);
    // Aísla el sistema cromático: 'qual' = vista electoral/categórica (paleta propia,
    // sin tocar); cualquier otro tipo = mapa coroplético estadístico (coral–azul).
    svg.classList.toggle('is-choropleth', varDef.tipo !== 'qual');
    let html = '';
    MUNIS.forEach(m => {
      if (!PATHS[m]) return;
      const v = varDef.get(m);
      const color = colorFor(varDef, v, mapStats);
      const isSel = state.selected === m;
      const isCmp = state.compare.includes(m);
      const isAmbaMember = state.zoom === 'amba' && GEO_DATA[m] && GEO_DATA[m].cba;
      html += `<path class="m135-path${isSel ? ' sel' : ''}${isAmbaMember ? ' amba-member' : ''}" d="${PATHS[m]}" fill="${color}" data-m="${esc(m)}" tabindex="0" role="button" aria-label="${esc(dn(m))}"${isCmp ? ' stroke="#0e1c20" stroke-width="1.4"' : ''}></path>`;
    });
    svg.innerHTML = html;
  }
  function wireMapPaths() {
    const svg = $('#m135map'), tip = $('#m135Tooltip');
    svg.addEventListener('mouseover', e => { const p = e.target.closest('.m135-path'); if (p) showTip(p, e); });
    svg.addEventListener('mousemove', e => { const p = e.target.closest('.m135-path'); if (p) moveTip(e); });
    svg.addEventListener('mouseout', e => { if (e.target.closest('.m135-path')) hideTip(); });
    svg.addEventListener('click', e => { const p = e.target.closest('.m135-path'); if (p) selectMuni(p.dataset.m); });
    svg.addEventListener('keydown', e => { const p = e.target.closest('.m135-path'); if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectMuni(p.dataset.m); } });
    function showTip(p, e) {
      const m = p.dataset.m, varDef = VAR_INDEX[state.variable];
      const v = varDef.get(m);
      let diffRow = '';
      if (v != null && mapStats.median != null && varDef.tipo !== 'qual') {
        const diff = v - mapStats.median;
        const isSigned = varDef.tipo === 'div' || varDef.tipo === 'div_alert';
        const diffText = isSigned ? fmtValue(varDef, diff) : (diff >= 0 ? '+' : '−') + fmtValue(varDef, Math.abs(diff));
        diffRow = `<div class="m135-tt-row">Vs. mediana provincial: ${esc(diffText)}</div>`;
      }
      const flag = varDef.getFlag ? varDef.getFlag(m) : null;
      const flagRow = flag ? `<div class="m135-tt-row" style="color:#f0a93e">Estado de calidad: dato a revisar</div>` : '';
      tip.innerHTML = `<div class="m135-tt-name">${esc(dn(m))}</div>
        <div class="m135-tt-row">${esc(varDef.label)}: <strong>${esc(fmtValue(varDef, v))}</strong></div>
        ${v == null ? '<div class="m135-tt-row" style="color:#f0a93e">Sin dato disponible</div>' : `<div class="m135-tt-row">Período: ${esc(varDef.periodo)}</div>${diffRow}${flagRow}`}`;
      tip.classList.add('show');
      moveTip(e);
    }
    function moveTip(e) {
      let x = e.clientX + 16, y = e.clientY + 16;
      const tw = 230, th = 80;
      if (x + tw > window.innerWidth - 8) x = e.clientX - tw - 16;
      if (y + th > window.innerHeight - 8) y = e.clientY - th - 16;
      tip.style.left = x + 'px'; tip.style.top = y + 'px';
    }
    function hideTip() { tip.classList.remove('show'); }
  }

  function renderLegend() {
    const el = $('#m135Legend'), varDef = VAR_INDEX[state.variable];
    if (!varDef) { el.innerHTML = ''; return; }
    let html = `<div class="m135-legend-t">${esc(varDef.label)}</div>`;
    if (varDef.tipo === 'qual') {
      const vals = Array.from(new Set(mapStats.withData.map(x => x.v))).slice(0, 8);
      html += '<div class="m135-legend-qual">' + vals.map(v => `<div class="m135-legend-row"><span class="m135-legend-sw" style="background:${qualColor(varDef.id, v)}"></span>${esc(v)}</div>`).join('') + '</div>';
    } else if (varDef.tipo === 'div' || varDef.tipo === 'div_alert') {
      html += `<div class="m135-legend-grad" style="background:linear-gradient(to right, ${CHOROPLETH_DIVERGING_COLORS.join(',')})"></div><div class="m135-legend-range"><span>Caída</span><span>0</span><span>Suba</span></div>`;
    } else {
      html += `<div class="m135-legend-grad" style="background:linear-gradient(to right, ${CHOROPLETH_SEQUENTIAL_COLORS.join(',')})"></div><div class="m135-legend-range"><span>${esc(fmtValue(varDef, mapStats.min))}</span><span>${esc(fmtValue(varDef, mapStats.max))}</span></div>`;
    }
    html += `<div class="m135-legend-row" style="margin-top:6px"><span class="m135-legend-sw" style="background:${varDef.tipo === 'qual' ? '#dfe6ea' : CHOROPLETH_NO_DATA_COLOR}"></span>Sin dato (${mapStats.nMissing})</div>`;
    el.innerHTML = html;
  }

  function selectMuni(m) {
    state.selected = m;
    renderMap();
    if (m) { $$('.m135-path').forEach(p => { if (p.dataset.m === m) p.classList.add('sel'); }); }
    writeURLState();
    renderTab(state.activeTab);
  }

  // ── ZOOM ────────────────────────────────────────────────────
  function pathBBox(d) {
    const nums = d.match(/-?\d+(\.\d+)?/g);
    if (!nums) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = parseFloat(nums[i]), y = parseFloat(nums[i + 1]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  }
  let ambaBBoxCache = null;
  function getAmbaBBox() {
    if (ambaBBoxCache) return ambaBBoxCache;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    MUNIS.forEach(m => {
      if (!(GEO_DATA[m] && GEO_DATA[m].cba) || !PATHS[m]) return;
      const bb = pathBBox(PATHS[m]);
      if (!bb) return;
      minX = Math.min(minX, bb.minX); minY = Math.min(minY, bb.minY);
      maxX = Math.max(maxX, bb.maxX); maxY = Math.max(maxY, bb.maxY);
    });
    // padding generoso y proporcional (no un crop ajustado) para que la zona
    // de AMBA se vea con contexto alrededor en vez de "pegada" a los bordes.
    const padX = (maxX - minX) * 0.4, padY = (maxY - minY) * 0.4;
    ambaBBoxCache = { minX: minX - padX, minY: minY - padY, w: (maxX - minX) + padX * 2, h: (maxY - minY) + padY * 2 };
    return ambaBBoxCache;
  }
  function setZoom(z) {
    state.zoom = z;
    const svg = $('#m135map');
    $('#zoomProvincia').classList.toggle('on', z === 'provincia');
    $('#zoomAmba').classList.toggle('on', z === 'amba');
    if (z === 'amba') { const b = getAmbaBBox(); svg.setAttribute('viewBox', `${b.minX} ${b.minY} ${b.w} ${b.h}`); }
    else svg.setAttribute('viewBox', '0 0 680 800');
    renderMap();
  }

  // ══════════════════════════════════════════════════════════
  // TAB: RADIOGRAFÍA
  // ══════════════════════════════════════════════════════════
  function renderRadiografia() {
    const el = $('#tab-radiografia');
    if (!state.selected) {
      el.innerHTML = renderVarInfoCard();
      $('#inviteRankingBtn', el)?.addEventListener('click', () => switchTab('ranking'));
      return;
    }
    el.innerHTML = renderFicha(state.selected);
    wireFichaEvents(el);
    renderElecCharts();
  }

  function renderVarInfoCard() {
    const varDef = VAR_INDEX[state.variable];
    if (!varDef) return '<div class="m135-varcard">Elegí una categoría con indicadores disponibles.</div>';
    const s = mapStats;
    return `
      <div class="m135-varcard">
        <div class="m135-varcard-t">${esc(varDef.label)}</div>
        <div class="m135-varcard-d">${esc(varDef.descripcion || '')}</div>
        <div class="m135-varcard-meta">
          <span>Período: ${esc(varDef.periodo)}</span>
          <span>Fuente: ${esc(varDef.fuente)}</span>
          <span>Cobertura: ${s.n}/135 municipios${s.nMissing ? ` · ${s.nMissing} sin dato` : ''}</span>
        </div>
      </div>
      <div class="m135-invite">
        <div class="m135-invite-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"/></svg></div>
        <div class="m135-invite-t">Elegí un municipio para empezar</div>
        <div class="m135-invite-d">Hacé clic en cualquier distrito del mapa o buscalo arriba para ver su radiografía completa: finanzas, población, gobierno y economía.</div>
        <button class="m135-invite-btn" id="inviteRankingBtn">Ver el ranking completo de este indicador →</button>
      </div>`;
  }

  function renderFicha(m) {
    const g = GEO_DATA[m] || {};
    const rec = PATCH.municipios[m] || {};
    const pop = getPoblacion(m);
    const t1s = rec.transferencias ? rec.transferencias.primer_semestre : null;
    const tjun = rec.transferencias ? rec.transferencias.junio : null;
    const presupuesto = rec.presupuesto_2026;

    const reading = alsinaReadingMuni(m);
    const selCatId = state.categoria;
    const accId = { finanzas: 'finanzas', poblacion: 'poblacion', economia: 'economia', gobierno: 'gobierno', educacion: 'educacion', salud: 'salud', info_publica: 'info_publica' };

    return `
      <div class="m135-ficha-hdr">
        <div class="m135-ficha-name">${esc(g.nd || dn(m))}</div>
        <div class="m135-ficha-meta">${esc(g.sec || '—')} sección electoral · ${esc(g.reg || '—')}${pop ? ' · ' + fmtNum(pop) + ' habitantes' : ''}</div>
        <div class="m135-ficha-badges">
          ${g.cba ? '<span class="m135-badge m135-badge-cba">Conurbano</span>' : '<span class="m135-badge m135-badge-int">Interior</span>'}
          ${g.int_actual ? `<span class="m135-badge m135-badge-int">${esc(g.int_actual)} · ${esc(g.fuerza_2025 || '')}</span>` : ''}
        </div>
      </div>
      ${renderDatoSeleccionado(m)}
      ${reading ? `<div class="m135-alsina-read" style="margin-bottom:16px"><strong>Lectura de Alsina.</strong> ${esc(reading)}</div>` : ''}

      ${accordion('Finanzas y Transferencias', renderFinanzasBlock(m, t1s, tjun, presupuesto, rec), coverageLabel([t1s, presupuesto && presupuesto.estado === 'disponible']), accId.finanzas !== selCatId)}
      ${accordion('Población y Territorio', renderPoblacionBlock(m), '', accId.poblacion !== selCatId)}
      ${accordion('Economía y Producción', renderEconomiaBlock(m), '', accId.economia !== selCatId)}
      ${accordion('Gobierno y Elecciones', renderGobiernoBlock(m), '', accId.gobierno !== selCatId)}
      ${accordion('Educación', renderEducacionBlock(m), eduCoverageLabel(m), accId.educacion !== selCatId)}
      ${accordion('Salud', '<div class="m135-empty-dim">Sin datos disponibles todavía. Próxima etapa de incorporación.</div>', '', accId.salud !== selCatId)}
      ${accordion('Información Pública', '<div class="m135-empty-dim">Sin datos disponibles todavía. Requiere metodología propia de Alsina, aún no publicada.</div>', '', accId.info_publica !== selCatId)}

      ${renderRelated(m)}
    `;
  }
  function renderDatoSeleccionado(m) {
    const varDef = VAR_INDEX[state.variable];
    if (!varDef) return '';
    const v = varDef.get(m);
    let cmpRow = '';
    if (v != null && mapStats && mapStats.median != null && varDef.tipo !== 'qual') {
      const diff = v - mapStats.median;
      const isSigned = varDef.tipo === 'div' || varDef.tipo === 'div_alert';
      const diffText = isSigned ? fmtValue(varDef, diff) : (diff >= 0 ? '+' : '−') + fmtValue(varDef, Math.abs(diff));
      cmpRow = `<div class="m135-datosel-cmp">Vs. mediana provincial: ${esc(diffText)}</div>`;
    }
    return `
      <div class="m135-datosel">
        <div class="m135-datosel-l">${esc(varDef.label)}</div>
        <div class="m135-datosel-v ${v == null ? 'na' : ''}">${v == null ? 'Sin dato oficial disponible' : esc(fmtValue(varDef, v))}</div>
        <div class="m135-datosel-meta">Período: ${esc(varDef.periodo || '—')}${cmpRow}</div>
      </div>`;
  }
  function coverageLabel(arr) { const n = arr.filter(Boolean).length; return `${n}/${arr.length} disponibles`; }
  function accordion(title, body, cov, closed) {
    return `<div class="m135-acc${closed ? '' : ' open'}"><div class="m135-acc-h" data-acc="1"><span>${esc(title)}${cov ? `<span class="cov">${esc(cov)}</span>` : ''}</span></div><div class="m135-acc-b">${body}</div></div>`;
  }
  function wireFichaEvents(root) {
    $$('.m135-acc-h', root).forEach(h => h.addEventListener('click', () => h.closest('.m135-acc').classList.toggle('open')));
  }

  function vrow(label, value, tag) {
    return `<div class="m135-vrow"><span class="m135-vrow-l">${esc(label)}</span><span class="m135-vrow-r ${value == null ? 'na' : ''}">${value == null ? 'Sin dato oficial disponible' : esc(value)}${tag ? `<span class="m135-vtag ${tag[1]}">${esc(tag[0])}</span>` : ''}</span></div>`;
  }

  function renderFinanzasBlock(m, t1s, tjun, presupuesto, rec) {
    let html = '';
    if (t1s) {
      html += vrow('Transferido 1S 2026', fmtMoneyFull(t1s.total_2026), ['Dato oficial', 'of']);
      html += vrow('Transferido 1S 2025', fmtMoneyFull(t1s.total_2025), ['Dato oficial', 'of']);
      html += vrow('Variación nominal 1S', fmtPct(t1s.variacion_nominal, 1));
      html += vrow('Variación real 1S', fmtPct(t1s.variacion_real, 2), ['Cálculo Alsina', 'al']);
      html += vrow('Ranking provincial 1S', t1s.ranking_provincial ? '#' + t1s.ranking_provincial + ' de 135' : null, ['Cálculo Alsina', 'al']);
      html += vrow('Junio 2026 vs. junio 2025', tjun ? fmtPct(tjun.variacion_real, 2) : null, ['Cálculo Alsina', 'al']);
    } else {
      html += vrow('Transferencias 2025-2026', null);
    }
    html += vrow('Presupuesto 2026', presupuesto && presupuesto.estado === 'disponible' ? fmtMoneyFull(presupuesto.valor) : null, presupuesto && presupuesto.estado === 'disponible' ? ['Dato oficial', 'of'] : null);
    html += vrow('Presupuesto por habitante', presupuesto && presupuesto.estado === 'disponible' ? '$' + Math.round(presupuesto.valor_per_capita).toLocaleString('es-AR') : null);
    html += vrow('CUD (coparticipación)', (rec.cud_pct_2026 && rec.cud_pct_2026.estado === 'disponible') ? rec.cud_pct_2026.valor.toFixed(5) + '%' : null, rec.cud_pct_2026 && rec.cud_pct_2026.estado === 'disponible' ? ['Dato oficial', 'of'] : null);
    return html;
  }
  function renderPoblacionBlock(m) {
    const g = GEO_DATA[m] || {};
    const pop = PATCH.municipios[m] && PATCH.municipios[m].poblacion;
    let html = '';
    html += vrow('Población (Censo 2022)', pop && pop.valor != null ? fmtNum(pop.valor) + ' hab.' : null, ['Dato oficial', 'of']);
    html += vrow('Superficie', g.sup ? fmtNum(g.sup, 1) + ' km²' : null, ['Dato oficial', 'of']);
    html += vrow('Densidad', g.den ? g.den.toFixed(1) + ' hab/km²' : null);
    html += vrow('Categoría poblacional', g.cat || null);
    html += vrow('Sección electoral', g.sec || null);
    html += vrow('Departamento judicial', g.jud || null);
    html += vrow('Región', g.reg || null);
    return html;
  }
  function renderEconomiaBlock(m) {
    const ex = EXTRA[m] || {};
    let html = '';
    html += vrow('Empresas (2019)', ex['Cantidad Empresas'] != null ? fmtNum(ex['Cantidad Empresas']) : null);
    html += vrow('Empresas exportadoras (2019)', ex['Cantidad Empresas Exportadoras'] != null ? fmtNum(ex['Cantidad Empresas Exportadoras']) : null);
    html += vrow('PBG municipal (2023, M$ const. 2004)', ex['PBG 2023 (M$ const.2004)'] != null ? fmtNum(ex['PBG 2023 (M$ const.2004)']) : null);
    html += vrow('Variación PBG 2022-2023', ex['Var% PBG 22-23'] != null ? fmtPct(ex['Var% PBG 22-23'] / 100, 1) : null);
    html += vrow('Recaudación propia (2021)', ex['Recaudación propia 2021 ($)'] != null ? fmtMoneyFull(ex['Recaudación propia 2021 ($)']) : null);
    html += vrow('NBI (Censo 2010)', ex['NBI (%)'] != null ? ex['NBI (%)'].toFixed(2) + '%' : null);
    return html;
  }
  function renderGobiernoBlock(m) {
    const g = GEO_DATA[m] || {};
    let html = '';
    html += vrow('Intendente actual', g.int_actual || null, g.int_actual ? ['Dato oficial', 'of'] : null);
    html += vrow('Fuerza política', g.fuerza_2025 || null);
    html += vrow('Electores nacionales', g.elec_nac != null ? fmtNum(g.elec_nac) : null);
    html += vrow('Electores extranjeros', g.elec_ext != null ? fmtNum(g.elec_ext) : null);
    html += `<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--surf)">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:8px">Historial electoral · 2013-2025</div>
      ${renderElecHistory(m, g)}
    </div>`;
    return html;
  }

  // ── Educación ───────────────────────────────────────────────
  const EDU_FLAG_TAGS = {
    tasa_negativa: ['Verificar: tasa negativa', 'flag'],
    base_reducida: ['Base inicial reducida', 'flag'],
    valor_extremo: ['Valor atípico', 'flag'],
  };
  function eduRowTag(m, campo, isCalc) {
    const flag = eduFlag(m, campo);
    if (flag && EDU_FLAG_TAGS[flag]) return EDU_FLAG_TAGS[flag];
    return isCalc ? ['Cálculo Alsina', 'al'] : ['Dato oficial', 'of'];
  }
  function eduCoverageLabel(m) {
    const ids = ['edu_matricula_total', 'edu_abandono_secundario', 'edu_promocion_secundaria', 'edu_participacion_estatal'];
    const n = ids.filter(id => eduVal(m, id) != null).length;
    return PATCH_EDU ? `${n}/${ids.length} disponibles` : '';
  }
  function renderEducacionBlock(m) {
    if (!PATCH_EDU || !PATCH_EDU.municipios[m]) return '<div class="m135-empty-dim">Sin datos educativos disponibles para este municipio.</div>';
    let html = '';
    html += vrow('Matrícula total (2025)', eduVal(m, 'edu_matricula_total') != null ? fmtNum(eduVal(m, 'edu_matricula_total')) + ' alumnos' : null, eduRowTag(m, 'edu_matricula_total', false));
    html += vrow('Variación de matrícula 2015–2025', eduVal(m, 'edu_var_matricula_2015_2025') != null ? fmtPct(eduVal(m, 'edu_var_matricula_2015_2025'), 2) : null, eduRowTag(m, 'edu_var_matricula_2015_2025', true));
    html += vrow('Variación matrícula secundaria 2019–2025', eduVal(m, 'edu_var_secundaria_2019_2025') != null ? fmtPct(eduVal(m, 'edu_var_secundaria_2019_2025'), 2) : null, eduRowTag(m, 'edu_var_secundaria_2019_2025', true));

    const brecha = edu(m, 'edu_brecha_matricula_red');
    html += vrow('Brecha matrícula/red 2015–2025', brecha && brecha.valor != null ? fmtPct(brecha.valor, 2) + ' p.p.' : null, eduRowTag(m, 'edu_brecha_matricula_red', true));
    if (brecha && brecha.componente_matricula != null && brecha.componente_unidades != null) {
      html += `<div class="m135-vrow" style="padding-left:14px"><span class="m135-vrow-l" style="color:var(--t3);font-size:.76rem">— de la cual: matrícula ${esc(fmtPct(brecha.componente_matricula, 2))}, unidades de servicio ${esc(fmtPct(brecha.componente_unidades, 2))}</span></div>`;
    }

    html += vrow('Alumnos por sede educativa', eduVal(m, 'edu_alumnos_por_sede') != null ? fmtNum(eduVal(m, 'edu_alumnos_por_sede'), 1) : null, eduRowTag(m, 'edu_alumnos_por_sede', true));
    html += vrow('Alumnos por sección', eduVal(m, 'edu_alumnos_por_seccion') != null ? fmtNum(eduVal(m, 'edu_alumnos_por_seccion'), 1) : null, eduRowTag(m, 'edu_alumnos_por_seccion', true));
    html += vrow('Variación de unidades de servicio 2015–2025', eduVal(m, 'edu_var_unidades_2015_2025') != null ? fmtPct(eduVal(m, 'edu_var_unidades_2015_2025'), 2) : null, eduRowTag(m, 'edu_var_unidades_2015_2025', true));

    html += vrow('Abandono interanual secundario', eduVal(m, 'edu_abandono_secundario') != null ? fmtPct(eduVal(m, 'edu_abandono_secundario'), 2) : null, eduRowTag(m, 'edu_abandono_secundario', false));
    html += vrow('Promoción efectiva secundaria', eduVal(m, 'edu_promocion_secundaria') != null ? fmtPctPlain(eduVal(m, 'edu_promocion_secundaria'), 2) : null, eduRowTag(m, 'edu_promocion_secundaria', false));
    html += vrow('Sobreedad secundaria', eduVal(m, 'edu_sobreedad_secundaria') != null ? fmtPctPlain(eduVal(m, 'edu_sobreedad_secundaria'), 2) : null, eduRowTag(m, 'edu_sobreedad_secundaria', false));
    html += vrow('Participación de matrícula estatal', eduVal(m, 'edu_participacion_estatal') != null ? fmtPctPlain(eduVal(m, 'edu_participacion_estatal'), 1) : null, eduRowTag(m, 'edu_participacion_estatal', false));

    html += vrow('Sedes educativas únicas', eduVal(m, 'edu_sedes_2025') != null ? fmtNum(eduVal(m, 'edu_sedes_2025')) : null, eduRowTag(m, 'edu_sedes_2025', false));
    html += vrow('Unidades de servicio', eduVal(m, 'edu_unidades_servicio_2025') != null ? fmtNum(eduVal(m, 'edu_unidades_servicio_2025')) : null, eduRowTag(m, 'edu_unidades_servicio_2025', false));
    html += vrow('Establecimientos (2026)', eduVal(m, 'edu_establecimientos_2026') != null ? fmtNum(eduVal(m, 'edu_establecimientos_2026')) : null, eduRowTag(m, 'edu_establecimientos_2026', false));
    html += vrow('Actos de expansión registrados', eduVal(m, 'edu_actos_expansion_total') != null ? fmtNum(eduVal(m, 'edu_actos_expansion_total')) : null, eduRowTag(m, 'edu_actos_expansion_total', false));
    html += vrow('Último año con acto de expansión', eduVal(m, 'edu_ultimo_anio_expansion') != null ? String(Math.round(eduVal(m, 'edu_ultimo_anio_expansion'))) : null, eduRowTag(m, 'edu_ultimo_anio_expansion', false));

    const flagNote = edu(m, 'edu_abandono_secundario');
    if (flagNote && flagNote.nota_metodologica) {
      html += `<div class="m135-alsina-read" style="margin-top:12px"><strong>Nota metodológica.</strong> ${esc(flagNote.nota_metodologica)}</div>`;
    }
    return html;
  }

  // ── Historial electoral completo (portado del Data Hub anterior; no se pierde nada) ──
  let _elecPollScheduled = false;
  function renderElecHistory(m, g) {
    if (!window._elecDataReady) {
      if (!_elecPollScheduled) {
        _elecPollScheduled = true;
        let tries = 0;
        const iv = setInterval(() => {
          tries++;
          if (window._elecDataReady || tries > 80) {
            clearInterval(iv); _elecPollScheduled = false;
            if (state.selected === m && state.activeTab === 'radiografia') renderRadiografia();
          }
        }, 100);
      }
      return '<div style="padding:12px 0;color:#94a3b8;font-size:12px">Cargando datos electorales…</div>';
    }
    const mData = (window.electoralData && window.electoralData[m]) || {};
    const ALL_YRS = ['2013', '2015', '2017', '2019', '2021', '2023', '2025'];
    const INT_YRS = ['2015', '2019', '2023'];
    if (!Object.keys(mData).length) return '<div style="padding:12px 0;color:#94a3b8;font-size:12px">Sin datos electorales disponibles para este municipio.</div>';

    const forceWins = {};
    INT_YRS.filter(yr => mData[yr]).forEach(yr => { const f = mData[yr]?.fuerzas?.[0]?.nombre; if (f) forceWins[f] = (forceWins[f] || 0) + 1; });
    const topEntry = Object.entries(forceWins).sort((a, b) => b[1] - a[1])[0];
    const last23 = mData['2023']?.fuerzas?.[0];
    const last19 = mData['2019']?.fuerzas?.[0];
    const changed = last23 && last19 && last23.nombre !== last19.nombre;
    const intOnlyCount = INT_YRS.filter(yr => mData[yr]).length;
    window._elecChartData = { m, mData };
    const secNum = (window.electoralMuniSec && window.electoralMuniSec[m]) || '';
    const secLabel = SEC_MAP[secNum] || g.sec || secNum;

    const TBADGE = { intendente: 'background:#FEF3C7;color:#92400E;', concejales: 'background:#EFF6FF;color:#1D4ED8;', legislativas: 'background:#EDE9FE;color:#5B21B6;' };

    let h = '';
    if (topEntry) {
      const bc = last23?.color || '#64748b';
      const firstYr = INT_YRS.find(yr => mData[yr]) || '2015';
      h += `<div style="background:${bc}14;border:1px solid ${bc}35;border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px">
        <div style="color:#0f172a;font-weight:600">Fuerza dominante ${firstYr}–2023: <span style="color:${bc}">${esc(topEntry[0])}</span> · ganó ${topEntry[1]} de ${intOnlyCount} elecciones de intendente · Sección ${esc(secLabel)}</div>`;
      if (changed) h += `<div style="margin-top:4px;color:#475569">Cambió de <span style="color:${last19.color};font-weight:600">${esc(last19.nombre)}</span> a <span style="color:${last23.color};font-weight:600">${esc(last23.nombre)}</span> en 2023</div>`;
      if (mData['2023']?.intendente) h += `<div style="margin-top:3px;color:#475569">Intendente electo 2023: <strong style="color:#0f172a">${esc(mData['2023'].intendente)}</strong></div>`;
      h += '</div>';
    }

    function fCell(f) {
      if (!f) return '<td style="padding:4px 8px;color:#94a3b8;font-size:11px">—</td>';
      return `<td style="padding:4px 8px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${f.color};margin-right:4px;vertical-align:middle"></span><span style="font-size:11px;font-weight:600;color:#0f172a">${esc(f.nombre)}</span><span style="color:#94a3b8;font-size:10px;margin-left:3px">${f.pct}%</span></td>`;
    }
    h += '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<thead><tr style="border-bottom:1px solid #dde6ef">';
    ['Año', 'Tipo', '1ª Fuerza', '2ª Fuerza', '3ª Fuerza', 'Part.%'].forEach((col, i) =>
      h += `<th style="padding:5px 8px;text-align:${i === 5 ? 'right' : 'left'};color:#64748b;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">${col}</th>`
    );
    h += '</tr></thead><tbody>';
    ALL_YRS.forEach(yr => {
      const d = mData[yr];
      const wc = d?.fuerzas?.[0]?.color || '#e2e8f0';
      const tipo = d?.tipo || (ELECTION_TYPES[yr]?.tipo || '');
      const bS = TBADGE[tipo] || TBADGE.legislativas;
      let yrCell = `<div style="font-weight:700;color:#0f172a;font-size:12px">${yr}</div>`;
      if (d?.intendente && tipo === 'intendente') yrCell += `<div style="font-size:9px;color:#94a3b8;margin-top:1px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.intendente)}</div>`;
      if (!d) {
        h += `<tr style="border-bottom:1px solid #f1f5f9;opacity:.4"><td style="padding:4px 8px">${yrCell}</td><td colspan="5" style="padding:4px 8px;color:#94a3b8;font-size:11px">Sin datos</td></tr>`;
        return;
      }
      h += `<tr style="border-bottom:1px solid #f1f5f9;border-left:3px solid ${wc}">
        <td style="padding:4px 8px">${yrCell}</td>
        <td style="padding:4px 8px"><span style="${bS}font-size:10px;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap">${esc(d.label)}</span></td>
        ${fCell(d.fuerzas?.[0])}${fCell(d.fuerzas?.[1])}${fCell(d.fuerzas?.[2])}
        <td style="padding:4px 8px;text-align:right;font-size:11px;color:#94a3b8">${d.participacion ? d.participacion.toFixed(1) + '%' : '—'}</td>
      </tr>`;
    });
    h += '</tbody></table></div>';

    h += '<div style="margin:16px 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Evolución histórica % votos · 2013–2025</div>';
    h += '<div style="position:relative;height:190px;margin-bottom:4px"><canvas id="elecLineChart"></canvas></div>';
    h += '<div style="font-size:9px;color:#94a3b8;margin-bottom:12px">Fuente: Junta Electoral PBA · ⭐ = año con elección de intendente · ● punto relleno = intendente · ○ hueco = concejales/legislativas</div>';

    if (mData['2025']) {
      const f25 = mData['2025'].fuerzas || [];
      h += `<div style="background:#f8fafc;border:1px solid #dde6ef;border-radius:6px;padding:10px 14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.05em">Legislativas 2025</span>
          <span style="font-size:10px;color:#94a3b8">Dato de concejales — sin elección de intendente</span>`;
      if (g.fuerza_2025 === 'LLA') h += `<span style="background:#ede9fe;border:1px solid #c4b5fd;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.04em">LLA lidera en 2025</span>`;
      h += `</div>`;
      f25.slice(0, 3).forEach(f => {
        const w = Math.min(Math.round(f.pct * 0.85), 98);
        h += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <div style="width:130px;text-align:right;font-size:10px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.nombre)}</div>
          <div style="flex:1;background:#e2e8f0;border-radius:2px;height:10px"><div style="width:${w}%;background:${f.color};height:100%;border-radius:2px"></div></div>
          <div style="width:38px;font-size:10px;color:#0f172a;text-align:right;font-weight:600">${f.pct}%</div>
        </div>`;
      });
      h += '</div>';
    }

    h += '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Intendente vs Presidente · 2015–2023</div>';
    h += '<div style="position:relative;height:175px;margin-bottom:4px"><canvas id="elecCompChart"></canvas></div>';
    h += '<div style="font-size:9px;color:#94a3b8;margin-bottom:14px">Sólido = resultado intendente municipal · Semi-transparente = resultado presidencial PBA</div>';

    h += '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Índice de competitividad</div>';
    h += '<div style="display:flex;gap:10px;margin-bottom:6px">';
    let competLabels = [];
    INT_YRS.forEach(yr => {
      const d = mData[yr];
      if (!d || !d.fuerzas || d.fuerzas.length < 2) {
        h += `<div style="flex:1;background:#f8fafc;border:1px solid #dde6ef;border-radius:6px;padding:10px;text-align:center"><div style="font-size:10px;color:#94a3b8">Margen ${yr}</div><div style="font-size:18px;font-weight:700;color:#94a3b8;margin:4px 0">—</div></div>`;
        return;
      }
      const margin = Math.round((d.fuerzas[0].pct - d.fuerzas[1].pct) * 10) / 10;
      const [bg, bd, tc, word] = margin < 5 ? ['#fef2f2', '#fecaca', '#dc2626', 'Muy competitivo'] : margin < 10 ? ['#fffbeb', '#fde68a', '#b45309', 'Competitivo'] : ['#f0fdf4', '#bbf7d0', '#166534', 'Holgado'];
      competLabels.push(word);
      h += `<div style="flex:1;background:${bg};border:1px solid ${bd};border-radius:6px;padding:10px;text-align:center">
        <div style="font-size:10px;color:#64748b">Margen ${yr}</div>
        <div style="font-size:20px;font-weight:700;color:${tc};margin:4px 0">+${margin}pts</div>
        <div style="font-size:9px;color:${tc};text-transform:uppercase;letter-spacing:.04em;font-weight:700">${word}</div>
      </div>`;
    });
    h += '</div>';
    if (competLabels.length) {
      const freq = {}; competLabels.forEach(l => freq[l] = (freq[l] || 0) + 1);
      const dominant = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
      const dc = { 'Holgado': '#166534', 'Muy competitivo': '#dc2626', 'Competitivo': '#b45309' }[dominant] || '#64748b';
      h += `<div style="font-size:11px;color:${dc};margin-bottom:14px">Municipio históricamente <strong>${dominant.toLowerCase()}</strong> · &lt;5pts: muy competitivo · 5–10pts: competitivo · &ge;10pts: holgado</div>`;
    }

    if (mData['2023']?.fuerzas?.length) {
      const winner23 = mData['2023'].fuerzas[0];
      const presRef = (PRES_PBA['2023'] || []).find(f => f.n === winner23.nombre);
      if (presRef) {
        const delta = Math.round((winner23.pct - presRef.p) * 10) / 10;
        const absv = Math.abs(delta);
        const [dc, msg] = delta > 3 ? [winner23.color, `El intendente electo superó al resultado presidencial de su espacio por +${absv} pts — peso propio alto`]
          : delta < -3 ? ['#dc2626', `El intendente electo estuvo ${absv} pts por debajo del resultado presidencial de su espacio`]
          : ['#64748b', 'Resultado alineado con el arrastre nacional'];
        h += `<div style="background:#f8fafc;border:1px solid #dde6ef;border-radius:6px;padding:10px 14px;margin-bottom:14px">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px">Peso propio del intendente · 2023</div>
          <div style="font-size:12px;color:${dc};font-weight:500">${msg}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:3px">${esc(winner23.nombre)}: ${winner23.pct}% local vs ${presRef.p}% prov. PBA</div>
        </div>`;
      }
    }

    const secFuerzas = window.electoralSeccional && window.electoralSeccional[secNum];
    const muniF23 = mData['2023']?.fuerzas || [];
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px">';
    if (muniF23.length && secFuerzas) {
      h += '<div>';
      h += '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Comparación seccional · 2023</div>';
      function miniBar(fuerzas, title) {
        let s = `<div style="background:#f8fafc;border:1px solid #dde6ef;border-radius:6px;padding:10px;margin-bottom:8px"><div style="font-size:10px;font-weight:600;color:#475569;margin-bottom:8px">${esc(title)}</div>`;
        fuerzas.slice(0, 3).forEach(f => {
          const w = Math.min(Math.round(f.pct), 98);
          s += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
            <div style="flex:1;font-size:10px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.nombre)}</div>
            <div style="width:55px;background:#e2e8f0;border-radius:2px;height:7px"><div style="width:${w}%;background:${f.color};height:100%;border-radius:2px"></div></div>
            <div style="width:32px;font-size:10px;color:#0f172a;text-align:right;font-weight:600">${f.pct}%</div>
          </div>`;
        });
        return s + '</div>';
      }
      h += miniBar(muniF23, `${g.nd || dn(m)} en 2023`);
      h += miniBar(secFuerzas, `Promedio Sección ${secLabel} en 2023`);
      h += '</div>';
    } else h += '<div></div>';
    h += '<div>';
    h += '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Participación · 2013–2025</div>';
    h += '<div style="position:relative;height:155px"><canvas id="elecPartChart"></canvas></div>';
    h += '<div style="font-size:9px;color:#94a3b8;margin-top:4px">⭐ = año con elección de intendente</div>';
    h += '</div></div>';

    return h;
  }

  function renderElecCharts() {
    const cd = window._elecChartData;
    if (!cd || typeof Chart === 'undefined') return;
    const { mData } = cd;
    const ALL_YRS = ['2013', '2015', '2017', '2019', '2021', '2023', '2025'];
    const INT_YRS_SET = new Set(['2015', '2019', '2023']);
    const FORCE_COLORS = { 'PJ / Peronismo': '#2563eb', 'Juntos x el Cambio': '#eab308', 'La Libertad Avanza': '#7c3aed', 'Somos / Hechos': '#ec4899', 'Frente Renovador': '#0891b2', 'UCR / Progresistas': '#ea580c', 'Izquierda / FIT': '#dc2626', 'Vecinal/Local': '#16a34a' };
    const axisStyle = { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.06)' } };

    const lc = document.getElementById('elecLineChart');
    if (lc) {
      if (lc._ci) lc._ci.destroy();
      const forceMax = {};
      ALL_YRS.forEach(yr => (mData[yr]?.fuerzas || []).forEach(f => { forceMax[f.nombre] = Math.max(forceMax[f.nombre] || 0, f.pct); }));
      const forces = Object.entries(forceMax).filter(([, v]) => v >= 10).sort((a, b) => b[1] - a[1]).map(([n]) => n).slice(0, 5);
      const datasets = forces.map(force => {
        const color = FORCE_COLORS[force] || '#64748b';
        const data = ALL_YRS.map(yr => (mData[yr]?.fuerzas || []).find(f => f.nombre === force)?.pct ?? null);
        return { label: force, data, borderColor: color, borderWidth: 2, backgroundColor: color + '15',
          pointRadius: ALL_YRS.map(yr => data[ALL_YRS.indexOf(yr)] !== null ? 4.5 : 0),
          pointBackgroundColor: ALL_YRS.map(yr => INT_YRS_SET.has(yr) ? color : '#fff'),
          pointBorderColor: ALL_YRS.map(() => color), pointBorderWidth: 2, tension: 0.25, spanGaps: true, fill: false };
      });
      lc._ci = new Chart(lc, { type: 'line', data: { labels: ALL_YRS, datasets },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
          plugins: { legend: { position: 'bottom', labels: { color: '#475569', font: { size: 10 }, boxWidth: 12, padding: 8 } },
            tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`, afterLabel: ctx => { const yr = ALL_YRS[ctx.dataIndex]; return mData[yr]?.intendente ? `Intendente: ${mData[yr].intendente}` : ''; } } } },
          scales: { x: { ...axisStyle }, y: { ...axisStyle, min: 0, max: 100, ticks: { ...axisStyle.ticks, callback: v => v + '%' } } } } });
    }

    const cc = document.getElementById('elecCompChart');
    if (cc) {
      if (cc._ci) cc._ci.destroy();
      const CMP_YRS = ['2015', '2019', '2023'];
      const allForces = new Set();
      CMP_YRS.forEach(yr => { (mData[yr]?.fuerzas || []).forEach(f => allForces.add(f.nombre)); (PRES_PBA[yr] || []).forEach(f => allForces.add(f.n)); });
      const forces = [...allForces].filter(f => f !== 'Vecinal/Local');
      const intDs = forces.map(f => ({ label: f, stack: 'I', data: CMP_YRS.map(yr => (mData[yr]?.fuerzas || []).find(x => x.nombre === f)?.pct || 0), backgroundColor: (FORCE_COLORS[f] || '#6b7280') + 'cc', borderColor: FORCE_COLORS[f] || '#6b7280', borderWidth: 1.5 }));
      const presDs = forces.map(f => ({ label: f + ' (Pres.)', stack: 'P', data: CMP_YRS.map(yr => (PRES_PBA[yr] || []).find(x => x.n === f)?.p || 0), backgroundColor: (FORCE_COLORS[f] || '#6b7280') + '40', borderColor: FORCE_COLORS[f] || '#6b7280', borderWidth: 1 }));
      cc._ci = new Chart(cc, { type: 'bar', data: { labels: CMP_YRS, datasets: [...intDs, ...presDs] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
          plugins: { legend: { display: false }, tooltip: { callbacks: { title: ([ctx]) => ctx.label, label: ctx => `${ctx.dataset.stack === 'I' ? 'Intendente' : 'Pres. PBA'} · ${ctx.dataset.label.replace(' (Pres.)', '')}: ${ctx.parsed.y}%` } } },
          scales: { x: { ...axisStyle, stacked: true }, y: { ...axisStyle, stacked: true, min: 0, max: 100, ticks: { ...axisStyle.ticks, callback: v => v + '%' } } } } });
    }

    const pc = document.getElementById('elecPartChart');
    if (pc) {
      if (pc._ci) pc._ci.destroy();
      const data = ALL_YRS.map(yr => mData[yr]?.participacion ?? null);
      pc._ci = new Chart(pc, { type: 'line', data: { labels: ALL_YRS, datasets: [{ label: 'Participación', data, borderColor: '#0891b2', backgroundColor: 'rgba(8,145,178,0.1)', fill: true, borderWidth: 2, pointRadius: 4, pointBackgroundColor: ALL_YRS.map(yr => INT_YRS_SET.has(yr) ? '#0891b2' : '#fff'), pointBorderColor: '#0891b2', pointBorderWidth: 2, tension: 0.25, spanGaps: true }] },
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}%`, afterLabel: ctx => { const yr = ALL_YRS[ctx.dataIndex]; return INT_YRS_SET.has(yr) ? 'Año con elección de intendente' : ''; } } } },
          scales: { x: { ticks: { color: '#64748b', font: { size: 9 }, maxRotation: 0 }, grid: { color: 'rgba(0,0,0,0.05)' } }, y: { ...axisStyle, min: 40, max: 100, ticks: { ...axisStyle.ticks, callback: v => v + '%', stepSize: 20 } } } } });
    }
  }

  const RELATED_LINKS = [
    { href: 'nota-fin-de-una-era.html', title: 'El fin de una era', desc: 'El mayor recambio de intendentes bonaerenses en 2027.', tags: 'all' },
    { href: 'alsina-balance-fiscal-1s2026.html', title: 'Balance fiscal 1S 2026', desc: 'Recaudación provincial y transferencias municipales del primer semestre.', tags: 'all' },
    { href: 'alsina-recaudacion-tributaria-pba.html', title: 'Radiografía Fiscal Bonaerense', desc: 'Serie histórica de recaudación tributaria provincial 1999-2026.', tags: 'all' },
  ];
  function renderRelated(m) {
    const links = RELATED_LINKS.map(l => `<a class="m135-related-link" href="${esc(l.href)}"><strong>${esc(l.title)}</strong>${esc(l.desc)}</a>`).join('');
    return `<div class="m135-related"><div class="m135-related-t">Análisis de Alsina relacionados</div>${links}</div>`;
  }

  function alsinaReadingMuni(m) {
    const rec = PATCH.municipios[m];
    if (!rec || !rec.transferencias) return null;
    const t = rec.transferencias.primer_semestre;
    if (t.variacion_real == null) return null;
    const avg = PATCH.meta.promedio_provincial_1s.promedio_provincial_var_real;
    const dir = t.variacion_real >= 0 ? 'ganó' : 'perdió';
    const cmpAvg = t.variacion_real > avg ? 'por encima' : 'por debajo';
    let s = `${dn(m)} ${dir} ${Math.abs(t.variacion_real * 100).toFixed(2)}% de poder de compra en las transferencias del primer semestre de 2026, ${cmpAvg} del promedio provincial (${fmtPct(avg, 2)}).`;
    // comparación con pares por categoría poblacional
    const g = GEO_DATA[m];
    if (g && g.cat) {
      const peers = MUNIS.filter(x => GEO_DATA[x] && GEO_DATA[x].cat === g.cat && PATCH.municipios[x] && PATCH.municipios[x].transferencias && PATCH.municipios[x].transferencias.primer_semestre.variacion_real != null);
      if (peers.length >= 4) {
        const peerVals = peers.map(x => PATCH.municipios[x].transferencias.primer_semestre.variacion_real);
        const peerMed = median(peerVals);
        const cmpPeer = t.variacion_real > peerMed ? 'por encima' : 'por debajo';
        s += ` Entre los ${peers.length} municipios de categoría "${g.cat}", quedó ${cmpPeer} de la mediana del grupo (${fmtPct(peerMed, 2)}).`;
      }
    }
    return s;
  }

  // ══════════════════════════════════════════════════════════
  // TAB: COMPARAR
  // ══════════════════════════════════════════════════════════
  function renderComparar() {
    const el = $('#tab-comparar');
    let html = `<div class="m135-cmp-search">
      <label for="cmpSearch" style="position:absolute;width:1px;height:1px;overflow:hidden">Agregar municipio a comparar</label>
      <input type="text" id="cmpSearch" placeholder="Agregar municipio (hasta 4)…" autocomplete="off" style="width:100%;padding:8px 11px;border:1.4px solid var(--bd);border-radius:7px;font-size:12.5px">
      <div id="cmpSearchResults" class="m135-cmp-results" role="listbox"></div>
    </div>
    <div class="m135-cmp-chips" id="cmpChips"></div>`;

    if (state.compare.length < 4 && state.selected) {
      const suggestions = suggestSimilar(state.selected).filter(m => !state.compare.includes(m)).slice(0, 4);
      if (suggestions.length) {
        html += `<div class="m135-cmp-suggest">Municipios de tamaño y región similar a <strong>${esc(dn(state.selected))}</strong>: `
          + suggestions.map(m => `<button data-add="${esc(m)}">${esc(dn(m))}</button>`).join(', ') + '.</div>';
      }
    }

    if (state.compare.length >= 2) {
      html += renderCompareTable();
    } else {
      html += `<p style="font-size:.82rem;color:var(--t3);margin-top:10px">Elegí al menos 2 municipios (hasta 4) para compararlos. Podés sumarlos desde el buscador de acá arriba, desde el mapa, o desde una ficha.</p>`;
    }
    el.innerHTML = html;
    wireCompareEvents(el);
  }
  function suggestSimilar(m) {
    const g = GEO_DATA[m];
    if (!g) return [];
    return MUNIS.filter(x => x !== m && GEO_DATA[x] && GEO_DATA[x].cat === g.cat && GEO_DATA[x].reg === g.reg)
      .sort((a, b) => Math.abs((GEO_DATA[a].p22 || 0) - (g.p22 || 0)) - Math.abs((GEO_DATA[b].p22 || 0) - (g.p22 || 0)));
  }
  function renderCompareTable() {
    const rows = [
      { l: 'Población (Censo 2022)', f: m => getPoblacion(m), fmt: v => v == null ? null : fmtNum(v) + ' hab.' },
      { l: 'Categoría poblacional', f: m => GEO_DATA[m] && GEO_DATA[m].cat, fmt: v => v },
      { l: 'Transferido 1S 2026', f: m => { const t = PATCH.municipios[m] && PATCH.municipios[m].transferencias; return t ? t.primer_semestre.total_2026 : null; }, fmt: v => v == null ? null : fmtMoney(v) },
      { l: 'Variación real 1S 2026', f: m => { const t = PATCH.municipios[m] && PATCH.municipios[m].transferencias; return t ? t.primer_semestre.variacion_real : null; }, fmt: v => v == null ? null : fmtPct(v, 2), bar: true },
      { l: 'Ranking provincial 1S', f: m => { const t = PATCH.municipios[m] && PATCH.municipios[m].transferencias; return t ? t.primer_semestre.ranking_provincial : null; }, fmt: v => v == null ? null : '#' + v + ' / 135' },
      { l: 'Presupuesto por habitante 2026', f: m => { const p = PATCH.municipios[m] && PATCH.municipios[m].presupuesto_2026; return p && p.estado === 'disponible' ? p.valor_per_capita : null; }, fmt: v => v == null ? null : '$' + Math.round(v).toLocaleString('es-AR'), bar: true },
      { l: 'CUD', f: m => { const c = PATCH.municipios[m] && PATCH.municipios[m].cud_pct_2026; return c && c.estado === 'disponible' ? c.valor : null; }, fmt: v => v == null ? null : v.toFixed(5) + '%' },
      { l: 'Intendente / fuerza', f: m => { const g = GEO_DATA[m]; return g ? [g.int_actual, g.fuerza_2025].filter(Boolean).join(' · ') : null; }, fmt: v => v },
      { l: 'Matrícula total (2025)', f: m => eduVal(m, 'edu_matricula_total'), fmt: v => v == null ? null : fmtNum(v) + ' alumnos' },
      { l: 'Variación de matrícula 2015–2025', f: m => eduVal(m, 'edu_var_matricula_2015_2025'), fmt: v => v == null ? null : fmtPct(v, 2), bar: true },
      { l: 'Brecha matrícula/red 2015–2025', f: m => eduVal(m, 'edu_brecha_matricula_red'), fmt: v => v == null ? null : fmtPct(v, 2) + ' p.p.', bar: true },
      { l: 'Alumnos por sede educativa', f: m => eduVal(m, 'edu_alumnos_por_sede'), fmt: v => v == null ? null : fmtNum(v, 1) },
      { l: 'Alumnos por sección', f: m => eduVal(m, 'edu_alumnos_por_seccion'), fmt: v => v == null ? null : fmtNum(v, 1) },
      { l: 'Abandono interanual secundario', f: m => eduVal(m, 'edu_abandono_secundario'), fmt: v => v == null ? null : fmtPct(v, 2) },
      { l: 'Promoción efectiva secundaria', f: m => eduVal(m, 'edu_promocion_secundaria'), fmt: v => v == null ? null : fmtPctPlain(v, 2) },
      { l: 'Sobreedad secundaria', f: m => eduVal(m, 'edu_sobreedad_secundaria'), fmt: v => v == null ? null : fmtPctPlain(v, 2) },
      { l: 'Participación de matrícula estatal', f: m => eduVal(m, 'edu_participacion_estatal'), fmt: v => v == null ? null : fmtPctPlain(v, 1) },
    ];
    let html = '<table class="m135-cmp-table"><thead><tr><th>Indicador</th>' + state.compare.map(m => `<th>${esc(dn(m))}</th>`).join('') + '</tr></thead><tbody>';
    rows.forEach(r => {
      html += '<tr><td>' + esc(r.l) + '</td>' + state.compare.map(m => { const v = r.f(m); const s = r.fmt(v); return `<td>${s == null ? '<em style="color:var(--t3);font-style:italic">sin dato</em>' : esc(s)}</td>`; }).join('') + '</tr>';
    });
    html += '</tbody></table>';

    // barras para variación real y presupuesto per cápita
    rows.filter(r => r.bar).forEach(r => {
      const vals = state.compare.map(m => ({ m, v: r.f(m) })).filter(x => x.v != null);
      if (!vals.length) return;
      const maxAbs = Math.max(...vals.map(x => Math.abs(x.v))) || 1;
      html += `<div class="m135-cmp-bar-row"><div class="m135-cmp-bar-t">${esc(r.l)}</div>`;
      vals.forEach(x => {
        const w = Math.abs(x.v) / maxAbs * 100;
        const color = x.v < 0 && r.l.indexOf('real') >= 0 ? 'var(--coral-d)' : 'var(--teal-d)';
        html += `<div class="m135-cmp-bar"><div class="m135-cmp-bar-lbl">${esc(dn(x.m))}</div><div class="m135-cmp-bar-track"><div class="m135-cmp-bar-fill" style="width:${w}%;background:${color}"></div></div><div class="m135-cmp-bar-val">${esc(r.fmt(x.v))}</div></div>`;
      });
      html += '</div>';
    });
    return html;
  }
  function wireCompareEvents(root) {
    const input = $('#cmpSearch', root), box = $('#cmpSearchResults', root);
    if (input) {
      input.addEventListener('input', () => {
        const q = normSearch(input.value.trim());
        if (!q) { box.classList.remove('open'); box.innerHTML = ''; return; }
        const matches = MUNIS.filter(m => !state.compare.includes(m) && normSearch(dn(m)).includes(q)).slice(0, 8);
        box.innerHTML = matches.map(m => `<button type="button" data-m="${esc(m)}">${esc(dn(m))}</button>`).join('');
        box.classList.add('open');
        $$('button[data-m]', box).forEach(b => b.addEventListener('click', () => { addCompare(b.dataset.m); input.value = ''; box.classList.remove('open'); }));
      });
    }
    $$('.m135-cmp-chip button', root).forEach(b => b.addEventListener('click', () => removeCompare(b.dataset.m)));
    $$('button[data-add]', root).forEach(b => b.addEventListener('click', () => addCompare(b.dataset.add)));
    renderChips(root);
  }
  function renderChips(root) {
    $('#cmpChips', root).innerHTML = state.compare.map(m => `<span class="m135-cmp-chip">${esc(dn(m))}<button data-m="${esc(m)}" aria-label="Quitar">✕</button></span>`).join('');
    $$('#cmpChips button', root).forEach(b => b.addEventListener('click', () => removeCompare(b.dataset.m)));
  }
  function addCompare(m) {
    if (state.compare.includes(m) || state.compare.length >= 4) return;
    state.compare.push(m); writeURLState(); renderComparar();
  }
  function removeCompare(m) {
    state.compare = state.compare.filter(x => x !== m); writeURLState(); renderComparar();
  }

  // ══════════════════════════════════════════════════════════
  // TAB: RANKING
  // ══════════════════════════════════════════════════════════
  function renderRanking() {
    const el = $('#tab-ranking');
    const varDef = VAR_INDEX[state.variable];
    if (!varDef || varDef.tipo === 'qual') {
      el.innerHTML = `<p style="font-size:.82rem;color:var(--t3);padding:10px 0">El ranking numérico no aplica a variables categóricas como "${varDef ? esc(varDef.label) : ''}". Elegí una variable numérica en los controles del mapa.</p>`;
      return;
    }
    let html = `<div class="m135-rank-filters">
      <select id="rfSeccion"><option value="">Toda la Provincia</option></select>
      <select id="rfRegion"><option value="">Todas las regiones</option><option value="Interior">Interior</option><option value="Conurbano">Conurbano</option></select>
      <select id="rfCat"><option value="">Todos los tamaños</option></select>
    </div>
    <div id="rankBody"></div>`;
    el.innerHTML = html;

    const secciones = Array.from(new Set(MUNIS.map(m => GEO_DATA[m] && GEO_DATA[m].sec).filter(Boolean))).sort();
    $('#rfSeccion').innerHTML += secciones.map(s => `<option value="${esc(s)}">${esc(s)} sección</option>`).join('');
    const cats = Array.from(new Set(MUNIS.map(m => GEO_DATA[m] && GEO_DATA[m].cat).filter(Boolean))).sort();
    $('#rfCat').innerHTML += cats.map(c => `<option value="${esc(c)}">${esc(c)} hab.</option>`).join('');

    function draw() {
      const secc = $('#rfSeccion').value, reg = $('#rfRegion').value, cat = $('#rfCat').value;
      let list = MUNIS.filter(m => {
        const g = GEO_DATA[m] || {};
        if (secc && g.sec !== secc) return false;
        if (reg === 'Conurbano' && !g.cba) return false;
        if (reg === 'Interior' && g.cba) return false;
        if (cat && g.cat !== cat) return false;
        return true;
      });
      const withData = list.map(m => ({ m, v: varDef.get(m) })).filter(x => x.v != null);
      const without = list.length - withData.length;
      // Los municipios con quality_flag:'valor_extremo' se conservan en la
      // base (ficha/comparador) pero no compiten en el ranking público —
      // ver assets/data/monitor135-educacion.json → control_de_calidad.
      const excluded = varDef.getFlag ? withData.filter(x => varDef.getFlag(x.m) === 'valor_extremo') : [];
      const ranked = varDef.getFlag ? withData.filter(x => varDef.getFlag(x.m) !== 'valor_extremo') : withData;
      const sorted = ranked.slice().sort((a, b) => varDef.tipo === 'seq_inv' ? a.v - b.v : b.v - a.v);
      const vals = withData.map(x => x.v);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const med = median(vals);
      const maxAbs = Math.max(...vals.map(v => Math.abs(v)), 1);

      let h = `<div class="m135-rank-summary"><span>${withData.length} con dato</span><span>${without} sin dato</span>${excluded.length ? `<span>${excluded.length} excluidos por control de calidad</span>` : ''}<span>Promedio: <b>${esc(fmtValue(varDef, avg))}</b></span><span>Mediana: <b>${esc(fmtValue(varDef, med))}</b></span></div>`;
      h += '<div class="m135-rank-list">';
      sorted.forEach((x, i) => {
        const w = Math.abs(x.v) / maxAbs * 100;
        const color = (varDef.tipo === 'div' && x.v < 0) ? 'var(--coral-d)' : 'var(--teal-d)';
        h += `<div class="m135-rank-row${x.m === state.selected ? ' self' : ''}"><div class="m135-rank-n">${i + 1}</div><div class="m135-rank-name" data-m="${esc(x.m)}">${esc(dn(x.m))}</div><div class="m135-rank-track"><div class="m135-rank-fill" style="width:${w}%;background:${color}"></div></div><div class="m135-rank-val">${esc(fmtValue(varDef, x.v))}</div></div>`;
      });
      h += '</div>';
      $('#rankBody').innerHTML = h;
      $$('.m135-rank-name', $('#rankBody')).forEach(nm => nm.addEventListener('click', () => { selectMuni(nm.dataset.m); switchTab('radiografia'); }));
    }
    ['rfSeccion', 'rfRegion', 'rfCat'].forEach(id => $('#' + id).addEventListener('change', draw));
    draw();
  }

})();
