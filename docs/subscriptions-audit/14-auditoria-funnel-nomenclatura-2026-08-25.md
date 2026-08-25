# 14 — Auditoría de funnel de conversión y nomenclatura (FASE 0 de esta iniciativa)

Fecha: 2026-08-25. Rama: `feature/subscriptions-integral`. Auditoría 100% read-only — no se modificó ningún archivo de código para producir este documento. Encargo original: revisión y mejora integral de conversión, suscripciones y nomenclatura de `alsinaar.com`.

**Hallazgo transversal más importante**: los documentos `00-executive-summary.md`, `10-access-decision-matrix.md` y `12-fase1-status.md` de esta misma carpeta (escritos el 2026-08-20) describen un estado **anterior y ya superado** del proyecto ("no hay Auth", "FASE 1 no aplicada"). El código actual ya tiene Supabase Auth funcionando en producción, cuentas, suscripciones, Mercado Pago real, cron de dunning/reconciliación y panel admin — confirmado por el propio historial de commits (`3e92cf7`, `fff9459`, `78f07c2`, etc.) y por lectura directa del código. `11-approved-decisions.md` (AD-01…AD-23) sigue vigente como fuente de decisiones de negocio y es la que se usa como referencia en esta auditoría.

---

## 1. Cómo funciona cada flujo hoy

### 1.1 Registro (alta Concejal) y login
Son el mismo mecanismo: no hay contraseña. `assets/js/auth.js` expone `AlsinaAuth.signInWithMagicLink(email, redirectPath)`, que llama a `supabase.auth.signInWithOtp()` (Supabase Auth real, `persistSession` en `localStorage`). Se dispara desde `planes.html` (alta Concejal o alta directa a plan pago) y desde `cuenta.html` (login gate). El alta de la fila de negocio (`profiles`+`accounts`+`subscriptions` en Concejal+`entitlements`+`email_preferences`) la crea un **trigger de Postgres** (`on_auth_user_created`, `supabase/migrations/20260821000000_fase2_auth_bootstrap.sql`) al crearse el usuario en `auth.users` — no hay endpoint `/api/` propio para esto.

### 1.2 Confirmación de email (magic link)
No hay callback backend: `assets/js/auth.js` usa `detectSessionInUrl: true`, así que el SDK de Supabase procesa el token en el navegador. El `redirectTo` por defecto es `/cuenta.html`; `planes.html` lo pisa a `/planes.html?autocheckout=<plan>` cuando el alta se originó al elegir un plan pago (para retomar el checkout). **Hoy no existe ningún estado de "recién confirmado"**: `cuenta.html` solo mira si hay sesión y pinta el panel normal, sea la primera vez o la enésima.

`api/confirm.js` es un sistema **completamente distinto y no relacionado**: solo confirma una fila en la tabla vieja `contacts` (newsletter), nunca toca `auth.users` ni `accounts`.

### 1.3 Suscripciones, checkout y Mercado Pago
Flujo vigente: `planes.html` → `POST /api/subscriptions/checkout` (`api/_lib/subscriptionHandlers/checkout.js`) → resuelve precio server-side desde `plans`/`plan_prices` (nunca acepta importe del navegador, AD-03) → `PreApproval.create()` de Mercado Pago con `external_reference: sub:{account_id}:{planSlug}:{price_id}` → guarda `provider_subscription_id` en la fila `subscriptions` de la cuenta → redirige a `checkoutUrl` (Mercado Pago). El pago real solo se confirma en `api/mercadopago-webhook.js`, con verificación de firma, tolerancia manual (bug conocido del SDK, documentado en el propio código) e idempotencia real vía tabla `payment_provider_events`. Solo Intendente y Gobernador pasan por acá; Concejal nunca llama a Mercado Pago.

**Existe un segundo sistema de checkout, viejo, en paralelo**: `api/checkout.js` + `assets/js/checkout.js`, con un único tipo de plan pago llamado `'pro'` y precio hardcodeado ($45.000). Sigue cargado en `index.html:943` y sigue siendo el que dispara `assets/js/gate.js` en varias páginas de informes (ver §3).

### 1.4 Permisos/capabilities y Monitor 135
`api/_lib/capabilities.js` centraliza qué puede ver cada cuenta (incluye lógica de "ver como" para `super_admin`). `api/monitor135/data.js` devuelve `access.level: 'none'|'basic'|'full'` según capacidad real — el JSON completo nunca llega al navegador de quien no tiene el plan. El frontend (`assets/js/monitor135-app.js`) ya tiene candados con textos "🔒 Intendente" e indicadores bloqueados por categoría para Concejal. **No hay ningún candado ni UI diferenciada para Gobernador** (ni exportación de datos expuesta en la interfaz, aunque el backend ya la bloquea en `data.js:76` con `requiere_plan_gobernador`).

### 1.5 Emails
Centralizados en `api/_lib/email.js`, con remitentes correctos y ya unificados (`newsletter@alsinaar.com` editorial, `info@alsinaar.com` transaccional — commit `5404e22`). Cubren: pago rechazado (día 0 y día 4, cron dunning), suspensión (día 5), recuperación de pago, upgrade, alta paga nueva, cancelación confirmada, baja administrativa. **No existe ningún email/cron de "checkout abandonado"** ni de "te falta confirmar tu cuenta". El alta gratuita Concejal no dispara ningún email de bienvenida hoy.

### 1.6 Cuenta, informes y productos
`cuenta.html` ya es bastante completo: plan actual, estado, precio, historial de pagos, upgrade/downgrade/cancelar, preferencia editorial. `informes.html` combina un catálogo (`assets/data/publications.js`, gating cosmético) con protección real server-side para PDFs/HTML sensibles. Los informes institucionales (Olavarría, Exaltación de la Cruz) usan un tercer mecanismo aparte (clave por hash), sin relación con planes. `productos.html` es catálogo de consultoría B2B, no usa nomenclatura de planes.

---

## 2. Archivos/endpoints involucrados (mapa rápido)

| Área | Archivos clave |
|---|---|
| Auth/sesión | `assets/js/auth.js`, `api/_lib/auth.js`, `supabase/migrations/20260821000000_fase2_auth_bootstrap.sql` |
| Cuenta | `cuenta.html`, `api/account.js` |
| Planes/checkout vigente | `planes.html`, `api/subscriptions/[action].js`, `api/_lib/subscriptionHandlers/*`, `api/_lib/plans.js` |
| Checkout legado ("Pro") | `api/checkout.js`, `assets/js/checkout.js`, `assets/js/gate.js`, `assets/js/analytics.js` |
| Mercado Pago | `api/mercadopago-webhook.js` |
| Monitor 135 | `municipios-data-hub.html`, `assets/js/monitor135-app.js`, `api/monitor135/data.js` |
| Informes | `informes.html`, `assets/js/informes-library.js`, `assets/data/publications.js`, `api/informe.js` |
| Home | `index.html` (hero L536-579, precios L752-806, consultoría L844-862, CTA final L901-918) |
| Newsletter viejo | `newsletter.html`, `api/subscribe.js`, `api/confirm.js` |
| Emails | `api/_lib/email.js`, `api/_lib/cronHandlers/dunning.js` |
| Cron | `api/cron/[job].js`, `vercel.json` (`dunning` 13:00 UTC, `reconcile` 14:00 UTC) |
| Datos | `supabase/migrations/*.sql` (`plans`, `plan_prices`, `subscriptions`, `payments`, `payment_provider_events`, `entitlements`, etc.) |

---

## 3. Inconsistencias de nomenclatura encontradas

1. **Sistema paralelo "Alsina Pro"**, vivo y cargado hoy en producción, en paralelo al sistema real (Concejal/Intendente/Gobernador):
   - `index.html:747` — "Incluidos sin límite en Alsina Pro."
   - `index.html:620` — "Ficha completa y descargas para suscriptores Pro." (contradice el resto de la home, que habla de "Intendente")
   - `index.html:943` — carga `assets/js/checkout.js`, que sigue posteando `type: 'pro'` a `api/checkout.js` (precio hardcodeado $45.000, sin relación con `plan_prices`)
   - `newsletter.html:586-608` — sección completa "Alsina Pro" con tarjeta de precio "Disponible próximamente"
   - `assets/js/gate.js:122-125` — soft-paywall de scroll en informes con "Seguí leyendo con Alsina Pro" / "Suscribirme a Pro →", incluido en `municipios-data-hub.html`, `alsina-pbg-pba.html`, `alsina-mapa-politico.html`, `alsina-recaudacion-tributaria-pba.html`, `alsina-nota-finanzas-pba.html`, `alsina-informe-super-rigi.html`
   - `assets/js/analytics.js:31-40` — eventos `pro_click` ligados a este sistema
2. **"Ministro" no migrado** en dos archivos activos (aunque el impacto real es solo un badge cosmético, no un bloqueo de acceso):
   - `assets/js/informes-library.js:15` — `PLAN_LABELS.ministro = 'Nivel Ministro'`
   - `assets/data/publications.js:150,169,188` — `requiredPlan: 'ministro'` en Balance fiscal 1S2026, Recaudación tributaria y Transferencias a municipios (deberían decir `'intendente'` según AD-01 y AD-18)
3. **CSS muerto de "Ministro"** en `index.html:277-338,368` (clases `.compare-th-ministro` etc., sin markup que las use — no afecta a usuarios, pero es ruido a limpiar).
4. **"Premium" usado de forma ambigua/como promesa de nivel** (no como adjetivo de contenido, que sí está permitido):
   - `index.html:577`, `newsletter.html:415,575,579-580,592`, `api/subscribe.js:129` — "pasa a premium" / "suscriptores premium" / "Próximamente premium" ligado al newsletter, sin relación con los 3 planes reales.
   - Usos correctos (a mantener): "informes premium" como adjetivo de contenido en `planes.html:196`, `index.html:797`.
5. **Fecha de corte "septiembre 2026" hardcodeada en al menos 5 lugares** (`index.html:577,914`; `newsletter.html:397,574-575`), sin fuente única, y ya vencida/por vencer sin que exista tal cambio de modelo real.
6. **Frase rígida "para siempre" / "precio final, fundador, para siempre"** en `index.html:757,764` y `planes.html:143`.
7. **Error de concordancia**: `index.html:844` — "de dónde salen los recursos y hacia dónde va" (debería ser "van"). Variante correcta ya usada en otro lado ("de dónde sale la plata y hacia dónde va la gestión" — singular "la plata", correcta) en `index.html:862` y `productos.html:411`.
8. **Dos altas paralelas para "Señal Alsina"**: el newsletter (`api/subscribe.js`, tabla `contacts`, sin Auth) y la cuenta Concejal (Supabase Auth) no están vinculados en código. La tarjeta de Concejal en `planes.html`/`index.html` promete "Señal Alsina" como beneficio incluido, pero técnicamente son dos sistemas de datos separados (no hay forma hoy de que alguien que ya es Concejal aparezca automáticamente en la lista de envío editorial vía `contacts`, ni viceversa).

---

## 4. Cambios que voy a realizar (propuesta para Fase 2)

### A. Home (punto 2 del pedido)
- Reemplazar el hero de `index.html` (L536-579): el formulario de email pasa de ser "Suscribirme gratis" (newsletter/`contacts`) a ser el disparador de alta Concejal real (`AlsinaAuth.signInWithMagicLink`), con copy "Crear tu cuenta gratis" / "Concejal — gratis, con Señal Alsina incluida". Se saca la promesa de fecha de septiembre y "pasa a premium".
- El link "Suscribirme" del nav y el footer apuntan al mismo flujo (ya sea ancla a `#precios` o directo al alta).
- CTA final (L901-918): mismo tratamiento, sin segundo formulario de newsletter independiente.
- No se toca la estructura visual del resto de la home.

### B. Confirmación → bienvenida (punto 1)
- Agregar parámetro `?welcome=1` al `redirectTo` cuando el alta es Concejal "pura" (no autocheckout).
- En `cuenta.html`, si `?welcome=1` y hay sesión activa, mostrar un banner/estado de bienvenida ("Ya sos parte de Alsina", plan actual, CTA a Monitor 135 + CTA a "Conocer Intendente y Gobernador") por encima del panel normal — sin bloquear el resto de la navegación ni el panel.
- No se crea página nueva ni se toca el mecanismo de Auth.

### C. Checkout/registro abandonado (punto 3)
- Nueva tabla aditiva `checkout_intents` (no se toca `subscriptions`, evitando repetir el bug ya corregido de escribir estado incompleto ahí): `account_id`, `email`, `plan_slug`, `provider_subscription_id`, `status` (`started`/`completed`/`reminder_sent`/`expired`), `checkout_started_at`, `checkout_completed_at`, `abandonment_email_sent_at`.
- Se inserta una fila al crear la `PreApproval` en `api/_lib/subscriptionHandlers/checkout.js` (mismo punto donde ya se guarda `provider_subscription_id`).
- Se marca `checkout_completed_at` desde el webhook cuando el pago de esa `external_reference` se aprueba.
- Nuevo job de cron (o extensión de `dunning.js`, a definir) que cada 24h busca `status='started'`, `checkout_started_at` > 24h, sin `checkout_completed_at`, **vuelve a verificar contra la API de Mercado Pago** que el preapproval no esté `authorized`, y si sigue sin completar, envía un único recordatorio y marca `abandonment_email_sent_at` (idempotente).
- Caso B del pedido (Concejal sin plan pago) — **no se trata como abandono**, no requiere cambios de datos.
- Caso A (dejó el mail, no confirmó) — hoy technically no aplica a Concejal (no hay paso de "confirmar" separado del magic link en sí: o entra, o no genera nada). Documentar esto como limitación real y, si se quiere um recordatorio para quien dejó el mail en el newsletter viejo sin confirmar, reutilizar `contacts.confirmed=false` (ya existe) en vez de crear algo nuevo.

### D. Nomenclatura (punto 4)
- Migrar `assets/data/publications.js` y `assets/js/informes-library.js` de `ministro` → `intendente`.
- Retirar CSS muerto `.compare-*-ministro` de `index.html`.
- Decomisionar el sistema "Alsina Pro": reescribir la sección de `newsletter.html` para que apunte a Concejal (sin nombre "Pro"), neutralizar `assets/js/gate.js` (cambiar copy a "Sumate a Alsina" sin nombre de plan específico, o redirigir a `/planes.html`), dejar de cargar `assets/js/checkout.js`/tipo `'pro'` desde `index.html` una vez confirmado que nada depende de él. **Esto no toca Mercado Pago real** porque `PAYMENTS_ENABLED=false` hoy y el flujo `'pro'` nunca fue el que usan Intendente/Gobernador.
- Corregir "premium" mal usado en `newsletter.html`/`index.html:577`/`api/subscribe.js:129`.
- Corregir `index.html:844` (concordancia "van").

### E. Precio fundador (punto 5)
- Sacar "para siempre"/"precio final, fundador, para siempre" del cuerpo principal de `index.html:757,764` y dejar el badge "Precio fundador" simple, moviendo el detalle a la FAQ de `planes.html:212` (que ya existe y es el lugar correcto).

### F. Tarjeta Intendente / Gobernador (puntos 6-7)
- Reescribir la tarjeta Intendente con estructura "Todo lo de Concejal, más:" + agregar explícitamente "1 informe premium por mes" **si la capability real ya lo sostiene** — a confirmar contra `resource_features`/`plan_features` antes de prometerlo (hoy Intendente no tiene informes premium listados como beneficio en `planes.html`, solo Gobernador los tiene vía "PBG Municipal, Un empleo cada 23 vecinos").
- Gobernador: agregar "Brief Gobernador mensual" y "Alertas y seguimiento de municipios" **solo como beneficios futuros/no operativos** (sin prometer funcionalidad activa), consistente con AD-21. Necesito tu confirmación de cómo mostrarlos (ver preguntas abajo).

### G. Información a medida (punto 8)
- Agregar bloque de menor jerarquía debajo de la sección de precios en `index.html`/`planes.html`, con CTA "Solicitar información a medida →". Reutilizar el mecanismo de contacto ya existente (mailto o `productos.html`, a confirmar cuál).

### H. Eventos (punto 12)
- No hay analytics propio más allá de `assets/js/analytics.js` (Plausible/similar liviano, ligado hoy al sistema Pro). Voy a dejarlo re-cableado a los eventos pedidos (`signup_started`, `signup_completed`, etc.) reusando el mismo mecanismo, sin instalar nada nuevo.

---

## 5. Riesgos detectados

1. **El sistema "Alsina Pro" es funcional hoy si `PAYMENTS_ENABLED` pasara a `true` sin que nadie lo revise**: cobraría $45.000 planos a cualquiera que entre por ese camino, con nombre "Alsina Pro", en paralelo al sistema real. Es un riesgo de negocio latente aunque hoy `PAYMENTS_ENABLED=false` lo mantiene inerte. Recomiendo decomisionarlo en esta misma pasada (punto D) en vez de dejarlo "por si acaso".
2. **`gate.js` está incluido en la propia página de Monitor 135** (`municipios-data-hub.html:302`) y en varias notas — al tocarlo hay que verificar cada página que lo carga para no romper el soft-paywall real que sí funciona hoy (captura de mail cuando `PAYMENTS_ENABLED=false`).
3. **Gobernador no tiene candados/UI de exportación en Monitor 135** — es una funcionalidad prometida en `planes.html` ("descarga y exportación de bases") que el backend ya protege pero el frontend no expone. No lo voy a construir en esta pasada salvo que me confirmes que sí, porque excede "puntos de conversión y nomenclatura" y entra en funcionalidad nueva de producto.
4. **Cron nuevo para recordatorio de abandono** corre en el mismo Vercel Hobby con límite de funciones/crons — hay que verificar que agregar un tercer cron (o extender uno existente) no choque con el límite ya mencionado en el propio código (`api/subscriptions/[action].js` explica por qué todo está en un solo router: límite de 12 functions en plan Hobby). Probablemente sea más seguro extender `dunning.js` en vez de crear `api/cron/checkout-abandonment.js` nuevo.
5. **No voy a tocar** `docs/subscriptions-audit/00,10,12` (quedan como documentación histórica) ni voy a aplicar ninguna migración contra Supabase remoto sin mostrarte antes el SQL exacto.

---

## 6. Preguntas antes de pasar a Fase 2

Ver mensaje en el chat — son 3 decisiones puntuales (bienvenida: banner vs. sección dedicada; Gobernador brief/alertas: cómo mostrarlas sin prometer de más; CTA de información a medida: a qué contacto conectarlo).
