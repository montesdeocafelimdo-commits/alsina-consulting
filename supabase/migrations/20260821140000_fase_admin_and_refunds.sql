-- ════════════════════════════════════════════════════
-- ALSINA — administración interna (AD-17) y reembolsos (AD-13)
-- ════════════════════════════════════════════════════

-- Seis usuarios administrativos: Felipe (super_admin, facultades
-- operativas completas) y cinco socios (partner, solo métricas
-- agregadas). No se precargan filas acá — cargar a mano una vez
-- confirmados los emails reales de los 6 (AD-23: verificación humana).
-- Vinculado a profiles (identidad de Supabase Auth), no a un email
-- suelto, para que MFA/verificación de sesión sea la misma de Auth.
create table if not exists admin_users (
  profile_id uuid primary key references profiles(id),
  role       text not null check (role in ('super_admin', 'partner')),
  label      text, -- "Felipe", "Socio" — nunca un dato personal de otro usuario
  created_at timestamptz default now()
);
comment on table admin_users is 'AD-17: 6 cuentas administrativas. super_admin = Felipe, facultades completas. partner = 5 socios, solo lectura de métricas agregadas — nunca nombres/emails/pagos/facturas/claves individuales.';

alter table admin_users enable row level security;
-- Sin políticas de lectura pública a propósito: solo el service role
-- (usado exclusivamente server-side vía api/_lib/adminAuth.js) puede
-- leer esta tabla. Ningún cliente la consulta directo.

-- Reembolsos (AD-13): una fila por reembolso procesado, idempotente por
-- provider_refund_id. amount NULL = reembolso total (el caso normal:
-- "devolución total" para cobro duplicado, importe incorrecto, cobro
-- posterior a una baja ya efectiva, arrepentimiento aplicable, o
-- imposibilidad comprobable de prestar el servicio — nunca parcial salvo
-- ajuste puntual documentado a mano).
create table if not exists refunds (
  id                  uuid primary key default gen_random_uuid(),
  payment_id          uuid not null references payments(id),
  account_id          uuid not null references accounts(id),
  provider_refund_id  text unique,
  amount              numeric,
  reason              text not null,
  status              text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  requested_by        uuid references profiles(id), -- admin que lo pidió; NULL si vino de un contracargo automático
  created_at          timestamptz default now(),
  processed_at        timestamptz
);
comment on table refunds is 'AD-13: todo reembolso se procesa desde backend, con idempotencia y auditoría — ver api/subscriptions/refund.js.';
create index if not exists idx_refunds_payment on refunds(payment_id);

alter table refunds enable row level security;
-- Mismo criterio que admin_users: sin políticas públicas, solo service role.
