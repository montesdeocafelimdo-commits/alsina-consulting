-- ════════════════════════════════════════════════════
-- ALSINA — FASE 1: fundaciones de identidad, planes y pagos
-- Aprobado en docs/subscriptions-audit/11-approved-decisions.md (AD-01..AD-22)
-- y en docs/subscriptions-audit/09-implementation-plan.md.
--
-- Esta migración es ADITIVA: no modifica ni borra ninguna tabla existente
-- (contacts, unlocks, subscriptions, purchases de supabase-migration.sql).
-- Esas tablas siguen siendo la fuente de verdad de lo ya recolectado hasta
-- que se ejecute, por separado y de forma explícita, la migración de datos
-- heredados (AD-05) — que NO forma parte de este archivo.
--
-- NO SE APLICÓ contra ningún proyecto de Supabase remoto desde el entorno
-- donde se generó este archivo — no había CLI de Supabase autenticada ni
-- forma de verificar el backup previo (ver docs/subscriptions-audit/
-- 12-fase1-status.md). Debe revisarse y aplicarse manualmente.
-- ════════════════════════════════════════════════════

-- ── PLANES Y PRECIOS VERSIONADOS (AD-01, AD-02, AD-03) ──────────────────

CREATE TABLE IF NOT EXISTS plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        UNIQUE NOT NULL,          -- 'concejal' | 'intendente' | 'gobernador'
  name        text        NOT NULL,                 -- nombre visible
  sort_order  int         NOT NULL,
  created_at  timestamptz DEFAULT now()
);
COMMENT ON TABLE plans IS 'Los 3 planes definitivos (AD-01). No usar nombres de plan como condicional disperso en código — ver plan_features.';

-- Una fila por versión de precio. Nunca se sobrescribe una versión
-- histórica (AD-02): un aumento de precio de lista crea una fila nueva con
-- available_for_new_signups=true y, en la misma operación, se cierra la
-- fila anterior (available_for_new_signups=false, effective_until=now()).
CREATE TABLE IF NOT EXISTS plan_prices (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                   uuid        NOT NULL REFERENCES plans(id),
  amount                    numeric     NOT NULL,
  currency                  text        NOT NULL DEFAULT 'ARS',
  frequency                 text        NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly')),
  is_founder                boolean     NOT NULL DEFAULT false,
  available_for_new_signups boolean     NOT NULL DEFAULT true,
  effective_from            timestamptz NOT NULL DEFAULT now(),
  effective_until           timestamptz,
  provider                  text,                    -- 'mercadopago' | NULL (Concejal no usa proveedor, AD-03)
  provider_price_id         text,                     -- id del lado de Mercado Pago, cuando exista
  created_at                timestamptz DEFAULT now()
);
COMMENT ON TABLE plan_prices IS 'Versionado de precios (AD-02/AD-03). Cada subscriptions.price_id apunta a una fila inmutable de acá — nunca al monto "actual" de un plan.';
CREATE INDEX IF NOT EXISTS idx_plan_prices_plan ON plan_prices(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_prices_available ON plan_prices(plan_id, available_for_new_signups);

-- ── CAPACIDADES (AD-22) ──────────────────────────────────────────────
-- "Los recursos declaran capacidades y los planes conceden capacidades.
--  No dispersar reglas como plan === 'gobernador' por el código."

CREATE TABLE IF NOT EXISTS features (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        UNIQUE NOT NULL,   -- ej. 'monitor_full_view'
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_features (
  plan_id     uuid NOT NULL REFERENCES plans(id),
  feature_id  uuid NOT NULL REFERENCES features(id),
  level       text NOT NULL DEFAULT 'full' CHECK (level IN ('basic', 'full')),
  PRIMARY KEY (plan_id, feature_id)
);
COMMENT ON TABLE plan_features IS 'Qué capacidad concede cada plan, y en qué nivel (básica/completa — ver AD-19, "consulta municipal").';

CREATE TABLE IF NOT EXISTS resources (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        UNIQUE NOT NULL,
  title          text        NOT NULL,
  resource_type  text        NOT NULL CHECK (resource_type IN ('note', 'report', 'series', 'dashboard', 'dataset', 'tool', 'institutional_report')),
  created_at     timestamptz DEFAULT now()
);
COMMENT ON TABLE resources IS 'Catálogo de recursos de docs/subscriptions-audit/10-access-decision-matrix.md. Un recurso sin fila en resource_features es público.';

CREATE TABLE IF NOT EXISTS resource_features (
  resource_id     uuid NOT NULL REFERENCES resources(id),
  feature_id      uuid NOT NULL REFERENCES features(id),
  required_level  text NOT NULL DEFAULT 'full' CHECK (required_level IN ('basic', 'full')),
  PRIMARY KEY (resource_id, feature_id)
);

-- ── IDENTIDAD Y CUENTAS (AD-04, AD-06) ───────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  full_name   text,
  created_at  timestamptz DEFAULT now()
);
COMMENT ON TABLE profiles IS 'Identidad autenticada (Supabase Auth). No confundir con contacts, que sigue siendo la tabla de leads/marketing hasta la migración de AD-05.';

CREATE TABLE IF NOT EXISTS accounts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id      uuid        NOT NULL UNIQUE REFERENCES profiles(id),  -- UNIQUE = relación 1:1 (AD-06, sin equipos en v1)
  kind                  text        NOT NULL DEFAULT 'personal' CHECK (kind = 'personal'),
  legacy_contact_source text,        -- contacts.source original, si viene de una migración AD-05
  legacy_confirmed_at   timestamptz, -- contacts.created_at/confirmed original, preservado
  created_at            timestamptz DEFAULT now()
);
COMMENT ON TABLE accounts IS 'Relación 1:1 con profiles en esta versión (AD-06). El campo kind queda restringido a personal a propósito — ampliar a institucional es un cambio de esquema explícito, no algo a habilitar por accidente.';

-- ── SUSCRIPCIONES Y PAGOS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid        NOT NULL REFERENCES accounts(id),
  plan_id             uuid        NOT NULL REFERENCES plans(id),
  price_id            uuid        NOT NULL REFERENCES plan_prices(id), -- referencia inmutable a la versión aceptada (AD-03)
  status              text        NOT NULL DEFAULT 'incomplete' CHECK (status IN (
                        'incomplete', 'pending', 'trialing', 'active', 'past_due',
                        'grace_period', 'suspended', 'cancel_at_period_end', 'canceled',
                        'refunded', 'disputed'
                      )),
  provider            text,                     -- 'mercadopago' | NULL (Concejal)
  provider_subscription_id text UNIQUE,
  anniversary_day     int         CHECK (anniversary_day BETWEEN 1 AND 31),
  current_period_start timestamptz,
  paid_through        timestamptz,
  grace_started_at    timestamptz,
  suspended_at        timestamptz,
  cancel_requested_at timestamptz,
  canceled_at         timestamptz,
  cancellation_code   text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
COMMENT ON TABLE subscriptions IS 'Estados normalizados según AD-10/AD-11/AD-12/AD-13 — no acoplar 1:1 con nombres del proveedor (ver 09-implementation-plan.md FASE 4).';
CREATE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS subscription_periods (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES subscriptions(id),
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  price_id        uuid        NOT NULL REFERENCES plan_prices(id),
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscription_periods_sub ON subscription_periods(subscription_id);

CREATE TABLE IF NOT EXISTS payments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid        NOT NULL REFERENCES accounts(id),
  subscription_id     uuid        REFERENCES subscriptions(id),  -- NULL si es una compra de informe suelta
  resource_id         uuid        REFERENCES resources(id),      -- NULL si es un cobro de suscripción
  provider            text        NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text        UNIQUE,
  amount              numeric     NOT NULL,
  currency            text        NOT NULL DEFAULT 'ARS',
  status              text        NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'refunded', 'disputed')),
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_account ON payments(account_id);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);

-- ── IDEMPOTENCIA DE EVENTOS DEL PROVEEDOR (AD-07) ────────────────────
-- Pieza que hoy no existe en absoluto (ver 06-security-and-rls-audit.md).
-- dedup_key = `${provider}:${event_type}:${provider_event_id}` — se calcula
-- en la aplicación antes del INSERT; el UNIQUE de abajo es la barrera real
-- contra procesar el mismo evento dos veces.

CREATE TABLE IF NOT EXISTS payment_provider_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider           text        NOT NULL DEFAULT 'mercadopago',
  event_type         text        NOT NULL,          -- 'payment' | 'subscription_preapproval' | ...
  provider_event_id  text,                           -- dataId de Mercado Pago
  dedup_key          text        NOT NULL UNIQUE,
  payload_sanitized  jsonb,                           -- NUNCA incluir tokens/secretos acá
  signature_valid    boolean     NOT NULL,
  processed          boolean     NOT NULL DEFAULT false,
  processed_at       timestamptz,
  error              text,
  received_at        timestamptz DEFAULT now()
);
COMMENT ON TABLE payment_provider_events IS 'Idempotencia real de webhooks (AD-07). El endpoint SIEMPRE inserta acá antes de aplicar ningún efecto — un dedup_key repetido no debe volver a mandar email ni tocar subscriptions/payments.';
CREATE INDEX IF NOT EXISTS idx_ppe_processed ON payment_provider_events(processed);

-- ── FACTURACIÓN (AD-08) ──────────────────────────────────────────────
-- El modelo se crea ahora; NO emitir fiscal_document_id real (integración
-- ARCA) hasta cerrar la verificación humana de situación fiscal — ver
-- docs/subscriptions-audit/10-production-readiness-checklist.md.

CREATE TABLE IF NOT EXISTS invoices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         uuid        NOT NULL UNIQUE REFERENCES payments(id),
  account_id         uuid        NOT NULL REFERENCES accounts(id),
  status             text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'failed', 'cancelled', 'credited')),
  amount             numeric     NOT NULL,
  currency           text        NOT NULL DEFAULT 'ARS',
  issued_at          timestamptz,
  fiscal_document_id text,                            -- NULL hasta integrar ARCA de verdad
  created_at         timestamptz DEFAULT now()
);

-- ── ENTITLEMENTS Y ACCESOS MANUALES ──────────────────────────────────
-- Tabla derivada: se recalcula ante cada cambio de estado de subscriptions
-- (paso 8 del flujo del prompt maestro, "los permisos se recalculan en
-- Supabase"). La función de recálculo se agrega en FASE 2/4 junto con el
-- código que la dispara — acá solo el esquema.

CREATE TABLE IF NOT EXISTS entitlements (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES accounts(id),
  feature_id  uuid        NOT NULL REFERENCES features(id),
  level       text        NOT NULL DEFAULT 'full' CHECK (level IN ('basic', 'full')),
  source      text        NOT NULL CHECK (source IN ('plan', 'manual_grant')),
  source_id   uuid,                                   -- subscriptions.id o manual_access_grants.id
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entitlements_account ON entitlements(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_entitlements_account_feature_source ON entitlements(account_id, feature_id, source, source_id);

CREATE TABLE IF NOT EXISTS manual_access_grants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES accounts(id),
  feature_id   uuid        NOT NULL REFERENCES features(id),
  level        text        NOT NULL DEFAULT 'full' CHECK (level IN ('basic', 'full')),
  reason       text        NOT NULL,
  granted_by   uuid        NOT NULL REFERENCES profiles(id),
  granted_at   timestamptz DEFAULT now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  revoked_by   uuid        REFERENCES profiles(id)
);
COMMENT ON TABLE manual_access_grants IS 'Toda acción manual relevante registra administrador, fecha, motivo, estado anterior y nuevo (ver audit_logs para el detalle de auditoría).';

-- ── EMAIL (base para FASE 6) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_preferences (
  account_id        uuid        PRIMARY KEY REFERENCES accounts(id),
  editorial_opt_in  boolean     NOT NULL DEFAULT true,
  updated_at        timestamptz DEFAULT now()
);
COMMENT ON TABLE email_preferences IS 'La baja editorial (editorial_opt_in=false) nunca debe impedir emails transaccionales — esos no consultan esta tabla (AD-04, AD-14).';

CREATE TABLE IF NOT EXISTS email_outbox (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid        REFERENCES accounts(id),
  to_email      text        NOT NULL,
  template_key  text        NOT NULL,
  payload       jsonb,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts      int         NOT NULL DEFAULT 0,
  last_error    text,
  created_at    timestamptz DEFAULT now(),
  sent_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status);

CREATE TABLE IF NOT EXISTS email_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_outbox_id  uuid        REFERENCES email_outbox(id),
  event_type       text        NOT NULL,  -- 'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked'
  occurred_at      timestamptz DEFAULT now(),
  raw              jsonb
);

-- ── AUDITORÍA (AD-17) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id  uuid        REFERENCES profiles(id),
  actor_role        text,                              -- 'super_admin' | 'partner' | 'system'
  action            text        NOT NULL,
  target_table      text,
  target_id         uuid,
  before            jsonb,
  after             jsonb,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_table, target_id);

-- ════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════
-- Regla general: catálogos (plans/plan_prices/features/plan_features/
-- resources/resource_features) son de lectura pública — son precios y
-- capacidades, no datos personales. Todo lo demás es cerrado por defecto:
-- el dueño de la cuenta puede LEER lo propio; ninguna escritura desde
-- 'anon'/'authenticated' en ninguna tabla nueva — todas las escrituras
-- pasan por funciones de servidor con service_role, igual que hoy.

ALTER TABLE plans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_prices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE features                ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_features          ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources               ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_features       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_periods     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_provider_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_access_grants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_preferences        ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox             ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs               ENABLE ROW LEVEL SECURITY;

-- Catálogos: lectura pública (anon + authenticated), sin escritura de cliente.
CREATE POLICY "public_read_plans"            ON plans            FOR SELECT USING (true);
CREATE POLICY "public_read_plan_prices"      ON plan_prices      FOR SELECT USING (true);
CREATE POLICY "public_read_features"         ON features         FOR SELECT USING (true);
CREATE POLICY "public_read_plan_features"    ON plan_features    FOR SELECT USING (true);
CREATE POLICY "public_read_resources"        ON resources        FOR SELECT USING (true);
CREATE POLICY "public_read_resource_features" ON resource_features FOR SELECT USING (true);

-- profiles: cada usuario ve y actualiza solo su propia fila.
CREATE POLICY "own_profile_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- accounts: el dueño ve su propia cuenta. Sin INSERT/UPDATE/DELETE de
-- cliente — la creación de cuenta es un paso controlado del backend (FASE 2).
CREATE POLICY "own_account_select" ON accounts FOR SELECT USING (auth.uid() = owner_profile_id);

-- subscriptions/payments/invoices/entitlements/email_preferences: el dueño
-- de la cuenta puede leer lo propio; ninguna escritura de cliente.
CREATE POLICY "own_subscriptions_select" ON subscriptions FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_profile_id = auth.uid()));

CREATE POLICY "own_subscription_periods_select" ON subscription_periods FOR SELECT
  USING (subscription_id IN (
    SELECT s.id FROM subscriptions s
    JOIN accounts a ON a.id = s.account_id
    WHERE a.owner_profile_id = auth.uid()
  ));

CREATE POLICY "own_payments_select" ON payments FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_profile_id = auth.uid()));

CREATE POLICY "own_invoices_select" ON invoices FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_profile_id = auth.uid()));

CREATE POLICY "own_entitlements_select" ON entitlements FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_profile_id = auth.uid()));

CREATE POLICY "own_email_preferences_select" ON email_preferences FOR SELECT
  USING (account_id IN (SELECT id FROM accounts WHERE owner_profile_id = auth.uid()));
-- La actualización de preferencia editorial sí es una acción legítima del
-- propio usuario (baja/alta editorial, AD-04) — se permite acotada a su cuenta.
CREATE POLICY "own_email_preferences_update" ON email_preferences FOR UPDATE
  USING (account_id IN (SELECT id FROM accounts WHERE owner_profile_id = auth.uid()));

-- Sin ninguna política para anon/authenticated en: payment_provider_events,
-- manual_access_grants, email_outbox, email_events, audit_logs — acceso
-- exclusivo por service_role, igual que purchases/subscriptions hoy en
-- supabase-migration.sql. No se agregan políticas "por si acaso": ausencia
-- de política = denegado, con RLS habilitado arriba.

-- ════════════════════════════════════════════════════
-- SEEDS DE CATÁLOGO (no son datos de desarrollo — son la definición de
-- negocio ya aprobada: planes, precios de fundador, capacidades y su
-- asignación por plan, y el catálogo de recursos de
-- docs/subscriptions-audit/10-access-decision-matrix.md).
-- Los seeds de DESARROLLO (cuentas/suscripciones de prueba) van en
-- supabase/seeds/dev-seed.sql, nunca acá.
-- ════════════════════════════════════════════════════

INSERT INTO plans (slug, name, sort_order) VALUES
  ('concejal',   'Concejal',   1),
  ('intendente', 'Intendente', 2),
  ('gobernador', 'Gobernador', 3)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plan_prices (plan_id, amount, currency, frequency, is_founder, available_for_new_signups, provider)
SELECT id, 0, 'ARS', 'monthly', true, true, NULL FROM plans WHERE slug = 'concejal'
UNION ALL
SELECT id, 25000, 'ARS', 'monthly', true, true, 'mercadopago' FROM plans WHERE slug = 'intendente'
UNION ALL
SELECT id, 45000, 'ARS', 'monthly', true, true, 'mercadopago' FROM plans WHERE slug = 'gobernador'
ON CONFLICT DO NOTHING;

INSERT INTO features (key, description) VALUES
  ('newsletter_receive',        'Recibir la Señal Alsina'),
  ('report_free_view',          'Leer notas/informes de acceso libre'),
  ('report_standard_view',      'Leer informes/series de nivel intermedio (Intendente+)'),
  ('report_premium_view',       'Leer informes de nivel superior (solo Gobernador)'),
  ('report_archive_access',     'Ver el archivo histórico completo de informes sin corte por antigüedad'),
  ('report_download',           'Descargar un informe en PDF (capacidad futura, no prometida hasta implementarse — AD-21)'),
  ('monitor_basic_view',        'Monitor 135: ingreso, indicadores principales, resumen electoral/fiscal/productivo, consulta municipal resumida'),
  ('monitor_full_view',         'Monitor 135: consulta municipal completa, indicadores avanzados, comparación entre municipios'),
  ('monitor_data_export',       'Monitor 135: descarga y exportación de bases completas'),
  ('interactive_tool_view',     'Ver visualizaciones interactivas públicas (nunca incluye descarga de datos crudos — AD-20)'),
  ('institutional_report_access', 'Acceso a un informe territorial por clave institucional — no depende de plan (AD-15)'),
  ('early_product_access',      'Acceso anticipado a productos nuevos (sin soporte técnico aún, AD-21)')
ON CONFLICT (key) DO NOTHING;

-- plan_features — sigue la matriz definitiva de AD-19/AD-22/10-access-decision-matrix.md
INSERT INTO plan_features (plan_id, feature_id, level)
SELECT p.id, f.id, v.level FROM (VALUES
  ('concejal',   'newsletter_receive',    'full'),
  ('intendente', 'newsletter_receive',    'full'),
  ('gobernador', 'newsletter_receive',    'full'),

  ('concejal',   'report_free_view',      'full'),
  ('intendente', 'report_free_view',      'full'),
  ('gobernador', 'report_free_view',      'full'),

  ('intendente', 'report_standard_view',  'full'),
  ('gobernador', 'report_standard_view',  'full'),

  ('gobernador', 'report_premium_view',   'full'),
  ('gobernador', 'report_archive_access', 'full'),

  ('concejal',   'monitor_basic_view',    'full'),
  ('intendente', 'monitor_basic_view',    'full'),
  ('gobernador', 'monitor_basic_view',    'full'),

  ('intendente', 'monitor_full_view',     'full'),
  ('gobernador', 'monitor_full_view',     'full'),

  ('gobernador', 'monitor_data_export',   'full'),

  ('concejal',   'interactive_tool_view', 'full'),
  ('intendente', 'interactive_tool_view', 'full'),
  ('gobernador', 'interactive_tool_view', 'full'),

  ('gobernador', 'early_product_access',  'full')
) AS v(plan_slug, feature_key, level)
JOIN plans p ON p.slug = v.plan_slug
JOIN features f ON f.key = v.feature_key
ON CONFLICT (plan_id, feature_id) DO NOTHING;

-- resources + resource_features — matriz C/D/E/F de 10-access-decision-matrix.md.
-- Un recurso SIN fila en resource_features es público (sin capacidad requerida).
INSERT INTO resources (slug, title, resource_type) VALUES
  ('nota-un-empleo-cada-23-vecinos',   'Un empleo cada 23 vecinos',                   'note'),
  ('nota-electoral-2027',              '2027 empieza ahora',                          'note'),
  ('alsina-nota-finanzas-pba',         'Anatomía de la dependencia',                  'note'),
  ('alsina-presupuesto-impositiva-2026', 'Presupuesto e Impositiva PBA 2026',         'report'),
  ('nota-fin-de-una-era',              'El fin de una era',                           'report'),
  ('alsina-radiografia-pba',           'Radiografía del Estado PBA',                  'report'),
  ('alsina-pbg-pba',                   'PBG Municipal PBA 2021–2023',                 'report'),
  ('alsina-balance-fiscal-1s2026',     'Balance fiscal 1S 2026',                      'note'),
  ('balance-fiscal-tool',              'Herramienta de Balance fiscal',               'tool'),
  ('transferencias-135-municipios-csv','Base CSV de Balance fiscal',                  'dataset'),
  ('alsina-recaudacion-tributaria-pba','Recaudación tributaria PBA',                  'series'),
  ('alsina-informe-transferencias',    'Transferencias a municipios',                 'series'),
  ('alsina-mapa-politico',             'Mapa político PBA',                           'tool'),
  ('radar-fiscal-pba',                 'Radar Fiscal PBA',                            'tool'),
  ('super-rigi',                       'Súper RIGI',                                  'tool'),
  ('monitor135-fichas-completas',      'Monitor 135 — consulta municipal completa',   'dashboard'),
  ('monitor135-dataset',               'Monitor 135 — bases completas descargables',  'dataset'),
  ('informe-olavarria',                'Informe territorial — Olavarría',             'institutional_report'),
  ('informe-exaltacion-de-la-cruz',    'Informe territorial — Exaltación de la Cruz', 'institutional_report')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO resource_features (resource_id, feature_id, required_level)
SELECT r.id, f.id, v.required_level FROM (VALUES
  ('nota-un-empleo-cada-23-vecinos',    'report_premium_view', 'full'),
  ('alsina-pbg-pba',                    'report_premium_view', 'full'),
  ('alsina-balance-fiscal-1s2026',      'report_standard_view', 'full'),
  ('balance-fiscal-tool',               'report_standard_view', 'full'),
  ('transferencias-135-municipios-csv', 'report_premium_view', 'full'),   -- "Solo Gobernador" — ver nota en 10-access-decision-matrix.md
  ('alsina-recaudacion-tributaria-pba', 'report_standard_view', 'full'),
  ('alsina-informe-transferencias',     'report_standard_view', 'full'),
  ('monitor135-fichas-completas',       'monitor_full_view', 'full'),
  ('monitor135-dataset',                'monitor_data_export', 'full'),
  ('informe-olavarria',                 'institutional_report_access', 'full'),
  ('informe-exaltacion-de-la-cruz',     'institutional_report_access', 'full')
) AS v(resource_slug, feature_key, required_level)
JOIN resources r ON r.slug = v.resource_slug
JOIN features f ON f.key = v.feature_key
ON CONFLICT (resource_id, feature_id) DO NOTHING;

-- Nota: 'nota-electoral-2027', 'alsina-nota-finanzas-pba',
-- 'alsina-presupuesto-impositiva-2026', 'nota-fin-de-una-era',
-- 'alsina-radiografia-pba', 'alsina-mapa-politico', 'radar-fiscal-pba',
-- 'super-rigi' quedan sin fila en resource_features a propósito: son
-- públicos (AD-18/AD-20). 'informe-olavarria'/'informe-exaltacion-de-la-cruz'
-- tienen fila por completitud documental, pero su acceso real NO pasa por
-- plan_features — se resuelve por clave institucional (AD-15, FASE 5),
-- nunca por una suscripción.
