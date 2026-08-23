-- ════════════════════════════════════════════════════
-- ALSINA — "ver el sitio como" para super_admin (AD-17)
--
-- Nunca toca la suscripción real ni la facturación — es puramente una
-- sustitución de qué entitlements se le resuelven a ESE admin al
-- navegar, para poder probar la experiencia de cada plan sin pagar ni
-- arriesgar su propio estado real. Ver api/_lib/capabilities.js.
-- ════════════════════════════════════════════════════

alter table admin_users
  add column if not exists view_as_plan text check (view_as_plan in ('concejal', 'intendente', 'gobernador'));

comment on column admin_users.view_as_plan is 'Solo super_admin. NULL = ve su plan real (default). Si está seteado, getEntitlements() le devuelve los entitlements de ESE plan en vez de los de su suscripción real — nunca cambia subscriptions ni cobra nada.';
