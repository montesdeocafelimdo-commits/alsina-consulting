#!/usr/bin/env node
/* ALSINA — build reproducible de la geometría real de Zona Norte para el
   informe de Electromovilidad (assets/data/zona-norte-partidos.json).

   Por qué existe: la primera versión de este mapa reutilizaba los paths SVG
   de alsina-mapa-politico.html, dibujados para un mapa provincial de 134
   partidos a escala muy chica. Al recortar y ampliar solo Zona Norte, la
   baja densidad de vértices se nota (se ve "aproximado"). Este script
   reemplaza esa geometría por límites reales de mayor resolución.

   Fuente: servicio WFS del IGN (Instituto Geográfico Nacional), capa
   ign:departamento — límites catastrales de ARBA (Gerencia de Servicios
   Catastrales). Es la misma fuente que respalda GeoRef (ver "fuentes" del
   informe). Se descarga en vivo — requiere conexión a internet.

   Qué hace:
     1. Pide al WFS los 10 partidos por su código INDEC/GeoRef (in1).
     2. Simplifica cada polígono con Douglas-Peucker (~35m de tolerancia) —
        el catastro trae miles de vértices por partido, mucho más de lo que
        hace falta para un mapa interactivo en pantalla.
     3. Proyecta lon/lat a un plano local (equirectangular, centrado en el
        centroide del conjunto) — suficiente para un mapa regional chico,
        no para mediciones.
     4. Escribe assets/data/zona-norte-partidos.json con el mismo shape que
        ya consume electromovilidad-app.js: {viewBox, partidos:{slug:{nombre,d}}}.

   Uso:
     node scripts/build-zona-norte-geometria.mjs

   Cuándo volver a correrlo: solo si IGN/ARBA actualiza algún límite
   catastral de estos 10 partidos, o si se necesita geometría real para
   otro conjunto de partidos — no tiene relación con las actualizaciones
   mensuales de DNRPA (ver build-electromovilidad-data.mjs para eso). */

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets/data/zona-norte-partidos.json');

// código "in1" (INDEC) de cada partido en la capa ign:departamento
const TARGET = {
  '06252': 'escobar', '06412': 'jose-c-paz', '06861': 'vicente-lopez',
  '06749': 'san-fernando', '06805': 'tigre', '06760': 'san-miguel',
  '06638': 'pilar', '06515': 'malvinas-argentinas', '06371': 'general-san-martin',
  '06756': 'san-isidro',
};
const NOMBRES = {
  escobar: 'Escobar', 'jose-c-paz': 'José C. Paz', 'vicente-lopez': 'Vicente López',
  'san-fernando': 'San Fernando', tigre: 'Tigre', 'san-miguel': 'San Miguel',
  pilar: 'Pilar', 'malvinas-argentinas': 'Malvinas Argentinas',
  'general-san-martin': 'General San Martín', 'san-isidro': 'San Isidro',
};

const NAMES_CQL = Object.values(NOMBRES).map((n) => `'${n}'`).join(',');
const WFS_URL = 'https://wms.ign.gob.ar/geoserver/ows?' + new URLSearchParams({
  service: 'WFS', version: '2.0.0', request: 'GetFeature',
  typeName: 'ign:departamento', outputFormat: 'application/json',
  CQL_FILTER: `nam IN (${NAMES_CQL})`,
});

const EPS = 0.00035; // ~35m de tolerancia — conserva la forma real, recorta redundancia catastral
function rdp(points, eps) {
  if (points.length < 3) return points;
  function perpDist(pt, a, b) {
    const [x, y] = pt, [x1, y1] = a, [x2, y2] = b;
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const px = x1 + t * dx, py = y1 + t * dy;
    return Math.hypot(x - px, y - py);
  }
  let dmax = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const left = rdp(points.slice(0, idx + 1), eps);
    const right = rdp(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

console.log('Pidiendo geometría a', WFS_URL);
const res = await fetch(WFS_URL);
if (!res.ok) throw new Error(`WFS respondió ${res.status}`);
const geo = await res.json();

const features = {};
for (const f of geo.features) {
  const slug = TARGET[f.properties.in1];
  if (slug) features[slug] = f;
}
const missing = Object.values(TARGET).filter((slug) => !features[slug]);
if (missing.length) throw new Error(`Faltan partidos en la respuesta del WFS: ${missing.join(', ')}`);

let vertsBefore = 0, vertsAfter = 0;
const allPts = [];
const simplified = {};
for (const [slug, f] of Object.entries(features)) {
  const polys = [];
  for (const poly of f.geometry.coordinates) {
    const rings = [];
    for (const ring of poly) {
      vertsBefore += ring.length;
      const s = rdp(ring.map((p) => [p[0], p[1]]), EPS);
      vertsAfter += s.length;
      rings.push(s);
      allPts.push(...s);
    }
    polys.push(rings);
  }
  simplified[slug] = polys;
}
console.log(`Vértices: ${vertsBefore} → ${vertsAfter} (${Math.round((100 * vertsAfter) / vertsBefore)}%)`);

const lons = allPts.map((p) => p[0]), lats = allPts.map((p) => p[1]);
const lon0 = (Math.min(...lons) + Math.max(...lons)) / 2;
const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
const K = 4000; // escala arbitraria a unidades SVG
const cosLat0 = Math.cos((lat0 * Math.PI) / 180);
function project(lon, lat) {
  return [(lon - lon0) * cosLat0 * K, -(lat - lat0) * K];
}

const partidosOut = {};
const xs = [], ys = [];
for (const [slug, polys] of Object.entries(simplified)) {
  const dParts = [];
  for (const rings of polys) {
    for (const ring of rings) {
      const proj = ring.map(([lon, lat]) => project(lon, lat));
      proj.forEach(([x, y]) => { xs.push(x); ys.push(y); });
      dParts.push('M ' + proj.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ') + ' Z');
    }
  }
  partidosOut[slug] = { nombre: NOMBRES[slug], d: dParts.join(' ') };
}

const margin = 20;
const minX = Math.min(...xs) - margin, maxX = Math.max(...xs) + margin;
const minY = Math.min(...ys) - margin, maxY = Math.max(...ys) + margin;
const viewBox = `${minX.toFixed(1)} ${minY.toFixed(1)} ${(maxX - minX).toFixed(1)} ${(maxY - minY).toFixed(1)}`;

const out = {
  meta: {
    fuente: 'IGN (Instituto Geográfico Nacional) vía servicio WFS wms.ign.gob.ar, capa ign:departamento — límites catastrales de ARBA (Gerencia de Servicios Catastrales)',
    fechaDescarga: new Date().toISOString().slice(0, 10),
    proyeccion: 'Equirectangular local (centrada en el centroide de Zona Norte), simplificada con Douglas-Peucker (tolerancia ~35m) para uso web — no apta para mediciones catastrales.',
    nota: 'Reemplaza la geometría estilizada de alsina-mapa-politico.html (diseñada para un mapa provincial completo a escala muy pequeña) por límites reales de mayor resolución, apropiados para un mapa ampliado de solo diez partidos.',
  },
  viewBox,
  partidos: partidosOut,
};

writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log('Archivo generado:', path.relative(process.cwd(), OUT));
