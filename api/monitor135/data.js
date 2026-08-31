import { readFile } from 'fs/promises';
import path from 'path';
import { getAuthenticatedAccount } from '../_lib/auth.js';
import { getEntitlements, hasCapability, getResourceAccessLevel } from '../_lib/capabilities.js';

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
//
// Este archivo también sirve OTROS datasets privados no relacionados con
// Monitor 135 (ver RESOURCE_GATED_DATASETS más abajo) — es una decisión
// de infraestructura, no de diseño: ver el comentario junto a esa
// constante.

const DATASETS = {
  municipios: 'private/data/monitor135-municipios.json',
  educacion: 'private/data/monitor135-educacion.json',
  'electromovilidad-zona-norte': 'private/data/electromovilidad-zona-norte.json',
};

// Recursos que NO son Monitor 135 pero comparten este mismo endpoint por
// una razón de infraestructura, no de diseño: Vercel Hobby tiene un
// límite de 12 Serverless Functions y el proyecto ya está en ese límite
// (ver api/subscriptions/[action].js y api/admin/[action].js, que existen
// como routers por el mismo motivo). En vez de sumar una función nueva,
// estos datasets se sirven acá con su PROPIA capacidad — nunca con las de
// Monitor 135 — resuelta genéricamente vía getResourceAccessLevel (AD-22),
// exactamente como se resolvería si tuvieran su propio endpoint.
const RESOURCE_GATED_DATASETS = {
  'electromovilidad-zona-norte': 'informe-electromovilidad-zona-norte',
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
  // Pedido 2026-08-31: liberar variables interesantes de Finanzas para
  // Concejal, para que la categoría no se vea completamente vacía. El
  // resto de Finanzas (variación real/nominal, presupuesto, ranking)
  // sigue exclusivo de Intendente — ver assets/js/monitor135-app.js
  // (FREE_VARS.finanzas).
  'cud_pct_2026',
]);

// "Transferencias recibidas" (trans_total) y "Transferencias por
// habitante" (trans_percapita) comparten el mismo objeto anidado
// "transferencias.<período>" que la variación real/nominal y el
// desglose por componente — no alcanza con un allowlist plano de un
// solo nivel como BASIC_MUNICIPIO_FIELDS. Se reconstruye ese objeto acá
// dejando pasar solo total_2026 por período (lo único que necesitan esas
// dos variables) — nunca total_2025, variación, ranking, ni el desglose
// componentes_2026/2025 (eso sigue exclusivo de Intendente).
const BASIC_TRANSFERENCIAS_FIELDS = new Set(['total_2026']);

function redactTransferencias(transferencias) {
  if (!transferencias) return undefined;
  const out = {};
  for (const periodo of ['primer_semestre', 'junio']) {
    const p = transferencias[periodo];
    if (!p) continue;
    out[periodo] = {};
    for (const key of BASIC_TRANSFERENCIAS_FIELDS) {
      if (key in p) out[periodo][key] = p[key];
    }
  }
  return out;
}

function redactMunicipio(entry) {
  const basic = {};
  for (const key of BASIC_MUNICIPIO_FIELDS) {
    if (key in entry) basic[key] = entry[key];
  }
  const transferencias = redactTransferencias(entry.transferencias);
  if (transferencias) basic.transferencias = transferencias;
  return basic;
}

// Mismo pedido, para el dataset de Educación — que tiene una forma total-
// mente distinta (cada municipio es un objeto plano de "campo" -> valor,
// ver assets/data/monitor135-educacion.json), así que necesita su propio
// allowlist en vez de reusar BASIC_MUNICIPIO_FIELDS (esos nombres de
// campo no existen acá, y antes de este cambio esto dejaba Educación en
// blanco para Concejal, sin querer). Solo se libera 'edu_matricula_total'
// (FREE_VARS.educacion en el frontend) — el resto exige Intendente.
const BASIC_EDUCACION_FIELDS = new Set(['edu_matricula_total']);

function redactEducacion(entry) {
  const basic = {};
  for (const key of BASIC_EDUCACION_FIELDS) {
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

  const requestedDataset = req.query?.dataset;
  const datasetKey = requestedDataset === 'educacion'
    ? 'educacion'
    : (requestedDataset && DATASETS[requestedDataset]) ? requestedDataset : 'municipios';

  const account = await getAuthenticatedAccount(req); // null si es visitante

  // ── datasets gateados por su propio recurso (no por Monitor 135) ──
  const resourceSlug = RESOURCE_GATED_DATASETS[datasetKey];
  if (resourceSlug) {
    const level = await getResourceAccessLevel(account?.accountId || null, resourceSlug);
    if (level !== 'full') {
      return res.status(200).json({ access: { level: 'none', requiresPlan: 'gobernador' }, data: null });
    }
    let gatedDataset;
    try {
      gatedDataset = await readDataset(datasetKey);
    } catch (err) {
      console.error(`monitor135/data: error leyendo dataset "${datasetKey}":`, err.message);
      return res.status(500).json({ error: 'error_interno' });
    }
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    return res.status(200).json({ access: { level: 'full', requiresPlan: null }, data: gatedDataset });
  }

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

  const redact = datasetKey === 'educacion' ? redactEducacion : redactMunicipio;
  const municipiosRaw = dataset.municipios || {};
  const municipiosOut = {};
  for (const [key, entry] of Object.entries(municipiosRaw)) {
    municipiosOut[key] = hasFull ? entry : redact(entry);
  }

  res.setHeader('Cache-Control', 'private, max-age=0, no-store');
  return res.status(200).json({
    access: { level: hasFull ? 'full' : 'basic', requiresPlan: hasFull ? null : 'intendente' },
    meta: dataset.meta || null,
    municipios: municipiosOut,
  });
}
