# 12 — Estado de FASE 1 (implementación entregada, no aplicada ni verificada en vivo)

Rama: `feature/subscriptions-fase1` (no `main`). Aprobación recibida: `APROBAR FASE 1`, con las condiciones que fijaste en ese mensaje. Este documento es el reporte honesto de qué se hizo, qué no se pudo hacer desde este entorno, y por qué me detengo acá en vez de continuar automáticamente con las fases siguientes.

## Qué se implementó

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20260820210041_fase1_foundations.sql` | Esquema completo de FASE 1: `plans`, `plan_prices` (versionado, fundador, disponibilidad), `features`/`plan_features`/`resources`/`resource_features` (catálogo de capacidades, AD-22), `profiles`, `accounts` (1:1, AD-06), `subscriptions`/`subscription_periods` (estados normalizados de AD-10 a AD-13), `payments`, `payment_provider_events` (idempotencia real, AD-07 — hoy no existe nada equivalente), `invoices` (AD-08), `entitlements`, `manual_access_grants`, `email_preferences`/`email_outbox`/`email_events`, `audit_logs`. RLS habilitado en las 19 tablas nuevas, con políticas de lectura pública solo en catálogos y lectura acotada al dueño en todo lo demás — sin ninguna escritura de cliente en ninguna tabla nueva. Incluye el seed de catálogo (3 planes, precios de fundador, 12 capacidades, su asignación por plan según AD-19/AD-22, y el catálogo de recursos de `10-access-decision-matrix.md`). Es **aditiva**: no toca `contacts`/`unlocks`/`subscriptions` (la tabla vieja)/`purchases`. |
| `supabase/rollbacks/20260820210041_fase1_foundations_rollback.sql` | Rollback manual documentado — no se ejecuta automáticamente (el CLI de Supabase no tiene "down migrations"). Seguro de correr mientras no haya datos reales de negocio en las tablas nuevas; con advertencia explícita si ya los hay. |
| `supabase/seeds/dev-seed.sql` | Seed de desarrollo (3 cuentas ficticias, una por plan, con datos de ejemplo de suscripción/estado). Sin ningún dato real. Requiere 3 usuarios de `auth.users` ya creados — no crea usuarios de Auth por SQL. |
| `tests/rls-fase1.test.js` | 5 tests de RLS con `node --test` (sin dependencias nuevas — usa el test runner nativo de Node 20+). Cubren: lectura pública de `plans`, denegación de lectura anónima en `subscriptions`/`payment_provider_events`/`audit_logs`, y una regla de negocio (`plan_prices`: nunca dos precios "disponibles para altas" simultáneos del mismo plan). |
| `package.json` | Se agregó `"scripts": { "test": ... }` — antes no existía ningún script de test en el repo. |

## Qué se corrió realmente en este entorno

- `npm test` — **corre y termina limpio**: 5 tests, 0 pass, 0 fail, **5 skipped**. No hay `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` de ningún proyecto real en este entorno, así que cada test se salta explícitamente con un mensaje que dice por qué — ningún test "pasó" en el sentido de haber verificado algo contra una base real.
- Nada más se ejecutó contra ningún sistema externo.

## Qué NO se pudo hacer desde este entorno (y por qué)

Esto no son "verificaciones humanas de negocio" (esas ya están resueltas o catalogadas en `10-production-readiness-checklist.md`) — son límites de herramientas de este entorno específico, ya señalados desde la auditoría de FASE 0:

1. **No hay CLI de Supabase instalada ni autenticada** (`supabase` → `command not found`) — no pude correr `supabase db push`, `supabase migration up`, ni ningún comando contra el proyecto real.
2. **No hay `psql` ni `docker`** en este entorno — ni siquiera pude validar la sintaxis de la migración contra un Postgres local. El SQL está escrito siguiendo el mismo estilo que `supabase-migration.sql` (que sí corrió contra la base real, según `SETUP.md`), pero **no está verificado sintácticamente**.
3. **No verifiqué el backup de Supabase** — condición explícita tuya (#3) antes de aplicar cualquier cambio remoto. No lo verifiqué porque no apliqué ningún cambio remoto — no había forma de hacerlo desde acá.
4. **No hay CLI de Vercel autenticada** — no desplegué nada a Preview ni a Production. No hay ningún endpoint nuevo en `/api` en este commit (el webhook de Mercado Pago es trabajo de FASE 3/4, posterior a esto).
5. **Los 5 tests de RLS están escritos pero no ejecutados contra una base real** — ver arriba.

Esto coincide, punto por punto, con tu condición de detenerme #11: *"Detenete solamente ante credenciales faltantes, login/2FA, falta de backup o una operación irreversible no contemplada."* No tengo las credenciales/CLI necesarias para el siguiente paso (aplicar la migración), así que me detengo acá en vez de simular que se aplicó.

## Por qué no continúo automáticamente con FASE 2 en adelante

Tu condición #5 decía: *"Una vez aprobados automáticamente los tests de FASE 1, continuá sin pedirme nuevas aprobaciones."* Los tests **no se aprobaron** — se salteron, que es distinto. No hay una base de desarrollo real contra la cual correrlos desde este entorno. Como esa condición no se cumplió, no doy por completada la FASE 1 en el sentido operativo (esquema aplicado y verificado) y no avanzo a construir FASE 2 (Auth/cuentas) sobre un esquema que nadie confirmó que se puede aplicar sin errores.

## Rama y estado de git

Todo el trabajo está en la rama `feature/subscriptions-fase1`, no en `main`. Se va a pushear a `origin/feature/subscriptions-fase1` (no a `main`, por tu condición #1) para que quede visible y revisable.

## Qué necesito de tu parte para seguir

Una de estas dos cosas (o ambas):

1. **Aplicar vos la migración** en un proyecto de Supabase de desarrollo (no producción): `supabase link` + `supabase db push`, o pegar el contenido de `supabase/migrations/20260820210041_fase1_foundations.sql` en el SQL Editor de un proyecto de desarrollo. Después, correr `npm test` con `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` de ese proyecto cargadas como variables de entorno, y pasarme el resultado (pass/fail real, no valores de las credenciales).
2. **Darme forma de hacerlo yo**: autenticar el CLI de Supabase en este entorno (o uno donde yo pueda trabajar) contra un proyecto de **desarrollo**, nunca el de producción directamente.

Con cualquiera de las dos, sigo con el resto de FASE 1 (queda pendiente todavía: la migración de datos heredados de AD-05, que deliberadamente no incluí en esta migración porque depende de que Auth exista — es un paso de FASE 2, no de FASE 1) y después con FASE 2 en adelante, según lo que ya definimos en `09-implementation-plan.md`.

## Confirmación

No se aplicó ninguna migración contra Supabase remoto. No se verificó backup (no aplica, no se tocó nada remoto). No se desplegó nada a Vercel (ni Preview ni Production). `PAYMENTS_ENABLED` sigue en `false`. No se creó ninguna suscripción ni se efectuó ningún cobro real. No se mostró, copió ni registró ningún secreto — no se consultó el valor de `MP_PUBLIC_KEY`/`MP_ACCESS_TOKEN` en ningún momento de este trabajo (no hizo falta: FASE 1 es solo modelo de datos, no toca Mercado Pago).
