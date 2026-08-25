-- ── SEGUIMIENTO DE CHECKOUT ABANDONADO (auditoría de conversión 2026-08-25) ──
-- Registra cuándo una cuenta INICIA el checkout de un plan pago (Intendente
-- o Gobernador) para poder detectar y recordarle una sola vez si nunca lo
-- terminó. Aditiva: no toca `subscriptions` ni ninguna tabla existente.
--
-- Por qué una tabla nueva y no reusar `subscriptions`: `subscriptions` es de
-- una fila por cuenta que representa el estado VIGENTE (ver migración
-- 20260821000001) — escribir ahí un intento incompleto ya causó un bug real
-- (ver el comentario en api/_lib/subscriptionHandlers/checkout.js sobre
-- "esto ANTES escribía plan_id/status='incomplete' acá"). Esta tabla es
-- histórica y aditiva por diseño: cada intento es una fila propia, nunca se
-- sobreescribe el estado de la suscripción real.
--
-- `provider_subscription_id` es el mismo preapproval id que ya guarda
-- `subscriptions.provider_subscription_id` al iniciar el checkout — sirve
-- para reconciliar contra Mercado Pago sin duplicar esa columna.

CREATE TABLE IF NOT EXISTS checkout_intents (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  uuid        NOT NULL REFERENCES accounts(id),
  email                       text        NOT NULL,
  plan_slug                   text        NOT NULL CHECK (plan_slug IN ('intendente', 'gobernador')),
  provider_subscription_id    text,                          -- preapproval id de Mercado Pago
  status                      text        NOT NULL DEFAULT 'started'
                                           CHECK (status IN ('started', 'completed', 'reminder_sent', 'expired')),
  checkout_started_at         timestamptz NOT NULL DEFAULT now(),
  checkout_completed_at       timestamptz,
  abandonment_email_sent_at   timestamptz,
  created_at                  timestamptz DEFAULT now()
);
COMMENT ON TABLE checkout_intents IS 'Un checkout de Intendente/Gobernador iniciado. status=started y sin checkout_completed_at 24h+ después = candidato a un único recordatorio (ver api/_lib/cronHandlers/dunning.js).';

-- Una cuenta puede reintentar varias veces (falló, cerró la pestaña, etc.)
-- — no hay UNIQUE por account_id, cada intento queda registrado. El cron de
-- recordatorio solo mira el intento 'started' más reciente por cuenta.
CREATE INDEX IF NOT EXISTS idx_checkout_intents_account   ON checkout_intents(account_id);
CREATE INDEX IF NOT EXISTS idx_checkout_intents_pending    ON checkout_intents(status, checkout_started_at) WHERE status = 'started';

ALTER TABLE checkout_intents ENABLE ROW LEVEL SECURITY;
-- Sin ninguna política para anon/authenticated, igual que payment_provider_events
-- y audit_logs: esta tabla la escribe y lee exclusivamente el backend
-- (service role, que además de bypassear RLS es el único cliente previsto).
