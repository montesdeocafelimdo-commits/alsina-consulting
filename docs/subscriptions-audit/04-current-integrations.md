# 04 — Integraciones actuales

## Supabase (`@supabase/supabase-js@^2.45.0`)

- **Uso**: exclusivamente como cliente Postgres server-side vía `service_role`, en los 5 endpoints de `/api` que tocan datos (`checkout`, `confirm`, `subscribe`, `unlock`, `webhook`).
- **No se usa** Auth, Storage, Realtime, ni RPC/funciones de Postgres — es "Supabase como Postgres administrado", nada más.
- **Nivel de madurez por servicio** (según la escala pedida):
  - Configuración presente: parcial (variables documentadas, no confirmadas en Vercel real).
  - Conexión autenticada: NO VERIFICADO desde este entorno.
  - Operación de prueba exitosa: NO VERIFICADO.
  - Producción validada: NO VERIFICADO.

## Resend (`resend@^4.0.0`)

- **Uso**: envío puntual de 3 tipos de email, todos disparados sincrónicamente dentro del handler HTTP que los origina (sin cola, sin reintentos, sin outbox):
  1. Confirmación de suscripción al newsletter (`api/subscribe.js`).
  2. Confirmación de compra de informe (`api/webhook.js`, dentro del branch `type === 'payment'`).
  3. Bienvenida a Alsina Pro (`api/webhook.js`, dentro del branch `type === 'subscription_preapproval'`, solo si `status === 'active'`).
- Si `resend.emails.send()` falla, en `subscribe.js` el error se loguea pero **la respuesta HTTP sigue devolviendo `200 { status: 'ok' }`** ([api/subscribe.js:65-67](../../api/subscribe.js#L65-L67)) — el usuario cree que el mail salió aunque haya fallado, y no hay outbox que lo reintente. En `webhook.js` un fallo de Resend dentro del `try` haría caer todo el handler al `catch` genérico y devolver `500` — lo que en el mundo de Mercado Pago dispara un reintento del webhook completo (razonable para el pago, pero no hay forma de saber si el error fue de Supabase o de Resend a partir del log genérico `console.error('Webhook error:', err)`).
- No hay plantillas versionadas fuera de HTML inline embebido en cada archivo; no hay deduplicación explícita de envíos (ver el hallazgo de reenvío ante webhook duplicado en 06).
- No hay integración con Resend Audiences/Broadcasts ni webhooks de Resend — confirmado AUSENTE en 01.

## Mercado Pago (`mercadopago@^3.2.0`, SDK oficial)

- **Producto usado**: `Preference` (Checkout Pro) para pago único de informes; `PreApproval` para "suscripción mensual autorizada" (no débito por CBU — terminología correcta según la restricción del prompt maestro).
- **Verificación de webhook**: usa `WebhookSignatureValidator` del SDK oficial contra el header `x-signature`, con tolerancia de 300 segundos — implementación correcta cuando el secreto está presente, pero **falla abierto si no lo está** (ver hallazgo bloqueante en 06).
- **No confía ciegamente en el payload**: ante cada notificación, vuelve a pedir la entidad real a la API de MP (`GET /v1/payments/:id` o `GET /preapproval/:id`) antes de escribir en base — esto es exactamente lo que pide el prompt maestro (paso 6 del flujo seguro) y está bien resuelto.
- **No usa Plan IDs de Mercado Pago** — cada `PreApproval` se crea "suelto" con `transaction_amount` fijo por request, no contra un plan preexistente en el panel de MP. Esto simplifica el código actual pero significa que **no hay ningún lugar en Mercado Pago que sea la fuente de verdad de "qué cuesta Ministro"** — todo vive en el `PRICES` hardcodeado del propio `api/checkout.js`.
- **Nivel de madurez**: configuración presente en código, apagada por flag; conexión autenticada NO VERIFICADO; operación de prueba NO VERIFICADO; webhook verificado PARCIALMENTE (el mecanismo existe pero no se puede confirmar que el secreto esté cargado); producción NO VALIDADA (y no debe estarlo — pagos siguen apagados por defecto).

## Vercel

- **Uso**: hosting estático + Serverless Functions (`/api/*.js`, runtime Node.js por convención de Vercel para archivos `.js` en `/api` sin `edge` config explícito) + Middleware (`middleware.js`, Edge Runtime por defecto de Next-style middleware en Vercel).
- `vercel.json` declara únicamente headers CORS abiertos (`Access-Control-Allow-Origin: *`) para todo `/api/*` y el empaquetado de `private/**` junto a `api/informe.js` ([vercel.json](../../vercel.json)).
- **CORS abierto a cualquier origen en todos los endpoints POST** (`subscribe`, `unlock`, `checkout`, `informe`) — no es necesariamente un problema si estos endpoints ya validan email/clave por sí mismos y no dependen de cookies de sesión (no las hay), pero **facilita abuso/spam automatizado** contra `/api/subscribe` y `/api/checkout` desde cualquier sitio, sin ningún rate limiting. Ver hallazgo en 06.

## Otras integraciones detectadas (fuera del alcance de pagos, mencionadas para contexto)

- **Plausible Analytics** (`assets/js/analytics.js`) — analítica de producto sin cookies, cargada de forma diferida/segura por diseño del propio script; no maneja PII, sin relación con el sistema de pagos.
- **Dos apps Next.js exportadas como HTML estático** (`radar-fiscal-app/` → `radar-fiscal/`, `super-rigi-app/` → `super-rigi/`) — sin backend propio, sin auth, sin variables de entorno de servidor; consumen datos ya embebidos en el build. No integran con Supabase/Resend/Mercado Pago.

## Resumen de madurez por integración (según la escala pedida por el prompt maestro)

| Integración | Config. presente | Conexión autenticada | Operación de prueba | Webhook verificado | E2E exitoso | Listo para prod | Prod validada |
|---|---|---|---|---|---|---|---|
| Supabase | Parcial | NO VERIFICADO | NO VERIFICADO | N/A | No | No | No |
| Resend transaccional | Parcial | NO VERIFICADO | NO VERIFICADO | N/A (no hay webhook de Resend) | No | No | No |
| Resend Marketing | Ausente | N/A | N/A | N/A | No | No | No |
| Mercado Pago | Presente en código, apagado por flag | NO VERIFICADO | NO VERIFICADO | Parcial (falla abierto sin secreto) | No | No | No (correctamente) |
| Vercel | Presente | N/A | N/A | N/A | N/A | REQUIERE VERIFICACIÓN HUMANA (plan) | REQUIERE VERIFICACIÓN HUMANA |

Ninguna integración puede marcarse "lista" hoy más allá de "código escrito, apagado por defecto" — coincide con la postura conservadora que ya tiene el propio repositorio.
