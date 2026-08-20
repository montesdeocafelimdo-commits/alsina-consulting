-- ════════════════════════════════════════════════════
-- ROLLBACK MANUAL de 20260820210041_fase1_foundations.sql
--
-- Este archivo NO se ejecuta automáticamente — el CLI de Supabase no tiene
-- "down migrations", solo aplica supabase/migrations/*.sql en orden hacia
-- adelante. Este script queda documentado acá para correrlo a mano si hace
-- falta deshacer la FASE 1 completa.
--
-- Es seguro de correr en cualquier momento DESPUÉS de aplicar la migración
-- de FASE 1 y ANTES de que cualquier fase posterior (2 en adelante) haya
-- escrito datos reales de negocio en estas tablas — en ese punto, todo lo
-- que borra son catálogos (planes/precios/capacidades/recursos) y
-- estructura vacía. Si ya hay suscripciones/pagos reales, NO correr esto
-- sin exportar/backupear antes: se pierden con DROP TABLE.
--
-- No toca contacts, unlocks, subscriptions (la tabla vieja), purchases —
-- esas son ajenas a esta migración y no se ven afectadas.
-- ════════════════════════════════════════════════════

BEGIN;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS email_events;
DROP TABLE IF EXISTS email_outbox;
DROP TABLE IF EXISTS email_preferences;
DROP TABLE IF EXISTS manual_access_grants;
DROP TABLE IF EXISTS entitlements;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS payment_provider_events;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS subscription_periods;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS resource_features;
DROP TABLE IF EXISTS resources;
DROP TABLE IF EXISTS plan_features;
DROP TABLE IF EXISTS features;
DROP TABLE IF EXISTS plan_prices;
DROP TABLE IF EXISTS plans;

COMMIT;
