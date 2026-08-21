-- ════════════════════════════════════════════════════
-- ALSINA — soporte de upgrade/downgrade programado (AD-11)
--
-- Downgrade: no genera un cobro nuevo ni una preapproval nueva — solo
-- programa qué plan/precio rige "al próximo aniversario" (paid_through).
-- pending_plan_id/pending_price_id son esa programación; el cron de
-- gracia/cancelación (api/cron/dunning.js) la aplica cuando paid_through
-- se cumple. NULL = no hay downgrade programado. Revertible (AD-11) con
-- solo limpiar estas dos columnas — no toca plan_id/price_id/aniversario
-- actuales, que nunca se tocaron.
--
-- Upgrade: si genera una preapproval nueva en Mercado Pago (cobro
-- inmediato), pero recién debe "activar" el plan nuevo cuando ESE pago
-- se aprueba (AD-11: "si el nuevo pago falla, no se modifica plan,
-- permisos, precio ni aniversario existentes"). pending_provider_
-- subscription_id guarda esa preapproval nueva mientras se espera el
-- pago, sin tocar el provider_subscription_id real (el que sigue
-- facturando el plan actual hasta que el nuevo pago se confirme).
-- ════════════════════════════════════════════════════

alter table subscriptions
  add column if not exists pending_plan_id uuid references plans(id),
  add column if not exists pending_price_id uuid references plan_prices(id),
  add column if not exists pending_provider_subscription_id text;

comment on column subscriptions.pending_plan_id is 'AD-11: downgrade programado, se aplica en paid_through. NULL = sin downgrade pendiente.';
comment on column subscriptions.pending_price_id is 'Precio del pending_plan_id, aceptado al momento de pedir el downgrade (AD-11: "se muestra y registra el precio del plan destino").';
comment on column subscriptions.pending_provider_subscription_id is 'AD-11: preapproval nueva de un upgrade en curso, todavía sin pago aprobado. No confundir con provider_subscription_id (la que factura hoy).';
