// ALSINA — tests de RLS para el modelo de FASE 1.
//
// Requieren un proyecto de Supabase real (desarrollo, nunca producción) con
// la migración supabase/migrations/20260820210041_fase1_foundations.sql ya
// aplicada, y estas variables de entorno:
//   SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY   (solo para preparar datos de prueba)
//
// Si no están seteadas, cada test se salta explícitamente (no se marca
// "pasado" ni se inventa un resultado) — correrlos de verdad es tarea
// pendiente de quien tenga acceso a un proyecto de desarrollo de Supabase,
// ver docs/subscriptions-audit/12-fase1-status.md.
//
// Ejecutar con: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasLiveProject = Boolean(SUPABASE_URL && ANON_KEY);

async function getClients() {
  const { createClient } = await import('@supabase/supabase-js');
  return {
    anon: createClient(SUPABASE_URL, ANON_KEY),
    service: SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null,
  };
}

test('catálogo público: anon puede leer plans', { skip: !hasLiveProject && 'requiere SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY de un proyecto de desarrollo' }, async () => {
  const { anon } = await getClients();
  const { data, error } = await anon.from('plans').select('slug').order('sort_order');
  assert.equal(error, null, 'no debería haber error de RLS al leer un catálogo público');
  const slugs = (data || []).map((p) => p.slug);
  assert.deepEqual(slugs, ['concejal', 'intendente', 'gobernador'], 'los 3 planes definitivos deben estar seedeados en ese orden (AD-01)');
});

test('anon NO puede leer subscriptions de nadie', { skip: !hasLiveProject && 'requiere proyecto de desarrollo' }, async () => {
  const { anon } = await getClients();
  const { data, error } = await anon.from('subscriptions').select('id');
  // Con RLS habilitado y sin política para anon, esto debe devolver un
  // conjunto vacío (o un error de permiso, según versión de PostgREST) —
  // nunca filas de otra cuenta.
  assert.equal(error, null);
  assert.deepEqual(data, [], 'anon no debe ver ninguna fila de subscriptions sin política explícita');
});

test('anon NO puede leer payment_provider_events (sin ninguna política)', { skip: !hasLiveProject && 'requiere proyecto de desarrollo' }, async () => {
  const { anon } = await getClients();
  const { data, error } = await anon.from('payment_provider_events').select('id');
  assert.equal(error, null);
  assert.deepEqual(data, [], 'payment_provider_events es exclusivo de service_role — anon debe ver un conjunto vacío');
});

test('anon NO puede leer audit_logs', { skip: !hasLiveProject && 'requiere proyecto de desarrollo' }, async () => {
  const { anon } = await getClients();
  const { data, error } = await anon.from('audit_logs').select('id');
  assert.equal(error, null);
  assert.deepEqual(data, [], 'audit_logs es exclusivo de service_role — anon debe ver un conjunto vacío');
});

test('plan_prices: nunca hay dos versiones "disponibles para altas" simultáneas para el mismo plan con distinto monto sin cerrar la anterior', {
  skip: !hasLiveProject || !SERVICE_ROLE_KEY ? 'requiere SUPABASE_SERVICE_ROLE_KEY de un proyecto de desarrollo' : false,
}, async () => {
  const { service } = await getClients();
  const { data, error } = await service
    .from('plan_prices')
    .select('plan_id, amount, available_for_new_signups')
    .eq('available_for_new_signups', true);
  assert.equal(error, null);
  const byPlan = new Map();
  for (const row of data || []) {
    const key = row.plan_id;
    if (!byPlan.has(key)) byPlan.set(key, new Set());
    byPlan.get(key).add(row.amount);
  }
  for (const [planId, amounts] of byPlan) {
    assert.equal(amounts.size, 1, `el plan ${planId} tiene más de un precio "disponible para altas" a la vez — viola AD-02`);
  }
});

if (!hasLiveProject) {
  console.log('\n[tests/rls-fase1.test.js] Sin SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno: todos los tests de RLS quedaron SALTEADOS, no verificados. Esto NO es un "test pasado" — ver docs/subscriptions-audit/12-fase1-status.md.\n');
}
