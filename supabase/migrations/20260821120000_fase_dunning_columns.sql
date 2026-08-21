-- ════════════════════════════════════════════════════
-- ALSINA — columna de idempotencia para el segundo aviso de gracia (AD-10)
--
-- grace_started_at (fase 1) ya marca el día 0. Falta una marca separada
-- para el aviso del día 4 — sin ella, un cron que corre más de una vez
-- por día (o se reintenta) podría reenviar el mismo aviso. "Un webhook
-- duplicado... no reinicia la gracia ni duplica emails" (AD-10).
-- ════════════════════════════════════════════════════

alter table subscriptions
  add column if not exists grace_notice_final_sent_at timestamptz;

comment on column subscriptions.grace_notice_final_sent_at is
  'AD-10: se completa cuando se envía el segundo/último aviso (día 4). NULL = todavía no se envió. Junto con grace_started_at, evita duplicar los 2 avisos permitidos.';
