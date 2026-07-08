-- ════════════════════════════════════════════════════
-- ALSINA — Migración de base de datos (Supabase)
-- Ejecutar en el SQL Editor del proyecto Supabase
-- ════════════════════════════════════════════════════

-- ── CONTACTS ─────────────────────────────────────────
-- Fuente de verdad de leads/suscriptores
CREATE TABLE IF NOT EXISTS contacts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text        UNIQUE NOT NULL,
  source             text,                            -- 'newsletter' | 'informe:<slug>' | 'data-hub'
  confirmed          boolean     DEFAULT false,        -- doble opt-in
  is_subscriber      boolean     DEFAULT false,        -- suscriptor pago (Mercado Pago, futuro)
  confirmation_token uuid        DEFAULT gen_random_uuid(),
  created_at         timestamptz DEFAULT now()
);

-- ── UNLOCKS ──────────────────────────────────────────
-- Registro de contenidos desbloqueados por email
CREATE TABLE IF NOT EXISTS unlocks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  resource    text        NOT NULL,                    -- slug del informe o 'data-hub'
  created_at  timestamptz DEFAULT now(),
  UNIQUE(email, resource)
);

-- ── SUBSCRIPTIONS ────────────────────────────────────
-- Tabla preparada para Mercado Pago (no usar todavía)
CREATE TABLE IF NOT EXISTS subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text,
  plan        text,                                    -- 'pro' | 'municipal'
  status      text        DEFAULT 'inactive',          -- 'active' | 'inactive' | 'cancelled'
  started_at  timestamptz,
  created_at  timestamptz DEFAULT now()
);

-- ════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════

ALTER TABLE contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE unlocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- contacts: INSERT anónimo permitido (con validación de email)
CREATE POLICY "anon_insert_contacts"
  ON contacts FOR INSERT
  TO anon
  WITH CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');

-- unlocks: INSERT anónimo permitido
CREATE POLICY "anon_insert_unlocks"
  ON unlocks FOR INSERT
  TO anon
  WITH CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$');

-- SELECT, UPDATE, DELETE: solo vía service_role key (API serverless)
-- No se exponen datos al cliente directamente

-- ════════════════════════════════════════════════════
-- ÍNDICES
-- ════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_contacts_email   ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_token   ON contacts(confirmation_token);
CREATE INDEX IF NOT EXISTS idx_unlocks_email    ON unlocks(email);
CREATE INDEX IF NOT EXISTS idx_unlocks_resource ON unlocks(resource);

-- ════════════════════════════════════════════════════
-- FASE 6 — Mercado Pago (agregado, no destructivo)
-- Ejecutar solo esta sección si la base ya tiene las tablas de arriba.
-- ════════════════════════════════════════════════════

-- ── PURCHASES ────────────────────────────────────────
-- Compras individuales de informes (pago único vía Checkout Pro)
CREATE TABLE IF NOT EXISTS purchases (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text        NOT NULL,
  resource       text        NOT NULL,                 -- slug del informe comprado
  mp_payment_id  text        UNIQUE NOT NULL,           -- id de pago de Mercado Pago
  amount         numeric,
  status         text        DEFAULT 'paid',
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
-- Sin políticas de INSERT/SELECT para anon: esta tabla solo la escribe
-- api/webhook.js con la service_role key.

CREATE INDEX IF NOT EXISTS idx_purchases_email ON purchases(email);

-- ── SUBSCRIPTIONS — sumar columna para trackear la suscripción en MP ──
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS mp_preapproval_id text UNIQUE;
