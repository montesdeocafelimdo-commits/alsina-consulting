-- Rollback manual de 20260825120000_checkout_intents.sql — no se ejecuta
-- automáticamente (el CLI de Supabase no tiene "down migrations").
-- Seguro de correr mientras no haya intentos de checkout reales registrados
-- todavía; si ya los hay, esto los borra de forma irreversible.

DROP TABLE IF EXISTS checkout_intents;
