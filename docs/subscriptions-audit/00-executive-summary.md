# 00 — Resumen ejecutivo (FASE 0, auditoría read-only)

Fecha de auditoría: 2026-08-20. Rama: `main` (único branch local, tracking `origin/main`). Auditoría 100% read-only: no se ejecutó ninguna migración, ningún `db push`, ningún deploy, ninguna escritura en Supabase/Vercel/Mercado Pago/Resend, ni se creó ni modificó ningún recurso externo.

## Qué es hoy este repositorio

`alsinaar.com` es un sitio **HTML estático servido por Vercel**, sin framework ni build step para las páginas principales (`package.json` no declara ningún `scripts` — [package.json](../../package.json)), con un puñado de **Vercel Serverless Functions** en `/api/*` (Node 20) que hablan con **Supabase** (Postgres + RLS, sin Auth) y **Resend** (solo transaccional). Hay una integración de **Mercado Pago** completa en código pero **apagada por defecto** (`PAYMENTS_ENABLED`). Dos apps Next.js (`radar-fiscal-app/`, `super-rigi-app/`) se exportan como HTML estático (`radar-fiscal/`, `super-rigi/`) y no están en git (gitignoradas); no tienen auth ni lógica de servidor.

**No existe ningún sistema de identidad, cuentas, membresías, roles ni suscripciones tal como los define el prompt maestro.** Todo el backend actual gira en torno a un email suelto (`contacts`, `unlocks`, `subscriptions`, `purchases`), sin login, sin sesión, sin `profiles`/`accounts`/`account_members`. Esto no es una implementación parcial del modelo objetivo: es una capa de captación de leads + paywall binario (gratis/Pro) que hay que reemplazar, no completar, para llegar al modelo de 3 planes jerárquicos (Intendente/Ministro/Gobernador) con cuentas institucionales.

## Hallazgo bloqueante más importante

El frontend ya vende **3 planes** (Intendente / Ministro / Gobernador) en la tabla comparativa de `index.html#precios` ([assets/js/subscription-compare.js](../../assets/js/subscription-compare.js)), con precios distintos por plan en [assets/js/pricing.js](../../assets/js/pricing.js) (`intendenteMensual: 'Gratis'`, `ministroMensual: '$25.000'`, `gobernadorMensual: '$45.000'`). Pero el backend de cobro (`api/checkout.js`) **solo entiende dos tipos, `informe` y `pro`, con un precio único hardcodeado** `PRICES.pro = 45000` ([api/checkout.js:5-8](../../api/checkout.js#L5-L8)). Los tres botones de la tabla comparativa mandan `type: 'pro'` sin importar el plan elegido ([assets/js/subscription-compare.js:96-101](../../assets/js/subscription-compare.js#L96-L101)). **Si se activara `PAYMENTS_ENABLED=true` hoy tal cual está el código, elegir "Intendente" (marketeado como gratis) o "Ministro" ($25.000) cobraría igual $45.000/mes vía Mercado Pago.** Ver detalle en [08-decisions-required.md](08-decisions-required.md) y [09-implementation-plan.md](09-implementation-plan.md). Clasificación: **BLOQUEANTE**.

## Lo que ya está bien encaminado y se puede conservar

- El flujo de activación de pagos es prudente por diseño: mientras `PAYMENTS_ENABLED` no sea `true`, nunca se llama a la API de Mercado Pago ([api/checkout.js:45-53](../../api/checkout.js#L45-L53)).
- La URL de retorno de Mercado Pago **nunca otorga acceso**; solo el webhook, tras traer la entidad real desde la API de MP (no confía en el payload crudo), escribe en `purchases`/`subscriptions` ([api/webhook.js:58-134](../../api/webhook.js#L58-L134)). Esto ya cumple el principio de seguridad más importante del prompt maestro.
- El patrón de contenido protegido de los informes de clientes (Olavarría, Exaltación de la Cruz) es sólido: archivo fuera de `/private/`, bloqueado a nivel estático por `middleware.js`, servido solo vía `/api/informe.js` con hash SHA-256 + comparación *timing-safe*, `Cache-Control: no-store`, `X-Robots-Tag: noindex` ([middleware.js](../../middleware.js), [api/informe.js](../../api/informe.js)). Es un buen punto de partida conceptual para la FASE 5, aunque su modelo de "una clave estática por cliente" no escala directo a entitlements por cuenta/plan.
- RLS está habilitado en las 4 tablas existentes, con políticas de `INSERT` anónimo acotadas por regex de email y sin ningún `SELECT`/`UPDATE`/`DELETE` expuesto a `anon` ([supabase-migration.sql](../../supabase-migration.sql)).

## Bloqueantes y ausencias mayores (detalle en 08-decisions-required.md)

1. **No hay identidad de usuario** (sin Supabase Auth, sin login, sin sesión) — todo el modelo de cuentas/membresías/roles de la FASE 1-2 se construye desde cero.
2. **Precio por plan no está implementado en el backend de cobro** (ver arriba) — bloqueante de negocio, no solo técnico.
3. **Webhook de Mercado Pago "abre" si falta el secreto**: sin `MP_WEBHOOK_SECRET` configurado, deja pasar la notificación sin verificar firma, con un `console.warn` como única señal ([api/webhook.js:12-17](../../api/webhook.js#L12-L17)). Aceptable como default de desarrollo declarado explícitamente en el propio código, pero **debe fallar cerrado en producción**, no solo advertir.
4. **No hay tabla/registro de eventos del proveedor de pago** (`payment_provider_events` no existe) ni protección explícita contra webhooks duplicados más allá del `upsert` con `onConflict` — y el envío de mail de confirmación no está gateado por "es la primera vez que se aprueba", por lo que un reintento de MP sobre el mismo evento podría reenviar el mail.
5. **No hay Resend webhook** (rebotes, quejas, bajas) ni distinción de audiencias/Broadcasts — solo envío transaccional directo por API.
6. **Sin migraciones versionadas ni CLI de Supabase enlazado**: existe un único `supabase-migration.sql` acumulativo, corrido a mano en el SQL Editor. No hay carpeta `supabase/` ni forma de diffear local vs. remoto desde este entorno.
7. **Sin CI**: no hay `.github/workflows`, no hay lint/typecheck/test configurados en `package.json` (no tiene bloque `scripts`), no hay tests de ningún tipo en el repo.
8. **Vercel/Supabase/Resend/Mercado Pago no pudieron verificarse desde este entorno**: no hay CLI de Vercel, Supabase ni GitHub instaladas, y el acceso a la configuración global de credenciales (`~/.vercel/config.json`) fue bloqueado por el clasificador de permisos del propio entorno (correctamente, por seguridad) — ver [01-account-and-environment-matrix.md](01-account-and-environment-matrix.md) para la lista exacta de qué falta verificar a mano y dónde.
9. **Variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` documentada pero sin uso detectado** en ningún archivo del repo (ni frontend ni `/api`) — posible resabio de una integración client-side de Supabase que nunca se implementó, o preparación a futuro sin marcar como tal.

## Riesgo de calendario (no es una decisión técnica, es un hallazgo de contenido)

`newsletter.html` ya anuncia una fecha: *"Desde septiembre de 2026 la Señal Alsina pasa a ser exclusiva de suscriptores premium"* ([newsletter.html:575](../../newsletter.html#L575)). Hoy es 2026-08-20. Si esa fecha es real y sigue en pie, el margen para construir identidad, cuentas, planes correctos y cobro recurrente antes de cerrar el acceso gratis es de días, no de las semanas/meses que implica el alcance completo del prompt maestro. Esto es una decisión de negocio (marcada en [08-decisions-required.md](08-decisions-required.md)), no algo que se resuelva con código.

## Fases propuestas y orden

Ver desarrollo completo en [09-implementation-plan.md](09-implementation-plan.md). Orden recomendado, dado que hoy no hay nada de identidad: FASE 1 (fundaciones/modelo de datos) → FASE 2 (Auth/cuentas/permisos) → FASE 3 (`MockPaymentProvider` + normalización de eventos) → FASE 4 (Mercado Pago real, incluida la corrección del bug de precios por plan) → FASE 5 (contenidos protegidos por entitlement) → FASE 6 (Resend completo) → FASE 7 (paneles) → FASE 8 (automatizaciones). No se recomienda saltar fases: el gap de identidad hace que cualquier trabajo de pagos "real" antes de FASE 2 quede sin dueño (¿pago de quién, en qué cuenta?).

## Riesgos (no estimo tiempos ficticios)

- **Riesgo de negocio**: si septiembre 2026 es una fecha comunicada externamente, hay tensión directa con la regla de "no desplegar a producción sin aprobación" y con la profundidad real del alcance pedido.
- **Riesgo de datos**: migrar de "email suelto" a "cuenta + membresía" requiere decidir qué pasa con los `contacts`/`unlocks`/`purchases`/`subscriptions` existentes (¿se migran, conviven, se archivan?) — no asumido, queda en decisiones pendientes.
- **Riesgo de verificación externa**: una parte importante de la FASE 0 (planes reales contratados en Vercel/Supabase/Resend, estado real de la app de Mercado Pago) no pudo confirmarse desde este entorno y depende de que el usuario copie/pegue datos de los paneles — ver checklist exacto en cada documento.
- **Riesgo de seguridad ya presente en código**: el webhook "abre" sin secreto configurado (ver punto 3) — bajo mientras el sitio esté en modo waitlist, pero debe corregirse antes de activar `PAYMENTS_ENABLED=true` en producción.

## Próximo paso

Este documento y los diez que lo acompañan son el cierre de la FASE 0. **No se implementó nada de la FASE 1 en adelante.** Quedo a la espera de aprobación explícita para arrancar, y de las decisiones marcadas como pendientes en [08-decisions-required.md](08-decisions-required.md) — en particular la del punto de precios por plan, que es un blocker de cualquier checkout real, y la de la fecha de septiembre.
