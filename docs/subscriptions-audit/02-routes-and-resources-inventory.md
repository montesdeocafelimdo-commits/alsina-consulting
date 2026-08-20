# 02 — Inventario de rutas y recursos

Sitio estático servido "por nombre de archivo" (sin router de aplicación) más `/api/*` como Vercel Functions. No hay ningún concepto de ruta "privada" a nivel de aplicación — la única protección real hoy es a nivel de contenido (gates de scroll/modal) o a nivel de servidor (`middleware.js` + `/api/informe.js`).

## Páginas públicas (HTML estático en la raíz, sin gating)

`index.html`, `informes.html`, `newsletter.html`, `consultoria.html`, `que-es-alsina.html`, `productos.html`, `alsina-presentacion.html`, `alsina-diagnostico-servicio.html`, `vincular-demo.html`, `alsina-mapa-politico.html`, `municipios-data-hub.html`, `alsina-presupuesto-impositiva-2026.html`, `alsina-balance-fiscal-1s2026.html`, `nota-electoral-2027.html`, `nota-fin-de-una-era.html`, `nota-un-empleo-cada-23-vecinos.html`, `alsina-informe-transferencias.html`, más los exports estáticos `radar-fiscal/` y `super-rigi/`.

Todas son 100% accesibles sin ningún control de acceso — coincide con lo esperado para contenido editorial abierto. **No hay ningún control de acceso server-side en ninguna de estas páginas** (correcto para las que deben ser públicas; a revisar contra el plan Intendente/Ministro/Gobernador para las que deberían quedar detrás de un plan pago, ver 03).

## Páginas con "gating" de contenido (client-side, sin protección real de servidor)

| Página | Mecanismo | Backend que dispara |
|---|---|---|
| `alsina-nota-finanzas-pba.html`, `alsina-informe-super-rigi.html`, `alsina-pbg-pba.html`, `alsina-recaudacion-tributaria-pba.html` | Scroll gate al ~30%, degradé CSS + modal de mail (o compra, si `PAYMENTS_ENABLED=true`) — [assets/js/gate.js:97-175](../../assets/js/gate.js#L97-L175) | `/api/subscribe` (captura mail) o `/api/checkout` (si pagos activos) |
| `municipios-data-hub.html`, `alsina-mapa-politico.html` | Soft gate: modal no bloqueante tras N clicks/segundos — [assets/js/gate.js:22-95](../../assets/js/gate.js#L22-L95) | `/api/subscribe` |

**Hallazgo (ya señalado en `README-PAGOS.md:78-85`, confirmado en código)**: el contenido "protegido" de estas 4 notas **está completo en el HTML servido al navegador**; el gate solo lo tapa visualmente hasta dejar el mail. Cualquiera con herramientas de desarrollador puede leerlo sin pagar ni dejar el mail. Esto es aceptable como estado transitorio ya documentado por el propio equipo, pero es **AUSENTE** como protección real y debe resolverse en FASE 5 si alguno de estos contenidos pasa a ser de pago real (hoy paga con "informe" o "pro" según el `data-checkout-resource`, pero el contenido nunca deja de estar en el HTML).

## Contenido verdaderamente protegido server-side

| Recurso | Mecanismo | Evidencia |
|---|---|---|
| `informes/olavarria.html`, `informes/exaltacion-de-la-cruz.html` (páginas públicas, son el "shell" con el formulario de clave) | Clave por cliente → `POST /api/informe` con `{slug, key}`, valida contra hash SHA-256 en env var, devuelve el HTML real desde `private/informes/*.html` | [api/informe.js](../../api/informe.js) |
| `private/informes/olavarria.html`, `private/informes/exaltacion-de-la-cruz.html` | Bloqueados a nivel de Vercel Middleware — cualquier acceso directo a `/private/*` devuelve 404 | [middleware.js](../../middleware.js) |

Este es el único ejemplo real de "recurso privado con URL no permanente" que ya existe en el sitio, y es el candidato natural a generalizar en FASE 5 — aunque su modelo de auth (una clave compartida por cliente, sin usuario ni cuenta) es distinto al de suscripción individual que pide el prompt maestro.

## Rutas API (`/api/*`, Vercel Serverless Functions, Node 20)

| Ruta | Método | Auth | Qué hace | Evidencia |
|---|---|---|---|---|
| `/api/subscribe` | `POST` | Ninguna (abierta, valida solo formato de email) | Alta/upsert en `contacts`, dispara email de confirmación (doble opt-in) vía Resend | [api/subscribe.js](../../api/subscribe.js) |
| `/api/confirm` | `GET` (link de mail) | Token de confirmación en query string | Marca `contacts.confirmed = true`, redirige a `newsletter.html` | [api/confirm.js](../../api/confirm.js) |
| `/api/unlock` | `POST` | Ninguna | Registra `unlocks` (email + resource) — desbloqueo "gratis" por mail para recursos no pagos | [api/unlock.js](../../api/unlock.js) |
| `/api/config` | `GET` | Ninguna, pública por diseño | Expone `{ paymentsEnabled }` al frontend, cacheada 60s | [api/config.js](../../api/config.js) |
| `/api/informe` | `POST` | Clave por cliente (hash SHA-256) | Devuelve el HTML privado de un informe institucional si la clave matchea | [api/informe.js](../../api/informe.js) |
| `/api/checkout` | `POST` | Ninguna (email + tipo) | Con pagos apagados: anota waitlist. Con pagos activos: crea `Preference` (informe) o `PreApproval` (pro) en Mercado Pago | [api/checkout.js](../../api/checkout.js) |
| `/api/webhook` | `POST`/`GET` | Firma de Mercado Pago (`x-signature`), verificación opcional según env | Único punto que otorga acceso real: upsert de `purchases`/`subscriptions`, envío de mail de confirmación | [api/webhook.js](../../api/webhook.js) |

**No existe ninguna ruta administrativa** (`/api/admin/*` o equivalente) ni ningún panel de usuario/admin en el repo — confirmar en 03/07.

## Middleware

Un único middleware, con un único propósito: devolver 404 ante cualquier request directo a `/private/:path*` ([middleware.js](../../middleware.js)). No hay middleware de autenticación, autorización, rate limiting, ni CSRF en ningún punto del sitio.

## Modelos/tipos de datos existentes

No hay ORM, ni carpeta `types/`, ni `schema.prisma`, ni typings compartidos entre frontend y backend — el "modelo de datos" real es exclusivamente el DDL en `supabase-migration.sql`:

- `contacts(id, email, source, confirmed, is_subscriber, confirmation_token, created_at)`
- `unlocks(id, email, resource, created_at)` — único por `(email, resource)`
- `subscriptions(id, email, plan, status, started_at, created_at, mp_preapproval_id)` — `plan` es texto libre (`'pro'`/`'municipal'` en el comentario, pero en código solo se escribe `'pro'`); `status` es texto libre sin `CHECK` (`'active' | 'inactive' | 'cancelled'` por convención, sin garantía en base)
- `purchases(id, email, resource, mp_payment_id, amount, status, created_at)`

No hay `profiles`, `accounts`, `account_members`, `roles`, `plans`, `plan_prices`, `features`, `plan_features`, `resources`, `resource_features`, `subscription_periods`, `payment_provider_events`, `entitlements`, `manual_access_grants`, `email_preferences`, `email_outbox`, `email_events`, `invitations` ni `audit_logs`. Ninguna de las tablas del modelo orientativo de la FASE 1 existe hoy — se parte de cero en el modelo de datos de identidad/planes/entitlements.

## Formularios, newsletter, descargas, informes, dashboards, archivos privados — inventario funcional

- **Newsletter**: `newsletter.html` con formularios que llaman a `/api/subscribe` (doble opt-in por link de confirmación).
- **Descargas**: no se encontró ningún endpoint ni botón de descarga de PDF/archivo — `README-PAGOS.md` y el prompt maestro mencionan "descargas habilitadas" como beneficio futuro, pero no hay implementación (ni URL firmada, ni endpoint de streaming).
- **Informes**: notas HTML públicas con gate parcial (arriba) + informes de clientes con clave (arriba). No hay una "biblioteca de informes por plan" — `informes.html` es una página estática de listado editorial, no filtra por entitlement.
- **Dashboards**: `municipios-data-hub.html` ("Monitor 135") es 100% público hoy, sin ningún control de acceso — el prompt maestro lo asigna como beneficio de plan Intendente en adelante, así que hoy **no hay diferenciación de acceso por plan en absoluto**.
- **Archivos privados**: solo los dos informes de clientes (`private/informes/*.html`), sin relación con planes de suscripción — son accesos institucionales por contrato, no por suscripción.

## Deuda técnica y hallazgos adicionales relevantes para esta migración

- **Precio hardcodeado duplicado en 3 lugares**: `api/checkout.js` (`PRICES`), `assets/js/pricing.js` (`window.ALSINA_PRICING`), y el propio comentario de `assets/js/pricing.js:1-6` ya advierte sobre un tercer lugar (JSON-LD de `Product` en `informes.html`) que debería reflejar el mismo precio pero no puede leerse desde JS. Se buscó ese JSON-LD y no se encontró (`grep` de `"Product"`/`"price"` en `informes.html` no arrojó resultados) — **puede estar desactualizado o nunca haberse implementado**; confirmar con el usuario si `informes.html` tiene datos estructurados de producto en alguna otra sección no encontrada por el patrón de búsqueda usado.
- **Los 3 planes de la tabla comparativa (`assets/js/subscription-compare.js`) no tienen ningún respaldo en el backend** más allá del nombre del `resource` que se manda a `/api/checkout` — ver el detalle completo del bug de precios en [00-executive-summary.md](00-executive-summary.md) y [08-decisions-required.md](08-decisions-required.md).
- **Remitente de email hardcodeado** (`newsletter@alsinaar.com`) en 3 archivos distintos en vez de una única variable de entorno o constante compartida.
- **`INVENTARIO.md` (fechado 2026-07-07)** documenta hallazgos de una auditoría de contenido anterior (rediseño 2026), no de esta iniciativa de suscripciones — se usó como fuente de contexto pero varios de sus hallazgos (ej. banner "Alsina Pro demo" en newsletter) ya no aplican: se verificó en código que `newsletter.html` hoy no tiene ningún stub/demo visible (ver [newsletter.html:586-610](../../newsletter.html#L586-L610)), solo un CTA real a `index.html#precios`.
