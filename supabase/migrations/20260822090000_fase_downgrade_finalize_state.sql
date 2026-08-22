-- ════════════════════════════════════════════════════
-- ALSINA — estado explícito de reintentos para el downgrade pago-a-pago
-- (Gobernador→Intendente, AD-11)
--
-- La corrección pedida: NO tocar la preapproval de Mercado Pago al
-- pedir el downgrade — se guarda pendiente, se mantienen los beneficios
-- de Gobernador hasta paid_through, y recién en el aniversario un
-- proceso idempotente (api/_lib/subscriptionActions.js
-- finalizePendingDowngrade, llamado desde api/cron/dunning) consulta el
-- estado real en Mercado Pago, actualiza el importe, lo verifica, y solo
-- entonces cambia el plan local. Si algo de eso falla, el plan NUNCA
-- cambia en silencio — queda registrado acá para que el cron reintente
-- al día siguiente sin duplicar nada.
-- ════════════════════════════════════════════════════

alter table subscriptions
  add column if not exists pending_downgrade_attempts int not null default 0,
  add column if not exists pending_downgrade_last_error text,
  add column if not exists pending_downgrade_failed_at timestamptz;

comment on column subscriptions.pending_downgrade_attempts is 'Cuántas veces el cron intentó finalizar el downgrade pendiente sin éxito. Se resetea a 0 al aplicarse o al revertirse.';
comment on column subscriptions.pending_downgrade_last_error is 'Último error (consulta a MP, actualización de importe, o verificación) — NULL si nunca falló o ya se aplicó.';
comment on column subscriptions.pending_downgrade_failed_at is 'Cuándo falló el último intento. No NULL = requiere atención — el aniversario ya pasó y el downgrade sigue sin poder aplicarse.';
