# 05 — Análisis de brechas del modelo de datos

## Modelo actual completo (4 tablas, sin más)

```text
contacts        (id, email UNIQUE, source, confirmed, is_subscriber, confirmation_token, created_at)
unlocks          (id, email, resource, created_at) — UNIQUE(email, resource)
subscriptions    (id, email, plan, status DEFAULT 'inactive', started_at, created_at, mp_preapproval_id UNIQUE)
purchases        (id, email, resource, mp_payment_id UNIQUE, amount, status DEFAULT 'paid', created_at)
```

Fuente: [supabase-migration.sql](../../supabase-migration.sql), ejecutado acumulativamente a mano en el SQL Editor de Supabase (sin migraciones versionadas — ver 06).

## Contraste con el modelo orientativo de la FASE 1

| Tabla objetivo | Existe hoy | Brecha |
|---|---|---|
| `profiles` | No | No hay identidad de usuario en absoluto — no hay Auth. |
| `accounts` | No | No hay concepto de cuenta personal ni institucional. |
| `account_members` | No | No hay membresías. |
| `roles` / `member_roles` | No | No hay roles de ningún tipo (ni de organización, ni de equipo Alsina). |
| `plans` | No | Los 3 planes solo existen como copy en `assets/js/pricing.js`/`subscription-compare.js`, sin fila en base. |
| `plan_prices` | No | Precios hardcodeados en JS, sin historial ni versión. |
| `features` | No | No hay catálogo de capacidades. |
| `plan_features` | No | No hay relación plan↔capacidad. |
| `resources` | No | No hay catálogo de recursos (notas, informes, dashboards) con metadatos de qué capacidad los protege. |
| `resource_features` | No | Ídem. |
| `subscriptions` | **Parcial** | Existe una tabla con ese nombre, pero es plana (`email` de texto libre, sin cuenta, sin período, sin referencia a un plan versionado — `plan` es un string libre). |
| `subscription_periods` | No | No hay historial de períodos/ciclos de facturación. |
| `payments` | **Parcial, con otro nombre** | `purchases` cubre solo el caso de pago único de informe; los pagos recurrentes de "pro" no generan ninguna fila de pago individual, solo el estado agregado en `subscriptions`. No hay una tabla `payments` genérica que registre cada cobro (alta + cada renovación). |
| `payment_provider_events` | No | **Brecha crítica**: no hay ningún log crudo de los eventos que llegan del webhook. Si Mercado Pago reenvía un evento, o si hay que auditar qué pasó, no hay rastro más allá de los logs efímeros de la función serverless. |
| `entitlements` | No | No hay ninguna tabla que derive "qué puede ver esta cuenta hoy" a partir de su suscripción — coincide con el hallazgo de 03 de que nada lee `is_subscriber` para gating real. |
| `manual_access_grants` | No | No hay forma de otorgar acceso manual con vencimiento/motivo — todo acceso hoy es o público, o por clave estática de cliente. |
| `email_preferences` | No | No hay preferencias de email por usuario — no hay forma de darse de baja de lo editorial sin perder lo transaccional (aunque hoy tampoco hay envío editorial masivo real). |
| `email_outbox` | No | Los emails se mandan sincrónicamente dentro del request, sin cola ni reintentos (ver 04). |
| `email_events` | No | No hay tracking de entregas/rebotes/quejas (coincide con la ausencia de webhook de Resend en 01/04). |
| `invitations` | No | No hay invitaciones de ningún tipo. |
| `audit_logs` | No | No hay auditoría de ninguna acción administrativa — tampoco hay acciones administrativas, porque no hay panel admin. |

## Lo que sí puede evolucionar limpiamente (no reinventar)

Siguiendo la instrucción de no duplicar tablas si el modelo existente puede evolucionar:

- **`contacts`** es un buen punto de partida para el futuro `profiles`/lead-tracking, pero **no debe convertirse directamente en `profiles`** — mezclar "quien dejó el mail alguna vez" con "usuario autenticado" generaría filas huérfanas y conflictos de unicidad de email entre lead no verificado y cuenta real. Recomendación para FASE 1: mantener `contacts` como tabla de marketing/leads (o renombrar su rol a eso explícitamente) y crear `profiles` ligada a `auth.users` de Supabase, con una migración explícita de los `contacts.confirmed = true` existentes a invitaciones o pre-registro, **no automática**.
- **`unlocks`** puede seguir existiendo tal cual para el caso de "desbloqueo gratuito puntual" (no ligado a plan), pero no reemplaza a `entitlements` — son conceptos distintos (un `unlock` es un otorgamiento ad-hoc por recurso; un `entitlement` se deriva de una suscripción activa y su plan).
- **`purchases`** puede evolucionar a ser la tabla `payments` de pago único, siempre que se generalice para incluir también los cobros recurrentes de una suscripción (hoy los cobros de `PreApproval` no generan ninguna fila individual — la brecha de `payment_provider_events`/`payments` para pagos recurrentes es total).
- **`subscriptions`** necesita una migración de esquema no trivial: agregar `account_id`, `plan_id` (FK versionado, no string libre), `status` con un `CHECK`/enum acotado a los estados normalizados del prompt maestro (`incomplete`, `pending`, `trialing`, `active`, `past_due`, `grace_period`, `suspended`, `cancel_at_period_end`, `canceled`, `refunded`, `disputed`), y separar el período de facturación en `subscription_periods`.

## Decisión que no se puede tomar sola en esta auditoría

Qué hacer con las filas ya existentes en `contacts`/`unlocks`/`subscriptions`/`purchases` (si las hay en la base real — no se pudo verificar el volumen, ver 01) es una decisión de producto y de datos, no una decisión técnica: ¿se migran a cuentas nuevas automáticamente por email, se les pide que se registren de nuevo, conviven ambos sistemas un tiempo? Queda marcada en [08-decisions-required.md](08-decisions-required.md).
