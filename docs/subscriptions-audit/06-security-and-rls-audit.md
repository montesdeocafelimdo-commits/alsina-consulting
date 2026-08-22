# 06 — Auditoría de seguridad y RLS

## RLS (Row Level Security)

Las 4 tablas existentes tienen RLS habilitado ([supabase-migration.sql:43-45](../../supabase-migration.sql#L43-L45), [supabase-migration.sql:88](../../supabase-migration.sql#L88)):

| Tabla | Política `anon` | Evaluación |
|---|---|---|
| `contacts` | `INSERT` permitido, con `WITH CHECK` de regex de email | VERIFICADO en el script — correcto para el caso de uso (captura de leads anónima). No hay `SELECT`/`UPDATE`/`DELETE` para `anon`, así que un lead no puede leer ni pisar los datos de otro. |
| `unlocks` | `INSERT` permitido, mismo patrón | VERIFICADO — correcto. |
| `subscriptions` | Ninguna política para `anon` | VERIFICADO — correcto: solo `service_role` puede tocar esta tabla, coincide con el comentario del propio script ([supabase-migration.sql:59](../../supabase-migration.sql#L59)). |
| `purchases` | Ninguna política para `anon` | VERIFICADO — correcto, con el mismo comentario explícito en el script ([supabase-migration.sql:89-90](../../supabase-migration.sql#L89-L90)). |

**No hay tests de RLS** (ni de ningún otro tipo) en el repo — no se puede confirmar automatizadamente que estas políticas se comporten como se espera ante casos borde (por ejemplo, un `email` con mayúsculas que rompa la regex, o un intento de `UPSERT` con `ON CONFLICT` que dependa de una política de `UPDATE` inexistente — a confirmar: los `upsert(...).onConflict(...)` de `api/checkout.js`/`api/unlock.js`/`api/webhook.js` corren todos con `service_role`, así que no dependen de la política de `anon`, pero vale la pena una prueba explícita en FASE 1).

**No se pudo verificar el estado real de RLS en la base remota** (solo el script declarado) — confirmar en Supabase Dashboard → **Authentication → Policies** que coincide exactamente con `supabase-migration.sql`.

## Autorización del lado del servidor

- Todos los endpoints que escriben en Supabase lo hacen con `service_role` desde `/api/*.js` — nunca se expone `service_role` al cliente. VERIFICADO.
- **No hay ninguna verificación de "quién sos"** en ningún endpoint más allá de "¿el email tiene forma de email?" — no hay autenticación, así que no hay nada que autorizar en el sentido estricto (no hay sesión que pudiera estar mal autorizada). Esto es consistente con el hallazgo de 03: el sistema no tiene usuarios, tiene leads.

## Hallazgo BLOQUEANTE: verificación de firma de webhook falla abierta

`api/webhook.js:12-17`:

```js
function verifySignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('MP_WEBHOOK_SECRET no configurado — firma no verificada');
    return true;
  }
  ...
```

Si `MP_WEBHOOK_SECRET` no está configurado en el entorno donde corre la función, **cualquiera puede mandar un POST a `/api/webhook` simulando una notificación de Mercado Pago**, y el código lo procesará: hará el `fetch` a `api.mercadopago.com/v1/payments/:id` con el `dataId` que el atacante haya puesto en el body/query. Como ese `fetch` sí requiere un `MP_ACCESS_TOKEN` válido para responder, **el impacto real depende de si hay un pago o `preapproval` real con ese ID accesible a esa cuenta** — no es una vulnerabilidad de "cualquiera se auto-otorga acceso gratis" mientras `MP_ACCESS_TOKEN` no esté configurado (el propio código corta antes, `api/webhook.js:49-53`), pero si `MP_ACCESS_TOKEN` sí está configurado y `MP_WEBHOOK_SECRET` no, un atacante que conozca o adivine un `dataId` de pago/preapproval real (por ejemplo el propio, de una compra legítima que hizo) podría forzar reprocesamiento repetido de ese evento sin que Mercado Pago lo haya enviado.

**Clasificación**: aceptable como comportamiento explícito de desarrollo (está comentado y es intencional para "no romper mientras se activa" — README-PAGOS.md documenta este mismo comportamiento como señal esperada), pero **debe convertirse en fallo cerrado antes de activar `PAYMENTS_ENABLED=true` en producción**: si el entorno es de producción y falta el secreto, el webhook debería rechazar (`401`/`500`) en lugar de aceptar. Ver recomendación en 09.

## Hallazgo: reenvío de mail ante evento duplicado/reintentado

`api/webhook.js` hace `upsert(..., { onConflict: 'mp_payment_id' })` / `{ onConflict: 'mp_preapproval_id' }` y **luego, incondicionalmente, envía el mail de confirmación** dentro del mismo bloque, sin verificar si el `upsert` fue un `INSERT` real o un `UPDATE` sobre una fila que ya existía con el mismo estado. Mercado Pago puede reenviar notificaciones (reintentos por timeout, entregas duplicadas) — cada reenvío de un pago ya aprobado volvería a mandar el mail "Tu informe está listo" o "Bienvenido a Alsina Pro". No es un problema de seguridad, pero sí de experiencia y de confiabilidad — y contradice el requisito explícito del prompt maestro de **procesamiento idempotente** de eventos. La ausencia de `payment_provider_events` (ver 05) es la causa raíz: sin loguear el evento crudo antes de procesarlo, no hay forma de detectar "ya vi este evento".

## CORS abierto y ausencia de rate limiting

Todos los endpoints POST devuelven `Access-Control-Allow-Origin: *` ([vercel.json:4-9](../../vercel.json#L4-L9), replicado también manualmente en cada handler). Combinado con la ausencia total de rate limiting, esto deja `/api/subscribe`, `/api/unlock` y `/api/checkout` (rama waitlist) expuestos a spam/abuso automatizado desde cualquier origen — pueden usarse para floodear la tabla `contacts` o para disparar el envío de emails de confirmación hacia direcciones ajenas (el atacante no recibe nada útil, pero la víctima sí recibe spam de "Confirmá tu suscripción"). Ninguno de estos endpoints tiene CAPTCHA, límite de intentos por IP, ni verificación de origen. Es un hallazgo real, aunque de severidad moderada dado el tipo de dato involucrado (no hay información sensible en juego todavía). El prompt maestro pide explícitamente rate limiting en Auth, checkout y endpoints sensibles — hoy no existe en ninguno.

## Secretos y logs

- No se encontró ningún secreto hardcodeado en el código fuente (`MP_ACCESS_TOKEN`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` se leen siempre de `process.env`).
- `.env.example` contiene únicamente placeholders (`xxxxxxxxxxxx`, `eyJxxxx...`) y **dos hashes SHA-256** de las claves de acceso de los informes de clientes ([.env.example:29-30](../../.env.example#L29-L30)) — son hashes, no las claves en texto plano, y ya están commiteados en el repo (no es un hallazgo nuevo de esta auditoría, es preexistente). El propio `.env.example` documenta que esas son claves placeholder (`"olavarria-2026"`/`"exaltacion-2026"`) que **deben rotarse antes de producción** — no se verificó si ya se rotaron.
- Los `console.error`/`console.warn` del código no imprimen tokens ni claves — imprimen mensajes descriptivos y, en algunos casos, el email o el `external_reference` (dato personal pero no un secreto de autenticación). Aceptable, aunque conviene revisar en FASE 1 si esos logs deben sanitizarse más (el prompt maestro pide "logs sanitizados" explícitamente) antes de escalar el volumen de eventos.
- **Nota fuera de alcance pero relevante**: el remote de git tiene un token de GitHub embebido en la URL (ver 01) — no es parte del sistema de pagos, se señala para que el usuario lo evalúe.

## MFA, least privilege, backups — no aplican todavía

No hay ningún panel administrativo ni cuenta de equipo Alsina en el sistema, así que MFA para cuentas administrativas y políticas de *least privilege* internas no tienen aún dónde aplicarse — quedan como requisito de diseño para FASE 2/7, no como hallazgo de algo mal hecho hoy. Backups de Supabase: REQUIERE VERIFICACIÓN HUMANA (ver 01).

## Resumen de clasificación de hallazgos de esta sección

| Hallazgo | Clasificación |
|---|---|
| RLS habilitado y coherente con el diseño actual | VERIFICADO (en script; NO VERIFICADO en base remota) |
| Webhook falla abierto sin `MP_WEBHOOK_SECRET` | BLOQUEANTE (antes de producción) |
| Falta de idempotencia real (reenvío de mail en duplicados) | BLOQUEANTE (antes de producción, si se activa `PAYMENTS_ENABLED`) |
| CORS abierto + sin rate limiting | AUSENTE (mitigación pendiente, severidad moderada hoy) |
| Sin `payment_provider_events` / auditoría de eventos | AUSENTE |
| Secretos fuera del código fuente | VERIFICADO |
| MFA / least privilege interno | No aplica todavía (no hay panel admin) |
