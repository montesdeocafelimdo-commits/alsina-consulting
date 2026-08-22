-- ════════════════════════════════════════════════════
-- ALSINA — Seed de DESARROLLO, FASE 1
-- Datos ficticios para probar el modelo de planes/cuentas/suscripciones.
-- NO EJECUTAR CONTRA UN PROYECTO DE PRODUCCIÓN. No contiene ningún dato
-- real de contacts/unlocks/subscriptions/purchases existentes.
--
-- Requiere que 20260820210041_fase1_foundations.sql ya se haya aplicado
-- (usa los slugs de plans/features/resources que esa migración crea).
--
-- Este archivo NO se ejecutó contra ningún proyecto real desde este
-- entorno — se entrega listo para correr en un proyecto de desarrollo,
-- p. ej. con `supabase db execute --file supabase/seeds/dev-seed.sql`
-- o pegado en el SQL Editor de un proyecto Supabase de desarrollo/local.
-- ════════════════════════════════════════════════════

-- Requiere 3 usuarios ya creados en auth.users (vía Supabase Auth, magic
-- link o Admin API) antes de correr este seed — no se crean usuarios de
-- Auth por SQL directo. Reemplazar los UUID de abajo por los reales del
-- proyecto de desarrollo donde se corra este seed.

-- Ejemplo de uso (reemplazar los placeholders):
--   \set concejal_user   '00000000-0000-0000-0000-000000000001'
--   \set intendente_user '00000000-0000-0000-0000-000000000002'
--   \set gobernador_user '00000000-0000-0000-0000-000000000003'

DO $$
DECLARE
  v_concejal_user   uuid := '00000000-0000-0000-0000-000000000001';
  v_intendente_user uuid := '00000000-0000-0000-0000-000000000002';
  v_gobernador_user uuid := '00000000-0000-0000-0000-000000000003';

  v_concejal_plan_id   uuid;
  v_intendente_plan_id uuid;
  v_gobernador_plan_id uuid;

  v_concejal_price_id   uuid;
  v_intendente_price_id uuid;
  v_gobernador_price_id uuid;

  v_concejal_account_id   uuid;
  v_intendente_account_id uuid;
  v_gobernador_account_id uuid;
BEGIN
  -- Nota: esta parte falla si los 3 UUID de arriba no existen en
  -- auth.users del proyecto donde se corre el seed — es intencional,
  -- para no crear cuentas huérfanas sin identidad real de Auth.

  SELECT id INTO v_concejal_plan_id   FROM plans WHERE slug = 'concejal';
  SELECT id INTO v_intendente_plan_id FROM plans WHERE slug = 'intendente';
  SELECT id INTO v_gobernador_plan_id FROM plans WHERE slug = 'gobernador';

  SELECT id INTO v_concejal_price_id   FROM plan_prices WHERE plan_id = v_concejal_plan_id   AND is_founder LIMIT 1;
  SELECT id INTO v_intendente_price_id FROM plan_prices WHERE plan_id = v_intendente_plan_id AND is_founder LIMIT 1;
  SELECT id INTO v_gobernador_price_id FROM plan_prices WHERE plan_id = v_gobernador_plan_id AND is_founder LIMIT 1;

  INSERT INTO profiles (id, email, full_name) VALUES
    (v_concejal_user,   'dev-concejal@example.test',   'Dev Concejal')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO profiles (id, email, full_name) VALUES
    (v_intendente_user, 'dev-intendente@example.test', 'Dev Intendente')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO profiles (id, email, full_name) VALUES
    (v_gobernador_user, 'dev-gobernador@example.test', 'Dev Gobernador')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO accounts (owner_profile_id) VALUES (v_concejal_user)
    ON CONFLICT (owner_profile_id) DO NOTHING
    RETURNING id INTO v_concejal_account_id;
  INSERT INTO accounts (owner_profile_id) VALUES (v_intendente_user)
    ON CONFLICT (owner_profile_id) DO NOTHING
    RETURNING id INTO v_intendente_account_id;
  INSERT INTO accounts (owner_profile_id) VALUES (v_gobernador_user)
    ON CONFLICT (owner_profile_id) DO NOTHING
    RETURNING id INTO v_gobernador_account_id;

  -- Si ya existían (ON CONFLICT), recuperar los ids igual.
  SELECT id INTO v_concejal_account_id   FROM accounts WHERE owner_profile_id = v_concejal_user;
  SELECT id INTO v_intendente_account_id FROM accounts WHERE owner_profile_id = v_intendente_user;
  SELECT id INTO v_gobernador_account_id FROM accounts WHERE owner_profile_id = v_gobernador_user;

  INSERT INTO subscriptions (account_id, plan_id, price_id, status, anniversary_day, current_period_start, paid_through)
  VALUES (v_concejal_account_id, v_concejal_plan_id, v_concejal_price_id, 'active', NULL, now(), NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO subscriptions (account_id, plan_id, price_id, status, provider, anniversary_day, current_period_start, paid_through)
  VALUES (v_intendente_account_id, v_intendente_plan_id, v_intendente_price_id, 'active', 'mercadopago', extract(day from now())::int, now(), now() + interval '1 month')
  ON CONFLICT DO NOTHING;

  INSERT INTO subscriptions (account_id, plan_id, price_id, status, provider, anniversary_day, current_period_start, paid_through)
  VALUES (v_gobernador_account_id, v_gobernador_plan_id, v_gobernador_price_id, 'past_due', 'mercadopago', extract(day from now())::int, now() - interval '1 month', now() - interval '1 day')
  ON CONFLICT DO NOTHING;

  INSERT INTO email_preferences (account_id, editorial_opt_in) VALUES
    (v_concejal_account_id, true),
    (v_intendente_account_id, true),
    (v_gobernador_account_id, false)
  ON CONFLICT (account_id) DO NOTHING;
END $$;
