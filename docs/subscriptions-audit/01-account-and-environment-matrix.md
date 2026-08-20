# 01 — Matriz de cuentas y entornos

## Método

Auditoría hecha **sin CLI de Vercel, Supabase ni GitHub instaladas** en este entorno (`vercel`, `supabase`, `gh` → `command not found`). Existe `~/.vercel/config.json` (confirmado por `ls`), pero **leer su contenido fue bloqueado por el clasificador de permisos del entorno** al intentarlo — decisión correcta de seguridad, no se insistió ni se buscó un rodeo. En consecuencia, todo lo que requiere sesión autenticada contra un panel se marca `REQUIERE VERIFICACIÓN HUMANA` con la ruta exacta a revisar. Lo que sí se pudo verificar es el **código y la configuración versionada en el repo**.

## Vercel

| Dato | Estado | Evidencia / cómo verificarlo |
|---|---|---|
| Proyecto vinculado | VERIFICADO | `.vercel/project.json` → `projectName: "alsina-consulting"`, `projectId: prj_riJ93EsHFizFcTmk6lItQwrMaHo3`, `orgId: team_YlU4wmpAGly38LOqsbKZiYPF` (es un **Team**, no cuenta personal — el `team_` prefix lo confirma). |
| Cuenta/Team propietario real, nombre y miembros | REQUIERE VERIFICACIÓN HUMANA | Vercel Dashboard → engranaje del team → **Settings → General/Members**. Copiar nombre del team y lista de miembros con rol. |
| Plan contratado (Hobby vs. Pro) | REQUIERE VERIFICACIÓN HUMANA | Dashboard del team → **Settings → Billing**. El prompt maestro ya decidió Pro para producción; falta confirmar que la factura activa lo refleje. |
| Dominio canónico `alsinaar.com` y redirects | REQUIERE VERIFICACIÓN HUMANA | Proyecto → **Settings → Domains**. El código asume `alsinaar.com` como `SITE_URL` en varios `api/*.js` (default hardcodeado, ver 04) pero eso no prueba que el dominio esté efectivamente enlazado y con redirect `www`→apex (o viceversa) configurado. |
| Rama de producción | REQUIERE VERIFICACIÓN HUMANA | Proyecto → **Settings → Git**. Localmente solo existe `main`; es razonable asumir que `main` = producción, pero no está confirmado en ningún archivo versionado. |
| Variables de entorno por entorno (nombre/presencia, no valor) | PARCIALMENTE VERIFICADO | Ver tabla de variables más abajo — se documentó qué variables **consume el código**, pero no cuáles están efectivamente cargadas en Vercel (eso requiere el dashboard o `vercel env ls` autenticado). |
| Deployments de producción/preview activos | REQUIERE VERIFICACIÓN HUMANA | Proyecto → pestaña **Deployments**. |
| Node/runtime y regiones | PARCIALMENTE VERIFICADO | `package.json` fija `"engines": { "node": "20.x" }` ([package.json:6-8](../../package.json#L6-L8)); no hay `regions` declaradas en `vercel.json` (usa default de Vercel). Confirmar región real en el dashboard si la latencia a Supabase importa. |
| Funciones, cron jobs, límites | VERIFICADO (no hay) | `vercel.json` solo declara headers CORS para `/api/*` y `functions."api/informe.js".includeFiles` para empaquetar `private/**` ([vercel.json](../../vercel.json)). No hay `crons` declarados en ningún lado del repo. |
| Usage / spend management / alertas | REQUIERE VERIFICACIÓN HUMANA | Team → **Settings → Billing → Usage** / **Spend Management**. |
| Protección de previews, accesos del equipo | REQUIERE VERIFICACIÓN HUMANA | Proyecto → **Settings → Deployment Protection**. |

## Supabase

| Dato | Estado | Evidencia / cómo verificarlo |
|---|---|---|
| Organización, proyecto, `project_ref` | NO VERIFICADO | No hay carpeta `supabase/` ni `supabase/config.toml` en el repo — el proyecto nunca se enlazó con el CLI localmente. `.env.example` solo trae un placeholder `https://xxxxxxxxxxxx.supabase.co` ([.env.example:2](../../.env.example#L2)), no una URL real. |
| Región, versión de Postgres | REQUIERE VERIFICACIÓN HUMANA | Dashboard del proyecto → **Project Settings → General/Infrastructure**. |
| Plan contratado (Free vs. Pro) | REQUIERE VERIFICACIÓN HUMANA | Dashboard → **Project Settings → Billing**. El prompt maestro decidió Pro; falta confirmar que ya se contrató (riesgo real: en Free, el proyecto puede pausarse por inactividad y perder los `contacts`/`unlocks` recolectados hasta ahora). |
| Auth: Site URL, redirect URLs, proveedores | AUSENTE | No hay ningún uso de Supabase Auth en el código (`grep` de `supabase.auth`, `signIn`, `signUp` no arrojó resultados en `/api` ni en HTML/JS del sitio). El proyecto de Supabase, si existe, se está usando **solo como Postgres vía `service_role`**, nunca como proveedor de identidad. |
| SMTP personalizado para emails de Auth | AUSENTE (no aplica hoy) | No hay Auth en uso; los emails transaccionales actuales los manda `Resend` directo desde `/api/*.js`, no Supabase. |
| Tablas, funciones, triggers, extensiones | VERIFICADO (en el script) / NO VERIFICADO (en la base real) | `supabase-migration.sql` define `contacts`, `unlocks`, `subscriptions`, `purchases` — sin funciones ni triggers ni extensiones adicionales declaradas ([supabase-migration.sql](../../supabase-migration.sql)). No se puede confirmar que la base remota coincida exactamente con este script (se ejecuta a mano vía SQL Editor, no hay migración versionada — ver 06). |
| RLS habilitado y políticas | VERIFICADO (en el script) | Las 4 tablas tienen `ENABLE ROW LEVEL SECURITY`; políticas de `INSERT` para `anon` en `contacts` y `unlocks` con regex de email; `purchases` y `subscriptions` sin política para `anon` (solo accesibles vía `service_role`) ([supabase-migration.sql:43-58](../../supabase-migration.sql#L43-L58), [supabase-migration.sql:88-90](../../supabase-migration.sql#L88-L90)). Detalle completo en [06-security-and-rls-audit.md](06-security-and-rls-audit.md). |
| Service Role solo en servidor | VERIFICADO | Todo uso de `SUPABASE_SERVICE_ROLE_KEY` está en `/api/*.js` (server-side, Vercel Functions); no se encontró en ningún `.html`/`.js` de cliente. |
| Buckets de Storage | AUSENTE | No hay ningún uso de `supabase.storage` en el código. Los "informes privados" se sirven desde el filesystem del deployment (`private/informes/*.html`), no desde Storage. |
| Backups, límites, uso | REQUIERE VERIFICACIÓN HUMANA | Dashboard → **Database → Backups** / **Project Settings → Usage**. |
| Edge Functions, secrets, cron jobs de Supabase | AUSENTE | No hay carpeta `supabase/functions/`; toda la lógica de servidor vive en Vercel Functions, no en Supabase Edge Functions. `pg_cron` no aparece en ningún script. |

## Resend

| Dato | Estado | Evidencia / cómo verificarlo |
|---|---|---|
| Uso en código | VERIFICADO | `new Resend(process.env.RESEND_API_KEY)` en `api/subscribe.js`, `api/webhook.js` (dos veces) — solo para emails transaccionales puntuales, sin plantillas versionadas ni cola. |
| Dominio verificado / DNS (SPF, DKIM, DMARC) | REQUIERE VERIFICACIÓN HUMANA | Resend Dashboard → **Domains** → estado de `alsinaar.com`. El remitente usado en código es `newsletter@alsinaar.com` (hardcodeado en 3 lugares: [api/subscribe.js:59](../../api/subscribe.js#L59), [api/webhook.js:92](../../api/webhook.js#L92), [api/webhook.js:128](../../api/webhook.js#L128)) — sin variable de entorno para el remitente. |
| Plan y consumo transaccional | REQUIERE VERIFICACIÓN HUMANA | Resend Dashboard → **Settings → Billing** / **Emails** (gráfico de envíos). |
| Plan/cupo de Marketing (Broadcasts, Audiences) | AUSENTE (no implementado) + REQUIERE VERIFICACIÓN HUMANA para el plan | No hay ningún uso de `resend.contacts`, `resend.audiences` ni `resend.broadcasts` en el código — hay un `TODO` explícito sin implementar: `// TODO: sync opcional a Resend Audiences o Brevo` ([api/subscribe.js:52](../../api/subscribe.js#L52)). El cupo de contactos/plan de Marketing debe confirmarse aparte en el dashboard. |
| Webhooks de Resend (entregas, rebotes, quejas, bajas) | AUSENTE | Ningún endpoint en `/api` procesa webhooks de Resend; no hay `RESEND_WEBHOOK_SECRET` ni equivalente en `.env.example` ni en el código. |
| Separación transaccional/editorial | PARCIALMENTE VERIFICADO | Hoy todo el envío es transaccional puntual (confirmación de newsletter, aviso de compra/suscripción). No existe todavía envío editorial masivo (Señal Alsina, nuevos informes) vía Resend — el newsletter se distribuye hoy fuera de este sistema (no hay evidencia en el repo de cómo se envía la Señal Alsina quincenal actual; podría ser manual). **Confirmar con el usuario** cómo se envía hoy el newsletter real. |

## Mercado Pago

| Dato | Estado | Evidencia / cómo verificarlo |
|---|---|---|
| Integración en código | VERIFICADO | SDK oficial `mercadopago@^3.2.0` ([package.json:11](../../package.json#L11)), usado en `api/checkout.js` (`Preference` para compra de informe, `PreApproval` para suscripción "pro") y `api/webhook.js` (`WebhookSignatureValidator`, más fetch directo a `api.mercadopago.com` para recuperar la entidad real). |
| Cuenta/aplicación correcta de Alsina (no personal) | REQUIERE VERIFICACIÓN HUMANA | Panel de Mercado Pago → `mercadopago.com.ar/developers/panel`, con la sesión de la cuenta comercial de Alsina. `README-PAGOS.md` documenta el paso pero no hay forma de confirmar desde el repo qué cuenta es la dueña real de las credenciales. |
| Nombre/ID de aplicación | REQUIERE VERIFICACIÓN HUMANA | Mismo panel → nombre de la app ("Tus Integraciones" según `README-PAGOS.md:14`). |
| Producto usado | VERIFICADO (por el código) | `Preference` (Checkout Pro, pago único) para informes; `PreApproval` (suscripción/débito recurrente autorizado) para "pro" — coincide con la restricción del prompt maestro de no describirlo como débito por CBU. |
| Credenciales de prueba/producción presentes | AUSENTE en este entorno | `.env.example` trae `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` comentados como placeholders, no como valores reales ([.env.example:16-19](../../.env.example#L16-L19)). Su presencia real en Vercel no puede verificarse desde acá. |
| Planes/precios creados en Mercado Pago (side del proveedor) | AUSENTE | El código no crea "planes" en MP, crea `PreApproval` ad-hoc por request con `transaction_amount` hardcodeado ([api/checkout.js:99-106](../../api/checkout.js#L99-L106)) — no hay Plan IDs de Mercado Pago involucrados. |
| URL de retorno | VERIFICADO | `back_urls` a `${SITE_URL}/informes.html?compra=...` para informes y `${SITE_URL}/index.html?pro=ok` para "pro" ([api/checkout.js:79-84](../../api/checkout.js#L79-L84), [api/checkout.js:98](../../api/checkout.js#L98)). Ninguna de las dos otorga acceso — el acceso lo da el webhook. |
| URL de webhook | VERIFICADO (en código) / REQUIERE VERIFICACIÓN HUMANA (en el panel) | Código apunta a `${SITE_URL}/api/webhook` ([api/checkout.js:85](../../api/checkout.js#L85)); falta confirmar que el panel de MP tenga configurada esa misma URL. |
| Verificación de firma | PARCIALMENTE VERIFICADO | Implementada con el validador oficial, pero **falla abierto** si `MP_WEBHOOK_SECRET` no está seteado ([api/webhook.js:12-17](../../api/webhook.js#L12-L17)) — ver hallazgo en 06 y 08. |
| Sandbox vs. producción | NO VERIFICADO | El código no distingue explícitamente entorno sandbox/producción más allá de qué credencial se cargue — depende 100% de qué token esté puesto en cada entorno de Vercel. No hay ningún check que impida usar credenciales de producción en preview o viceversa. |

## GitHub

| Dato | Estado | Evidencia / cómo verificarlo |
|---|---|---|
| Repositorio canónico | VERIFICADO | `origin` → `github.com/montesdeocafelimdo-commits/alsina-consulting` (token de acceso en la URL remota — ver nota de seguridad abajo). |
| Reglas de rama / PR obligatorio | REQUIERE VERIFICACIÓN HUMANA | GitHub → repo → **Settings → Branches**. El historial local muestra commits directos a `main` alternados con "Merge:" — no permite inferir si hay protección de rama activa. |
| CI | AUSENTE | No existe `.github/workflows/` en el repo. |
| Prevención de secretos commiteados | PARCIALMENTE VERIFICADO | `.gitignore` excluye `.env`, `.env.local`, `.env.*.local` y `.vercel` ([.gitignore:1-4](../../.gitignore#L1-L4)) — correcto. No hay ningún hook de pre-commit ni GitHub Advanced Security / secret scanning confirmable desde acá. |

> **Nota de seguridad fuera del alcance de pagos**: el remote `origin` tiene un token de acceso (`gho_...`) embebido en la URL HTTPS (visible con `git remote -v`). No es un secreto de la integración de pagos y no se imprimió su valor completo en este documento, pero **vale la pena que el usuario lo revise**: un token en la URL del remote queda en `.git/config` en texto plano y puede filtrarse fácilmente (backups, `cat .git/config`, etc.). No se tocó ni se rotó — solo se señala.

## Variables de entorno — qué consume el código (nombre, no valor)

Convención real del repo (no coincide 1:1 con los nombres de ejemplo del prompt maestro — se documenta el mapeo):

| Variable (nombre real en el repo) | Dónde se usa | Pública/secreta | Consumida por código | Notas |
|---|---|---|---|---|
| `SUPABASE_URL` | `api/checkout.js`, `api/confirm.js`, `api/subscribe.js`, `api/unlock.js`, `api/webhook.js` | Secreta (server) | Sí | Equivalente al `NEXT_PUBLIC_SUPABASE_URL` del prompt maestro, pero usado solo server-side aquí. |
| `NEXT_PUBLIC_SUPABASE_URL` | — | Pública (nominal) | **No** — no aparece en ningún `grep` de código | Declarada en `.env.example` pero sin consumidor detectado. Posible resabio o preparación no usada. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | Pública (nominal) | **No** — no aparece en ningún `grep` de código | Mismo caso: no hay ningún cliente de Supabase corriendo en el navegador. |
| `SUPABASE_SERVICE_ROLE_KEY` | Todos los `/api/*.js` que tocan Supabase | Secreta (server-only) | Sí | Uso correcto: nunca en cliente. |
| `RESEND_API_KEY` | `api/subscribe.js`, `api/webhook.js` | Secreta (server) | Sí | — |
| `RESEND_WEBHOOK_SECRET` (equivalente) | — | — | **No existe** | No hay endpoint de webhook de Resend en el repo. |
| `SITE_URL` | `api/checkout.js`, `api/confirm.js`, `api/subscribe.js`, `api/webhook.js` | Pública (nominal) | Sí, con default `https://alsinaar.com` si falta | Equivalente al `APP_URL` del prompt maestro. |
| `PAYMENTS_ENABLED` | `api/checkout.js`, `api/config.js` | Pública (expuesta vía `/api/config`) | Sí | Flag maestro, string `'true'`/`'false'`, no boolean. |
| `MP_ACCESS_TOKEN` | `api/checkout.js`, `api/webhook.js` | Secreta (server-only) | Sí | Equivalente a `MERCADOPAGO_ACCESS_TOKEN`. |
| `MP_PUBLIC_KEY` | — | Pública (nominal) | **No** — declarada en `.env.example` pero no encontrada en uso real de código (no hay Checkout Bricks/SDK de cliente cargado; el flujo actual es 100% redirect a `init_point`, no necesita Public Key en el cliente) | Posible resabio o preparación a futuro. |
| `MP_WEBHOOK_SECRET` | `api/webhook.js` | Secreta (server-only) | Sí, pero opcional en runtime (ver hallazgo de "falla abierto") | Equivalente a `MERCADOPAGO_WEBHOOK_SECRET`. |
| `INFORME_KEY_HASH_OLAVARRIA` | `api/informe.js` | Secreta (hash, no la clave en texto plano) | Sí | Sin equivalente en la lista del prompt maestro — es propio de este repo. |
| `INFORME_KEY_HASH_EXALTACION` | `api/informe.js` | Secreta (hash) | Sí | Ídem. |
| `CRON_SECRET` (equivalente) | — | — | **No existe** | No hay ningún cron job en el repo todavía. |
| `MERCADOPAGO_*_PLAN_ID` (equivalente) | — | — | **No existe** | El código no usa Plan IDs de MP; crea `PreApproval` ad-hoc. |

No se imprimió, copió ni infirió ningún valor de secreto en este documento — todo lo de arriba sale de leer el **código fuente versionado**, no de consultar Vercel/Supabase.

## Matriz por entorno (local / development / preview / production)

| Entorno | Estado |
|---|---|
| Local | No hay `.env` ni `.env.local` en el repo (correctamente gitignorado). No se pudo confirmar si existe una copia local fuera de git en la máquina del usuario — no se buscó fuera del repositorio. |
| Development | No hay un entorno "development" separado documentado — el repo no distingue development de local. |
| Preview | `README-PAGOS.md` recomienda probar con credenciales de sandbox de MP en un preview de Vercel ([README-PAGOS.md:21-23](../../README-PAGOS.md#L21-L23)) — no hay evidencia de que eso ya se haya hecho. |
| Production | Asumido = rama `main` desplegada a `alsinaar.com`, pero no confirmado desde el dashboard (ver fila "Rama de producción" arriba). |

Sin acceso al dashboard de Vercel no se puede confirmar cuáles de estas variables están efectivamente cargadas en cada entorno, ni si hay duplicados u obsoletas del lado del panel (por ejemplo, alguna variable vieja de una integración descartada). Eso queda como tarea humana antes de FASE 1.
