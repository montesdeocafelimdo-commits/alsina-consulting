-- ════════════════════════════════════════════════════
-- ALSINA — FASE 2 (addendum): una fila de subscriptions por cuenta
--
-- Modelo elegido: subscriptions no acumula una fila por cada plan que la
-- cuenta tuvo — es UNA fila que evoluciona (plan_id/price_id/status
-- cambian con upgrade/downgrade/cancelación). El historial de qué pasó
-- vive en subscription_periods/payments/payment_provider_events/
-- audit_logs, no en filas paralelas de subscriptions. AD-06 ("cada
-- identidad se vincula con una cuenta personal y un plan principal") es
-- consistente con este modelo: un plan principal a la vez.
-- ════════════════════════════════════════════════════

alter table subscriptions
  add constraint uq_subscriptions_account unique (account_id);
