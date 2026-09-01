import { getSupabaseAdmin } from './supabaseAdmin.js';

// ALSINA — fuente canónica de planes/precios (AD-01, AD-02, AD-03).
// "Los importes no pueden quedar hardcodeados en api/checkout.js ni
//  aceptarse desde el frontend." Este es el único lugar que resuelve
// "cuánto cuesta el plan X hoy" — todo lo demás llama acá.

/**
 * Plan + versión de precio vigente para altas nuevas. null si el plan no
 * existe o no tiene ninguna versión de precio disponible para altas hoy
 * (estado anómalo — nunca debería pasar en operación normal).
 */
export async function getActivePlanPrice(planSlug) {
  const supa = getSupabaseAdmin();
  const { data: plan, error: planError } = await supa
    .from('plans')
    .select('id, slug, name')
    .eq('slug', planSlug)
    .maybeSingle();
  if (planError || !plan) return null;

  const { data: price, error: priceError } = await supa
    .from('plan_prices')
    .select('id, amount, currency, frequency, is_founder, provider, provider_price_id, provider_test_price_id')
    .eq('plan_id', plan.id)
    .eq('available_for_new_signups', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priceError || !price) return null;

  return { plan, price };
}

// ── Mercado Pago: producción vs. prueba, sin variable de entorno nueva ──
// Los access tokens de prueba de Mercado Pago siempre arrancan con
// "TEST-"; los de producción, con "APP_USR-". Se usa el prefijo del
// token real del entorno para decidir qué columna leer/escribir — así
// nunca hay que confiar en que alguien puso bien un flag aparte.
export function isTestModeMp() {
  return (process.env.MP_ACCESS_TOKEN || '').startsWith('TEST-');
}

/** El ID de preapproval_plan de Mercado Pago que corresponde al entorno actual (o null si nunca se creó). */
export function resolveProviderPlanId(price) {
  return isTestModeMp() ? price.provider_test_price_id || null : price.provider_price_id || null;
}

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

/**
 * Idempotente: si el plan/precio activo de planSlug ya tiene un
 * preapproval_plan de Mercado Pago para el entorno actual (test o
 * producción, según isTestModeMp()), lo verifica contra la API real y lo
 * devuelve. Si no existe o la verificación falla, crea uno nuevo — NUNCA
 * crea una suscripción de cliente ni genera un cobro, un preapproval_plan
 * es solo una plantilla. Nunca mezcla el ID de prueba con el de
 * producción (columnas separadas, ver migración 20260822100000).
 *
 * NOTA (encontrado probando checkout real): el checkout/upgrade actual
 * NO usa el preapproval_plan_id devuelto acá para crear la preapproval
 * del cliente — PreApproval.create() con preapproval_plan_id exige
 * card_token_id (tarjeta ya tokenizada), no sirve para el flujo de
 * "redirigir a la web de Mercado Pago". checkout.js/upgrade.js siguen
 * con auto_recurring ad-hoc. Esta función queda para dejar el registro
 * server-side del plan (lo que pidió Alsina explícitamente) y como base
 * para un futuro flujo con Bricks/Card Form que sí tokenice del lado del
 * cliente antes de llamar acá.
 */
export async function ensureMpPlan(planSlug) {
  const resolved = await getActivePlanPrice(planSlug);
  if (!resolved) return { status: 'error', error: 'plan_no_disponible' };
  const { plan, price } = resolved;

  if (!process.env.MP_ACCESS_TOKEN) return { status: 'error', error: 'MP_ACCESS_TOKEN no configurado' };
  const testMode = isTestModeMp();
  const { MercadoPagoConfig, PreApprovalPlan } = await import('mercadopago');
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const plansApi = new PreApprovalPlan(client);

  const existingId = resolveProviderPlanId(price);
  if (existingId) {
    try {
      // BUG REAL encontrado en producción (2026-09-01, "The template with
      // id X does not exist"): el SDK de Mercado Pago espera acá
      // `preApprovalPlanId`, no `id` (ver PreApprovalPlanGetData en
      // mercadopago/dist/clients/preApprovalPlan/get/types.d.ts) — con
      // `id` el parámetro real le llegaba `undefined` al cliente, la
      // verificación fallaba SIEMPRE (nunca por la razón real, un 404
      // silencioso), y esto creaba una plantilla nueva en cada checkout.
      // Esa plantilla recién creada todavía no está disponible para
      // preapproval.create() del lado de Mercado Pago (demora de
      // propagación) — de ahí el rechazo en el mismo request que la creó.
      const found = await plansApi.get({ preApprovalPlanId: existingId });
      if (found?.status === 'active') {
        return { status: 'ok', mode: 'verified', providerPlanId: existingId, testMode };
      }
      // Existe pero no está activo (ej. lo desactivaron a mano en el
      // panel de MP) — cae a crear uno nuevo más abajo.
    } catch (err) {
      // No se pudo verificar (404, credenciales de otro entorno, etc.) —
      // no lo asumimos roto silenciosamente: se crea uno nuevo y se
      // sobreescribe la referencia vieja, que ya no sirve.
      console.warn(`ensureMpPlan(${planSlug}): no se pudo verificar ${existingId}, creando uno nuevo:`, err?.message || err);
    }
  }

  const supa = getSupabaseAdmin();
  try {
    const created = await plansApi.create({
      body: {
        reason: `Alsina ${plan.name} — suscripción mensual${testMode ? ' (prueba)' : ''}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: Number(price.amount),
          currency_id: price.currency,
        },
        back_url: `${SITE_URL}/planes.html`,
      },
    });

    const column = testMode ? 'provider_test_price_id' : 'provider_price_id';
    const { error: updateError } = await supa.from('plan_prices').update({ [column]: String(created.id) }).eq('id', price.id);
    if (updateError) return { status: 'error', error: `plan creado en MP (${created.id}) pero no se pudo guardar: ${updateError.message}` };

    return { status: 'ok', mode: 'created', providerPlanId: String(created.id), testMode };
  } catch (err) {
    return { status: 'error', error: err?.message || String(err) };
  }
}

/** Plan por id — para resolver el plan de una suscripción existente. */
export async function getPlanById(planId) {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa.from('plans').select('id, slug, name').eq('id', planId).maybeSingle();
  if (error) return null;
  return data;
}

/** Precio por id — para validar contra lo que confirma Mercado Pago. */
export async function getPriceById(priceId) {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('plan_prices')
    .select('id, plan_id, amount, currency, frequency, is_founder')
    .eq('id', priceId)
    .maybeSingle();
  if (error) return null;
  return data;
}
