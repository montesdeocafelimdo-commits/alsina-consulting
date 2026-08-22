-- ════════════════════════════════════════════════════
-- ALSINA — separar el ID de plan recurrente de Mercado Pago por entorno
--
-- plan_prices.provider_price_id es una sola columna — no puede guardar a
-- la vez el ID de un preapproval_plan de PRUEBA (Preview, credenciales
-- TEST-) y el de PRODUCCIÓN (credenciales APP_USR-) para la misma fila
-- de precio. Se agrega una columna separada; cuál se usa en cada
-- request lo decide el propio access token del entorno (los tokens de
-- prueba de Mercado Pago siempre arrancan con "TEST-"), nunca una
-- variable de entorno nueva que alguien podría dejar mal puesta.
-- ════════════════════════════════════════════════════

alter table plan_prices
  add column if not exists provider_test_price_id text;

comment on column plan_prices.provider_price_id is 'ID del preapproval_plan de Mercado Pago en PRODUCCIÓN (credenciales APP_USR-). Nunca se crea/edita con credenciales de prueba.';
comment on column plan_prices.provider_test_price_id is 'ID del preapproval_plan de Mercado Pago de PRUEBA (credenciales TEST-). Separado a propósito de provider_price_id — nunca se mezclan.';
