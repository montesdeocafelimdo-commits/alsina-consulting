import { readFile } from 'fs/promises';
import path from 'path';
import { getAuthenticatedAccount } from '../_lib/auth.js';
import { getEntitlements, hasCapability } from '../_lib/capabilities.js';

// ALSINA — Monitor 135, dataset protegido (AD-19, FASE 5).
// Reemplaza a los archivos estáticos /assets/data/monitor135-*.json —
// esos ya no existen ahí (movidos a private/data/, bloqueados por
// middleware.js como cualquier otro estático de /private/*). Este es el
// único camino para leerlos, y filtra campos según la capacidad real de
// quien pide, resuelta server-side desde el JWT — nunca desde un query
// param ni un header que el cliente pueda falsificar.
//
// "El navegador nunca recibe el valor o dataset protegido: no implementar
//  seguridad mediante blur/CSS sobre datos ya descargados." (AD-19)

const DATASETS = {
  municipios: 'private/data/monitor135-municipios.json',
  educacion: 'private/data/monitor135-educacion.json',
};

// Primer recorte basic/full — allowlist deliberadamente conservador
// (mejor pecar de restrictivo y ajustar después que filtrar de más tarde
// y exponer de más ahora). Ajustar junto con el equipo editorial cuando
// se defina con precisión qué es "ficha resumida" vs "completa".
const BASIC_MUNICIPIO_FIELDS = new Set([
  'id', 'municipio', 'municipio_slug', 'municipio_normalizado',
  'seccion_electoral', 'departamento_judicial', 'region',
  'es_conurbano', 'es_capital_provincial',
  'poblacion', 'superficie_km2', 'densidad_2022_hab_km2', 'categoria_poblacional_2022',
  'gobierno', // resumen electoral (AD-19: "Resumen electoral... Sí" para todos los niveles)
]);

function redactMunicipio(entry) {
  const basic = {};
  for (const key of BASIC_MUNICIPIO_FIELDS) {
    if (key in entry) basic[key] = entry[key];
  }
  return basic;
}

async function readDataset(datasetKey) {
  const rel = DATASETS[datasetKey];
  const filePath = path.join(process.cwd(), rel);
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const datasetKey = req.query?.dataset === 'educacion' ? 'educacion' : 'municipios';

  const account = await getAuthenticatedAccount(req); // null si es visitante
  const entitlements = await getEntitlements(account?.accountId || null);
  const hasBasic = hasCapability(entitlements, 'monitor_basic_view', 'basic');
  const hasFull = hasCapability(entitlements, 'monitor_full_view', 'basic');
  const hasExport = hasCapability(entitlements, 'monitor_data_export', 'basic');

  if (!hasBasic) {
    // Visitante sin cuenta o cuenta sin ninguna capacidad de Monitor —
    // adelanto, no el dataset (AD-19: "ve un adelanto y CTA a Concejal").
    return res.status(200).json({
      access: { level: 'none', requiresPlan: 'concejal' },
      meta: null,
      municipios: {},
    });
  }

  if (req.query?.export === 'true' && !hasExport) {
    return res.status(403).json({ error: 'requiere_plan_gobernador', capability: 'monitor_data_export' });
  }

  let dataset;
  try {
    dataset = await readDataset(datasetKey);
  } catch (err) {
    console.error('monitor135/data: error leyendo dataset:', err.message);
    return res.status(500).json({ error: 'error_interno' });
  }

  const municipiosRaw = dataset.municipios || {};
  const municipiosOut = {};
  for (const [key, entry] of Object.entries(municipiosRaw)) {
    municipiosOut[key] = hasFull ? entry : redactMunicipio(entry);
  }

  res.setHeader('Cache-Control', 'private, max-age=0, no-store');
  return res.status(200).json({
    access: { level: hasFull ? 'full' : 'basic', requiresPlan: hasFull ? null : 'intendente' },
    meta: dataset.meta || null,
    municipios: municipiosOut,
  });
}
