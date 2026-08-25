#!/usr/bin/env node
/* ALSINA — build reproducible del dataset de Electromovilidad Zona Norte.
   Lee la base cuantitativa (Excel, fuente DNRPA/GeoRef/Censo/Chargebox, ver
   hoja "Metodología y fuentes" del propio archivo) + el contenido
   institucional de autoría manual (scripts/data/electromovilidad-
   institucional.json) y genera el JSON PRIVADO que sirve
   api/monitor135/data.js. Este script NUNCA escribe en assets/ ni en
   ninguna carpeta pública — el resultado va siempre a private/data/.

   Uso:
     node scripts/build-electromovilidad-data.mjs [ruta-al-excel]

   Cómo actualizar cuando DNRPA publique un nuevo mes:
     1. Pedir/generar la nueva "Base_Cuantitativa_Electromovilidad_Zona_
        Norte_<AÑO>.xlsx" con las mismas 4 hojas y las mismas columnas
        (Resumen / Base municipal / Enchufables detalle / Metodología y
        fuentes) — mismo orden de columnas, incluso si cambian los valores.
     2. Correr: node scripts/build-electromovilidad-data.mjs ruta/al/nuevo.xlsx
     3. Revisar el resumen que imprime por consola (totales + validación
        cruzada BEV/PHEV) antes de commitear private/data/electromovilidad-
        zona-norte.json.
     4. El contenido institucional/normativo (scripts/data/electromovilidad-
        institucional.json) es editorial: se edita a mano, este script solo
        lo fusiona tal cual — no lo pisa ni lo genera. */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const excelPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(ROOT, 'Base_Cuantitativa_Electromovilidad_Zona_Norte_2026.xlsx');
const institucionalPath = path.join(ROOT, 'scripts/data/electromovilidad-institucional.json');
const outPath = path.join(ROOT, 'private/data/electromovilidad-zona-norte.json');

if (!existsSync(excelPath)) {
  console.error(`No se encontró el Excel en: ${excelPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(excelPath, { cellDates: false });

function sheetRows(name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Falta la hoja "${name}" en el Excel — build cancelado.`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

// ── Base municipal (fuente de verdad de indicadores por municipio) ──
const baseMunicipalRows = sheetRows('Base municipal');
const bmHeader = baseMunicipalRows[0];
const bmDataRows = baseMunicipalRows.slice(1).filter((r) => r[0]);

const BM_COLS = [
  'municipio', 'poblacion2010', 'poblacion2022', 'superficieKm2', 'densidad2022',
  'cero_km', 'valorFiscalCeroKm', 'coberturaValuacion', 'bev', 'phev',
  'sitiosMin', 'transferencias', 'ceroKmPremium', 'titularesJuridicos',
  'crecPoblacion', 'ceroKmPorMil', 'ticketFiscalProm', 'enchufables',
  'enchufablesPorCeroKm', 'enchufablesPorDiezMil', 'enchufablesPorSitio',
  'valorCeroKmPorHabitante', 'premiumPorCeroKm', 'transferenciasPorMil',
];
// Salvaguarda: si alguien reordena columnas en una planilla nueva, avisar
// en vez de mezclar datos silenciosamente.
const EXPECTED_HEADER = [
  'Municipio', 'Población 2010', 'Población 2022', 'Superficie km²', 'Densidad 2022',
  '0 km ene–jul 2026', 'Valor fiscal estimado 0 km (ARS)', 'Cobertura valuación',
  'BEV', 'PHEV', 'Sitios públicos verificados (mín.)', 'Transferencias ene–jul 2026',
  '0 km premium', 'Titulares jurídicos', 'Crec. población 2010–22', '0 km / 1.000 hab.',
  'Ticket fiscal promedio (ARS)', 'Enchufables', 'Enchufables / 0 km',
  'Enchufables / 10.000 hab.', 'Enchufables / sitio', 'Valor 0 km / habitante (ARS)',
  'Premium / 0 km', 'Transferencias / 1.000 hab.',
];
for (let i = 0; i < EXPECTED_HEADER.length; i++) {
  if ((bmHeader[i] || '').trim() !== EXPECTED_HEADER[i]) {
    console.warn(`Aviso: columna ${i} de "Base municipal" es "${bmHeader[i]}", se esperaba "${EXPECTED_HEADER[i]}". Verificar el Excel antes de confiar en el resultado.`);
  }
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

let institucional;
try {
  institucional = JSON.parse(readFileSync(institucionalPath, 'utf8'));
} catch (err) {
  console.error(`No se pudo leer el contenido institucional (${institucionalPath}):`, err.message);
  process.exit(1);
}
const infraPorMunicipio = institucional.evidenciaInfraestructura?.porMunicipio || {};

const municipios = bmDataRows.map((row) => {
  const rec = {};
  BM_COLS.forEach((key, i) => { rec[key] = row[i]; });
  const nombre = String(rec.municipio).trim();
  return {
    slug: slugify(nombre),
    nombre,
    poblacion2010: rec.poblacion2010,
    poblacion2022: rec.poblacion2022,
    superficieKm2: rec.superficieKm2,
    densidad2022: rec.densidad2022,
    crecimientoPoblacional: rec.crecPoblacion,
    ceroKm: rec.cero_km,
    ceroKmPorMilHab: rec.ceroKmPorMil,
    valorFiscalCeroKm: rec.valorFiscalCeroKm,
    valorFiscalPorHabitante: rec.valorCeroKmPorHabitante,
    ticketFiscalPromedio: rec.ticketFiscalProm,
    coberturaValuacion: rec.coberturaValuacion,
    ceroKmPremium: rec.ceroKmPremium,
    participacionPremium: rec.premiumPorCeroKm,
    titularesJuridicos: rec.titularesJuridicos,
    transferencias: rec.transferencias,
    transferenciasPorMilHab: rec.transferenciasPorMil,
    bev: rec.bev,
    phev: rec.phev,
    enchufables: rec.enchufables,
    enchufablesPorCeroKm: rec.enchufablesPorCeroKm,
    enchufablesPorDiezMilHab: rec.enchufablesPorDiezMil,
    sitiosCargaMin: rec.sitiosMin,
    enchufablesPorSitio: rec.enchufablesPorSitio,
    sitiosIdentificados: infraPorMunicipio[nombre] || [],
  };
});

// ── Enchufables detalle ──
const detalleRows = sheetRows('Enchufables detalle');
const detalleData = detalleRows.slice(1).filter((r) => r[0]);
const enchufablesDetalle = detalleData.map((r) => ({
  municipio: r[0],
  tecnologia: r[1],
  marca: r[2],
  modelo: r[3],
  unidadesPonderadas: r[4],
  valorFiscalEstimado: r[5],
}));

// ── Totales (Resumen) — se recalculan desde Base municipal para no
// depender de que la hoja Resumen tenga el layout exacto; sirven además
// como chequeo cruzado impreso por consola más abajo. ──
const round2 = (n) => Math.round(n * 100) / 100;
const sum = (key) => round2(municipios.reduce((acc, m) => acc + (Number(m[key]) || 0), 0));

const totales = {
  ceroKm: sum('ceroKm'),
  transferencias: sum('transferencias'),
  valorFiscalCeroKm: municipios.reduce((acc, m) => acc + (Number(m.valorFiscalCeroKm) || 0), 0),
  bev: sum('bev'),
  phev: sum('phev'),
  enchufables: sum('enchufables'),
  sitiosCargaMin: municipios.reduce((acc, m) => acc + (Number(m.sitiosCargaMin) || 0), 0),
};

const dataset = {
  meta: {
    generadoPor: 'scripts/build-electromovilidad-data.mjs',
    fechaGeneracion: new Date().toISOString().slice(0, 10),
    archivoFuente: path.basename(excelPath),
    coberturaTemporal: 'Enero–julio de 2026',
    valuacionesVigentesDesde: '2026-08-01',
    corteInformacion: '2026-08-25',
    aclaracion: 'Las cantidades de vehículos pueden ser fraccionarias: los registros con cotitularidad fueron ponderados según el porcentaje de titularidad de cada persona. El valor fiscal estimado surge de cruzar radicaciones con la tabla de valuaciones DNRPA vigente desde agosto de 2026 y no es precio de mercado ni facturación comercial.',
  },
  totales,
  contextoNacional: institucional.contextoNacional,
  municipios,
  enchufablesDetalle,
  institucional: {
    actoresPorNivel: institucional.actoresPorNivel,
    normativa: institucional.normativa,
    competenciasMunicipales: institucional.competenciasMunicipales,
    evidenciaInfraestructura: institucional.evidenciaInfraestructura,
  },
  fuentes: institucional.fuentes,
};

writeFileSync(outPath, JSON.stringify(dataset, null, 2), 'utf8');

// ── Resumen de validación por consola ──
console.log('\n=== Electromovilidad Zona Norte — build OK ===');
console.log('Municipios:', municipios.length);
console.log('Total 0 km:', totales.ceroKm);
console.log('Total transferencias:', totales.transferencias);
console.log('Total valor fiscal 0 km (ARS):', totales.valorFiscalCeroKm);
console.log('Total BEV:', totales.bev, '| Total PHEV:', totales.phev, '| Total enchufables:', totales.enchufables);
console.log('Total sitios de carga (mín.):', totales.sitiosCargaMin);
console.log('Filas de detalle de enchufables:', enchufablesDetalle.length);

const detalleSumPorMuni = {};
for (const r of enchufablesDetalle) {
  detalleSumPorMuni[r.municipio] ||= { bev: 0, phev: 0 };
  detalleSumPorMuni[r.municipio][r.tecnologia.toLowerCase()] += Number(r.unidadesPonderadas) || 0;
}
let mismatches = 0;
for (const m of municipios) {
  const d = detalleSumPorMuni[m.nombre] || { bev: 0, phev: 0 };
  const diffBev = Math.abs(d.bev - m.bev);
  const diffPhev = Math.abs(d.phev - m.phev);
  if (diffBev > 0.01 || diffPhev > 0.01) {
    mismatches++;
    console.warn(`⚠ Desvío en ${m.nombre}: detalle BEV=${d.bev} PHEV=${d.phev} vs base BEV=${m.bev} PHEV=${m.phev}`);
  }
}
console.log(mismatches === 0
  ? '✓ Enchufables detalle == Base municipal en los 10 municipios (BEV y PHEV).'
  : `✗ ${mismatches} municipio(s) con desvío entre "Enchufables detalle" y "Base municipal" — revisar antes de publicar.`);

console.log(`\nArchivo generado: ${path.relative(ROOT, outPath)}`);
