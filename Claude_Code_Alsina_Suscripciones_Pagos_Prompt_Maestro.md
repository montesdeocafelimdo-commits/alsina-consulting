# Alsina — Prompt maestro para suscripciones, pagos y accesos

Fecha de preparación: 20 de agosto de 2026

## Decisión sobre los planes de infraestructura

Se decidió utilizar planes profesionales pagos para producción. Claude Code deberá confirmar el estado real de las cuentas y distinguir entre desarrollo, preview y producción.

| Servicio | Desarrollo y pruebas | Producción con suscripciones pagas | Criterio para Alsina |
|---|---|---|---|
| Supabase | Free puede alcanzar inicialmente | **Pro decidido** | Free puede pausarse por baja actividad y no ofrece el mismo esquema de backups. Pro parte de USD 25/mes, evita pausas e incluye backups diarios con 7 días de retención, 100.000 MAU, 8 GB de base, 100 GB de Storage y 250 GB de egress. |
| Resend transaccional | Free hasta 3.000 emails/mes y 100/día | **Pro decidido** | El límite diario de Free puede bloquear altas, magic links o avisos de cobro en un día de campaña. Pro parte de USD 20/mes por 50.000 emails y no tiene límite diario. |
| Resend Marketing | Free hasta 1.000 contactos, según la oferta vigente | Revisar volumen real de la lista | Confirmar por separado el plan/cupo de contactos para Broadcasts. La baja editorial no debe impedir emails de autenticación, seguridad o pagos. |
| Vercel | Hobby sirve para proyectos personales y pruebas | **Pro decidido** | Hobby está restringido a uso personal no comercial. Confirmar Team, proyecto, dominio, gasto, miembros y límites reales en Billing/Usage. |
| Mercado Pago | Credenciales y usuarios de prueba | Aplicación de Alsina y credenciales de producción | La integración debe soportar suscripción mensual recurrente autorizada. No describirla como débito bancario por CBU. Nunca habilitar acceso desde la URL de retorno: únicamente desde un evento de pago verificado. |

Fuentes oficiales vigentes al 20/08/2026:

- Supabase: https://supabase.com/pricing
- Supabase, checklist de producción: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase, backups: https://supabase.com/docs/guides/platform/backups
- Resend: https://resend.com/pricing
- Resend, cuotas: https://resend.com/docs/knowledge-base/account-quotas-and-limits
- Vercel: https://vercel.com/pricing
- Vercel Hobby: https://vercel.com/docs/plans/hobby

### Método de pago de estas suscripciones

La titularidad técnica de Vercel, Supabase, Resend y Mercado Pago debe quedar bajo cuentas y correos de Alsina, con acceso del equipo y recuperación institucional. El instrumento usado para abonar las facturas es una decisión financiera separada.

Se evaluará utilizar una tarjeta ARQ en USDc para pagar los servicios internacionales. No debe asumirse que esto elimina obligaciones fiscales argentinas ni reemplaza la revisión contable. No contratar ARQ Premium únicamente para estas tres suscripciones sin comparar costo y cashback: la tarjeta virtual Standard no tiene cargo de emisión y ARQ informa que los pagos con tarjeta no tienen comisión, mientras Premium cuesta USDc 6,99 mensuales.

---

# PROMPT PARA PEGAR EN CLAUDE CODE

Quiero que trabajes como arquitecto y desarrollador principal de la infraestructura de suscripciones de **Alsina | Gestión Pública, Tecnología y Territorio**.

El objetivo final es implementar un sistema seguro y auditable de:

- registro e inicio de sesión;
- cuentas personales e institucionales;
- tres planes de suscripción;
- cobro mensual recurrente mediante Mercado Pago;
- permisos por capacidad y protección de contenidos;
- emails transaccionales y editoriales mediante Resend;
- persistencia, Auth, Storage y políticas RLS mediante Supabase;
- despliegue mediante Vercel;
- panel del usuario y panel administrativo;
- reconciliación, trazabilidad, alertas y pruebas.

## Regla principal: empezá en modo planificación

**No programes, no ejecutes migraciones, no modifiques variables, no crees recursos externos y no despliegues nada al comenzar.**

Tu primera tarea es realizar una auditoría read-only de lo que ya existe. Aunque encuentres una implementación parcial, no la reemplaces ni la completes hasta presentar el informe y recibir mi aprobación explícita.

No asumas que una variable presente significa que la integración funciona. No asumas que un servicio está en producción porque existe una cuenta. No inventes planes, precios, IDs, dominios, rutas, capacidades ni credenciales.

Nunca imprimas valores de secretos. Podés informar el **nombre** de una variable y si está presente o ausente, pero su valor debe mostrarse siempre como `[REDACTED]`. No copies secretos a documentación, logs, commits, respuestas ni archivos de ejemplo.

## Contexto comercial ya decidido

Existen tres planes con jerarquía acumulativa:

| Plan | Alcance decidido |
|---|---|
| Intendente | Sitio y notas libres, Señal Alsina y Monitor 135 básico. |
| Ministro | Todo Intendente, más Recaudación, Transferencias, informes y descargas habilitadas. |
| Gobernador | Todo Ministro, más bases municipales, dashboards y archivo completo. |

Restricciones ya decididas:

- Monitor 135 conserva su propia página.
- Las visualizaciones no se ofrecen como descarga.
- Radar Fiscal queda fuera hasta que esté listo.
- No agregues alertas legislativas, reporte trimestral, descarga de visualizaciones ni “informe especial breve” como beneficios de los planes.
- No codifiques permisos con condicionales dispersos como `plan === 'gobernador'`. Usá capacidades centralizadas.
- Los precios definitivos no están incluidos en este prompt: recuperalos únicamente de la fuente canónica existente y, si hay contradicciones, marcá una decisión pendiente.

## Principios de identidad y acceso

Separá conceptualmente:

- identidad: la persona autenticada;
- cuenta: personal u organización;
- membresía: relación de una identidad con una cuenta;
- rol administrativo u organizacional;
- suscripción: pertenece a una cuenta, no directamente a un perfil;
- capacidades: beneficios efectivos concedidos por plan o excepción;
- recursos: notas, informes, módulos, dashboards, PDFs, archivos y bases.

Tipos previstos:

- visitante;
- usuario registrado sin suscripción;
- suscriptor individual;
- cuenta institucional/organización, por ejemplo municipio o provincia;
- miembro invitado de una organización;
- equipo Alsina con roles Editor, Soporte, Admin y Superadmin.

Los miembros de una organización heredan el acceso de esa cuenta dentro de las reglas definidas. No mezcles roles internos de Alsina con roles de una organización cliente.

## Arquitectura de pagos decidida

Mercado Pago realizará un cobro recurrente mensual previamente autorizado sobre el medio de pago admitido. No prometas débito automático por CBU.

El flujo seguro debe ser:

1. Supabase Auth identifica al usuario.
2. El backend crea o inicia la suscripción asociando usuario, cuenta, plan y una referencia externa inequívoca.
3. Mercado Pago recibe el medio de pago.
4. La URL de retorno muestra un estado como “Confirmando pago…”, pero nunca habilita acceso.
5. Mercado Pago informa el evento mediante webhook.
6. El servidor verifica autenticidad/firma, entorno, referencia, moneda, monto, plan y estado.
7. El procesador idempotente registra el evento y actualiza pago/suscripción.
8. Los permisos se recalculan en Supabase.
9. Resend envía el email correspondiente.

Hasta que la conexión real quede verificada, la arquitectura debe permitir un `MockPaymentProvider` solo para desarrollo y pruebas. Ese simulador debe ser imposible de habilitar en producción.

## FASE 0 — Auditoría read-only obligatoria

### 0.1 Estado del repositorio

Inspeccioná y documentá:

- instrucciones del repositorio (`CLAUDE.md`, `AGENTS.md`, README y equivalentes);
- estado de Git, rama actual, remotos y cambios sin commitear;
- stack real, framework, gestor de paquetes y versiones;
- estructura de aplicaciones y paquetes;
- rutas públicas, privadas, administrativas y API;
- middleware, autenticación y autorización existente;
- modelos/tipos de usuario, plan, contenido y pagos;
- migraciones, seeds, funciones, cron jobs y tests;
- formularios, newsletter, descargas, informes, dashboards y archivos privados;
- integraciones ya declaradas;
- deuda técnica, código duplicado y rutas rotas relevantes.

No modifiques cambios preexistentes del usuario ni archivos ajenos al alcance.

### 0.2 Inventario de entornos y variables

Construí una matriz por entorno:

- local;
- development;
- preview;
- production.

Para cada variable relevante informá solamente:

- nombre;
- entorno donde está configurada;
- si es pública o secreta;
- si el código la consume;
- si parece duplicada, obsoleta o ausente;
- nunca su valor.

Buscá, sin limitarte a ellos, equivalentes de:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
RESEND_FROM_EMAIL
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_PUBLIC_KEY
MERCADOPAGO_WEBHOOK_SECRET
MERCADOPAGO_*_PLAN_ID
PAYMENT_PROVIDER
APP_URL
CRON_SECRET
```

No impongas estos nombres si el proyecto ya tiene una convención consistente; documentá el mapeo.

### 0.3 Verificación de Vercel

Usando configuración local, integración del repositorio y CLI únicamente si ya está autenticada y es seguro hacerlo, verificá:

- cuenta/Team propietario;
- plan contratado y si es apto para uso comercial;
- proyecto vinculado y repositorio correcto;
- dominio canónico `alsinaar.com` y redirects;
- deployments de producción y preview;
- rama de producción;
- variables por entorno, indicando presencia pero no valores;
- Node/runtime y regiones relevantes;
- funciones, cron jobs y límites configurados;
- Usage y alertas/spend management accesibles;
- protección de previews y accesos del equipo.

Si el plan o Billing no puede verificarse desde las herramientas disponibles, marcá `REQUIERE VERIFICACIÓN HUMANA` e indicá la ruta exacta del panel y el dato que debo copiar o capturar.

### 0.4 Verificación de Supabase

Verificá:

- organización, plan, proyecto y `project_ref` correctos;
- región y versión de Postgres;
- enlace entre CLI local y proyecto remoto;
- migraciones locales versus remotas y posibles divergencias;
- Auth, Site URL, redirect URLs y proveedores;
- SMTP personalizado para emails de Auth;
- tablas, funciones, triggers y extensiones relevantes;
- RLS habilitado y políticas efectivas;
- Service Role solo en servidor;
- buckets públicos y privados;
- límites, uso, backups y retención;
- Edge Functions, secrets y cron jobs;
- ambientes de desarrollo/producción y estrategia de migración;
- logs y alertas accesibles.

No ejecutes `db push`, reparaciones de historial, resets ni migraciones en esta fase.

### 0.5 Verificación de Resend

Verificá por separado:

- plan y consumo de emails transaccionales;
- plan/cupo de Marketing y cantidad de contactos;
- dominio verificado y DNS (SPF, DKIM y DMARC cuando corresponda);
- remitentes autorizados;
- API key presente en los entornos correctos;
- código que efectivamente envía emails;
- uso como SMTP de Supabase Auth o alternativa implementada;
- webhooks, endpoint, firma y eventos suscriptos;
- contactos, audiencias, Broadcasts y preferencias;
- separación entre emails transaccionales y editoriales;
- rebotes, quejas, desuscripciones y retención de eventos;
- límites diarios/mensuales y riesgo de bloqueo en el lanzamiento.

La desuscripción editorial nunca debe impedir emails de seguridad, acceso, pagos o información contractual.

### 0.6 Verificación de Mercado Pago

Verificá, sin crear ni alterar recursos:

- que la aplicación pertenezca a la cuenta comercial correcta de Alsina y no a una cuenta personal equivocada;
- nombre e ID de aplicación;
- producto de suscripciones/pagos recurrentes seleccionado;
- credenciales de prueba y producción, solo como presentes/ausentes;
- Public Key en cliente y Access Token exclusivamente en servidor;
- planes creados, frecuencia, moneda, monto y estado;
- URLs de retorno;
- URL de webhook/notificaciones;
- secreto y verificación de firma;
- cuentas/usuarios/tarjetas de prueba disponibles;
- referencias externas y mapeo con Supabase;
- diferencia inequívoca entre sandbox y producción.

Si necesitás que yo navegue un panel, no adivines. Indicá pantalla, menú, dato y captura necesarios.

### 0.7 Verificación de GitHub y despliegues

Verificá:

- repositorio canónico y permisos;
- reglas de rama y PR;
- CI existente;
- chequeos de lint, tipos, tests y build;
- prevención de secretos commiteados;
- mecanismo para migraciones de Supabase;
- relación entre merge a `main`, deployment y migración;
- estrategia de rollback.

## Entregables de la FASE 0

Creá en `/docs/subscriptions-audit/`:

1. `00-executive-summary.md`
2. `01-account-and-environment-matrix.md`
3. `02-routes-and-resources-inventory.md`
4. `03-access-matrix.md`
5. `04-current-integrations.md`
6. `05-data-model-gap-analysis.md`
7. `06-security-and-rls-audit.md`
8. `07-billing-and-capacity-review.md`
9. `08-decisions-required.md`
10. `09-implementation-plan.md`
11. `10-production-readiness-checklist.md`

Clasificá cada hallazgo como:

- `VERIFICADO`;
- `PARCIALMENTE VERIFICADO`;
- `NO VERIFICADO`;
- `AUSENTE`;
- `BLOQUEANTE`;
- `REQUIERE VERIFICACIÓN HUMANA`.

Para cada afirmación, citá evidencia concreta: archivo y línea, comando seguro ejecutado, configuración o pantalla requerida. Separá hechos de inferencias.

Al terminar la FASE 0:

- mostrame un resumen ejecutivo breve;
- enumerá bloqueantes y decisiones;
- proponé fases y orden;
- estimá riesgos, no tiempos ficticios;
- **detenete y esperá mi aprobación explícita antes de implementar**.

## Decisiones que no debés tomar por tu cuenta

Marcá estas cuestiones para resolución si no existe una fuente canónica inequívoca:

- precios ARS finales y política de actualización;
- impuestos y facturación;
- día fijo o fecha aniversario de cobro;
- existencia y duración de prueba gratuita;
- período de gracia exacto ante cobro fallido: rango preliminar discutido, 3 a 5 días;
- cantidad y cadencia de avisos de recuperación;
- límites de miembros por cuenta institucional;
- permisos exactos del usuario registrado gratuito;
- upgrade inmediato o próximo ciclo;
- downgrade en próximo ciclo;
- cancelación al final del período ya pagado;
- reembolsos y contracargos;
- capacidad exacta requerida por cada recurso;
- retención de logs y auditorías;
- remitentes y tono final de cada email;
- responsables humanos y roles administrativos.

No conviertas una propuesta preliminar en una regla irreversible.

## FASE 1 — Fundaciones, después de aprobación

Implementá primero:

- configuración validada de entornos;
- migraciones versionadas;
- identidad, cuentas, membresías y roles;
- planes, precios versionados, capacidades y recursos;
- suscripciones, períodos y entitlements;
- pagos y eventos del proveedor;
- outbox de emails;
- auditoría;
- RLS y tests de RLS;
- seeds de desarrollo sin datos reales.

Modelo orientativo mínimo, adaptable al esquema existente:

```text
profiles
accounts
account_members
roles / member_roles
plans
plan_prices
features
plan_features
resources
resource_features
subscriptions
subscription_periods
payments
payment_provider_events
entitlements
manual_access_grants
email_preferences
email_outbox
email_events
invitations
audit_logs
```

No crees tablas duplicadas si el modelo existente puede evolucionar limpiamente. Documentá toda decisión.

## FASE 2 — Autenticación, cuentas y permisos

Implementá y probá:

- registro, login, magic link/recuperación según el patrón existente;
- creación segura de perfil y cuenta personal;
- cuentas institucionales;
- invitación, aceptación, expiración y revocación;
- resolución centralizada de capacidades;
- protección de rutas del servidor;
- protección de acciones/API;
- RLS coherente con la autorización del backend;
- panel básico de cuenta;
- controles administrativos auditados.

El frontend nunca es la autoridad para conceder acceso.

## FASE 3 — Proveedor de pagos y simulador

Definí una abstracción similar a:

```ts
interface PaymentProvider {
  createSubscription(input: CreateSubscriptionInput): Promise<CheckoutResult>
  getSubscription(providerId: string): Promise<ProviderSubscription>
  cancelSubscription(providerId: string, options?: CancelOptions): Promise<void>
  changePlan(providerId: string, input: ChangePlanInput): Promise<ProviderSubscription>
  normalizeWebhook(request: Request): Promise<NormalizedPaymentEvent>
}
```

Implementá primero `MockPaymentProvider` para local/test. Debe producir los mismos eventos internos normalizados que Mercado Pago.

Simulá y testeá:

- alta aprobada;
- pago pendiente;
- pago rechazado;
- renovación aprobada;
- renovación rechazada;
- gracia y vencimiento;
- actualización de medio de pago;
- upgrade/downgrade según política aprobada;
- cancelación al final del período;
- reembolso;
- contracargo;
- webhook duplicado;
- evento fuera de orden;
- evento con firma inválida;
- monto, moneda, referencia o plan incorrectos.

El simulador debe fallar al iniciar si se intenta habilitar en producción.

## FASE 4 — Mercado Pago real

Solo después de verificar la cuenta, aplicación y credenciales:

- implementá `MercadoPagoProvider` con el SDK/API oficial vigente;
- mantené Access Token y secretos únicamente del lado servidor;
- creá/mapeá planes sin perder precios históricos;
- generá referencias externas no ambiguas;
- verificá webhooks con el cuerpo/formato exigido por Mercado Pago;
- procesá eventos de forma idempotente y tolerante a desorden;
- recuperá la entidad desde Mercado Pago cuando sea necesario, sin confiar ciegamente en el payload;
- conciliá suscripción, pago y acceso;
- nunca habilites acceso desde query params o retorno del navegador;
- probá primero con credenciales, usuarios y tarjetas de prueba;
- ejecutá una prueba controlada de producción solamente con aprobación explícita.

Estados internos orientativos a validar contra el modelo existente:

```text
incomplete
pending
trialing
active
past_due
grace_period
suspended
cancel_at_period_end
canceled
refunded
disputed
```

No acoples los estados internos uno a uno con nombres del proveedor. Documentá la normalización.

## FASE 5 — Contenidos protegidos

- Guardá PDFs, bases y documentos reservados en buckets privados.
- Autorizá cada acceso desde el servidor según cuenta, capacidades, vigencia y recurso publicado.
- Usá URLs firmadas cortas o streaming mediante endpoint controlado según sensibilidad.
- No expongas rutas permanentes de Storage.
- Registrá visualización o descarga cuando corresponda.
- No restrinjas las notas públicas por accidente.
- No conviertas las visualizaciones en archivos descargables.

## FASE 6 — Resend y sistema de emails

Separá:

### Transaccionales

- confirmación de cuenta;
- magic link/recuperación;
- suscripción en proceso;
- suscripción confirmada;
- renovación confirmada, si se aprueba;
- pago rechazado;
- aviso previo a suspensión;
- suspensión;
- medio de pago actualizado;
- cambio de plan;
- cancelación solicitada;
- cancelación efectiva;
- invitación institucional;
- acceso manual otorgado o vencido.

### Editoriales

- Señal Alsina;
- nuevo informe;
- nueva edición de Recaudación;
- nueva edición de Transferencias;
- avisos de contenido según capacidad;
- selección de lecturas gratuitas.

Requisitos:

- outbox/cola y reintentos;
- plantillas versionadas y testeables;
- deduplicación;
- webhooks verificados;
- entregas, rebotes, quejas y bajas;
- preferencias y consentimiento registrables;
- baja editorial separada de comunicaciones necesarias;
- remitentes verificados;
- Supabase Auth usando SMTP/flujo aprobado;
- no incluir datos sensibles en emails o logs.

## FASE 7 — Paneles

### Usuario

- plan y estado;
- cuenta personal u organización;
- miembros e invitaciones, si corresponde;
- próxima renovación y período pagado;
- historial de pagos disponible;
- contenidos y descargas habilitados;
- preferencias editoriales;
- cambio de plan;
- actualización de medio de pago;
- cancelación.

### Administración

- usuarios, cuentas y organizaciones;
- suscripciones por estado;
- pagos y conciliación;
- permisos manuales con vencimiento y motivo;
- webhooks recibidos, duplicados y fallidos;
- emails y eventos;
- reintentos operativos;
- publicación y capacidades de recursos;
- auditoría de acciones administrativas.

Toda acción manual relevante debe registrar administrador, fecha, motivo, estado anterior y estado nuevo.

## FASE 8 — Automatizaciones y conciliación

Implementá de forma idempotente:

- reconciliación diaria Mercado Pago–Supabase;
- transición de cobros fallidos a gracia;
- suspensión al vencer la gracia;
- finalización de cancelaciones;
- expiración de accesos manuales e invitaciones;
- reintento de emails;
- alerta por eventos/webhooks fallidos;
- alerta por inconsistencias;
- control de recursos publicados sin capacidad configurada;
- control de beneficios prometidos aún no publicados;
- resumen operativo periódico si se aprueba.

Protegé cron endpoints con secreto, evitá ejecuciones concurrentes problemáticas y limpiá el historial de `pg_cron` si se utiliza.

## Seguridad obligatoria

- secretos fuera del repositorio y del cliente;
- separación estricta de entornos;
- RLS en tablas expuestas;
- autorización del lado servidor;
- verificación de firmas;
- idempotencia con constraints en base;
- validación de monto, moneda, plan y referencia;
- no almacenar tarjetas ni datos de pago sensibles;
- rate limiting en Auth, checkout y endpoints sensibles;
- protección CSRF/origin cuando corresponda;
- logs sanitizados;
- auditoría administrativa;
- least privilege;
- MFA para cuentas administrativas cuando sea posible;
- backups y procedimiento de restauración;
- rollback de código y migraciones;
- política de privacidad, términos, cancelación y tratamiento de datos marcados para revisión jurídica.

## Pruebas y definición de terminado

Cada fase debe incluir:

- lint;
- typecheck;
- tests unitarios;
- tests de integración;
- tests de RLS;
- build de producción;
- pruebas E2E de recorridos críticos;
- checklist manual cuando una API externa lo requiera;
- evidencia del resultado;
- documentación actualizada.

Recorridos E2E mínimos:

1. registro → cuenta → elección de plan → checkout → webhook verificado → acceso → email;
2. renovación aprobada;
3. renovación rechazada → gracia → recuperación;
4. gracia vencida → suspensión;
5. cancelación al final del período;
6. invitación institucional;
7. recurso privado autorizado y denegado;
8. webhook duplicado y fuera de orden;
9. administrador otorga y revoca acceso manual;
10. reconciliación corrige o alerta una inconsistencia.

No declares una integración “lista” si solo compila. Para cada servicio distinguí:

- configuración presente;
- conexión autenticada;
- operación de prueba exitosa;
- webhook verificado;
- recorrido E2E exitoso;
- listo para producción;
- producción validada.

## Forma de trabajo después de la auditoría

- Trabajá en cambios pequeños y revisables.
- Antes de cada fase, presentá los archivos y migraciones que vas a tocar.
- No mezcles refactors ajenos.
- Conservá cambios preexistentes del usuario.
- No hagas operaciones destructivas sin aprobación explícita.
- No despliegues a producción ni uses credenciales reales hasta que yo lo autorice.
- Mantené un changelog de decisiones.
- Al cerrar cada fase, entregá: cambios, pruebas, pendientes, riesgos y rollback.

Empezá ahora exclusivamente por la **FASE 0 — Auditoría read-only**. Cuando termines sus entregables, detenete.
