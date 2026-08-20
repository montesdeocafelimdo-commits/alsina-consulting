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
    .select('id, amount, currency, frequency, is_founder, provider, provider_price_id')
    .eq('plan_id', plan.id)
    .eq('available_for_new_signups', true)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priceError || !price) return null;

  return { plan, price };
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
