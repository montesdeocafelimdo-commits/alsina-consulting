# 09 — Plan de implementación (actualizado con las decisiones aprobadas)

Reemplaza la versión anterior de este documento. Las decisiones citadas como `AD-xx` están en [11-approved-decisions.md](11-approved-decisions.md). No se inicia ninguna fase hasta recibir la aprobación explícita correspondiente — para FASE 1, eso significa recibir literalmente **`APROBAR FASE 1`**.

## Qué cambió respecto del plan anterior

- Los 3 planes ya tienen nombre, slug y precio de fundador cerrados (AD-01/AD-02) — FASE 1 puede modelar `plans`/`plan_prices` sin ambigüedad de nomenclatura, pero **debe empezar por un inventario de renombrado** (ver criterios de aceptación de FASE 1).
- El alta de Concejal **es** el alta a Señal Alsina (AD-04) — esto fusiona lo que el plan anterior trataba como "FASE 1 datos" + "FASE 2 auth" en un único recorrido de usuario a diseñar junto, aunque el trabajo técnico se sigue secuenciando en fases.
- Las cuentas son 1:1 en esta versión (AD-06) — se elimina de esta primera implementación todo el trabajo de invitaciones, roles de organización y miembros múltiples que preveía la FASE 2 original. Los informes institucionales con clave (AD-15) siguen existiendo pero **no** se construyen sobre el modelo de cuentas/planes.
- Mercado Pago pasa a tener reglas operativas completas y cerradas (aniversario, gracia, upgrade/downgrade, cancelación, reembolsos — AD-09 a AD-13), lo que reduce a cero la ambigüedad de diseño de FASE 4, aunque no reduce su complejidad de implementación.
- Se agrega un requisito nuevo, transversal a FASE 5 y FASE 7: nada de "seguridad por CSS/blur" — los datos protegidos no deben llegar nunca al navegador de quien no tiene la capacidad (AD-19). Esto es más estricto que el estado actual (gates cosméticos) y que el prompt maestro original en su literalidad.
- Se agrega el modelo de facturación (AD-08) como pieza nueva, en paralelo a `payments`, con su propia verificación humana (situación fiscal) antes de emitir comprobantes reales.
- Se agrega el rol `partner` (5 socios, solo métricas agregadas con supresión k<5) además de `super_admin` (Felipe) — FASE 7 ya no es "un panel admin", son dos superficies con visibilidad distinta.

---

## FASE 1 — Fundaciones (siguiente fase a aprobar)

### Alcance

1. **Inventario de renombrado (primer paso, antes de tocar esquema)**: listar cada referencia a "Intendente" (gratis)/"Ministro"/"Gobernador" en código (`assets/js/pricing.js`, `assets/js/subscription-compare.js`, `assets/data/publications.js`, `assets/js/informes-library.js`), en la base (`subscriptions.plan`), en `localStorage` de cliente, y en cualquier registro heredado. Documentar el mapeo 1:1 a `concejal`/`intendente`/`gobernador` antes de escribir una sola migración (AD-01).
2. **Modelo de datos** (evolucionando `contacts`/`unlocks`/`purchases`/`subscriptions` donde tenga sentido, sin duplicar — ver [05-data-model-gap-analysis.md](05-data-model-gap-analysis.md)):
   - `profiles`, `accounts` (relación 1:1 con `profiles` en esta versión, AD-06), sin `account_members`/`roles` de organización todavía.
   - `plans` (`concejal`/`intendente`/`gobernador`) y `plan_prices` versionado: importe, moneda, frecuencia, vigencia, `is_founder`, `available_for_new_signups`, `provider_price_id` (AD-01, AD-02, AD-03).
   - `features`/`plan_features`/`resources`/`resource_features` según el catálogo de capacidades de AD-22 (no nombres de plan hardcodeados).
   - `subscriptions` con `account_id`, `plan_id`, `price_version_id`, estado acotado por `CHECK`/enum (`incomplete`, `pending`, `trialing`, `active`, `past_due`, `grace_period`, `suspended`, `cancel_at_period_end`, `canceled`, `refunded`, `disputed`), `anniversary_date`, `paid_through`.
   - `subscription_periods`, `payments`, `payment_provider_events` (idempotencia real — hoy no existe ninguna tabla de este tipo).
   - `invoices` (`pending`/`issued`/`failed`/`cancelled`/`credited`) según AD-08, separada de `payments`.
   - `entitlements` derivados de capacidad, no de nombre de plan.
   - `manual_access_grants`, `email_preferences`, `email_outbox`, `email_events` (bases para FASE 6).
   - `audit_logs` con retención de 10 años para lo financiero/administrativo (AD-16).
3. **Migraciones versionadas reales**: reemplazar el flujo de `supabase-migration.sql` corrido a mano por `supabase/migrations/`, con historial versionado.
4. **Migración de datos heredados** (AD-05): `contacts.confirmed = true` → miembro Concejal heredado, preservando fecha/fuente/consentimiento, sin inventar contraseña, con vínculo de Auth diferido a la primera verificación. `subscriptions`/`purchases` heredados quedan marcados para reconciliación manual, no se leen automáticamente como acceso pago válido.
5. Seeds de desarrollo sin datos reales.
6. Tests de RLS desde el día uno (hoy no hay ninguno).

### Criterios de aceptación de FASE 1

- El inventario de renombrado está documentado y aprobado antes de correr cualquier migración de esquema.
- Ninguna tabla nueva usa `'gobernador'`/`'ministro'`/`'intendente'` como valor mágico disperso en código de aplicación — todo pasa por `plan_id`/capacidades.
- `plan_prices` permite tener, para el mismo plan, una fila `is_founder=true, available_for_new_signups=false` y una fila de precio de lista `available_for_new_signups=true` conviviendo, sin sobrescribirse.
- Existe al menos un test de RLS por tabla sensible (`subscriptions`, `payments`, `invoices`, `audit_logs`) que confirme que `anon` no puede leer ni escribir filas de otra cuenta.
- Los seeds de desarrollo no contienen ningún email, nombre ni dato real de `contacts` existente.
- La migración de `contacts` heredados es reversible: existe un script/consulta que puede deshacer la migración sin pérdida de datos.
- `supabase/migrations/` reemplaza a `supabase-migration.sql` como fuente de verdad versionada; el script anterior queda documentado como histórico, no se borra sin acuerdo explícito.

### Rollback de FASE 1

- Todas las migraciones nuevas son aditivas (nuevas tablas/columnas) — no se modifica ni se borra ninguna tabla existente (`contacts`, `unlocks`, `subscriptions`, `purchases`) en este paso.
- Si la migración de datos heredados (paso 4) produce resultados inesperados, se revierte con el script de deshacer exigido en los criterios de aceptación, sin tocar las tablas originales (que permanecen intactas como fuente de verdad hasta confirmar la migración).
- Ningún cambio de FASE 1 toca `api/*.js` en producción ni cambia el comportamiento del sitio hoy desplegado — es exclusivamente trabajo de esquema y migraciones, revisable y reversible antes de que FASE 2 empiece a leer de las tablas nuevas.

---

## FASE 2 — Autenticación, cuentas y permisos

- Supabase Auth con **magic link** (coherente con AD-04: el alta ya pide solo el email).
- El flujo único de AD-04 (email → magic link → identidad → cuenta → Concejal → Monitor 135 básico → suscripción a Señal Alsina → una sola bienvenida) se implementa como un único endpoint/función, no como dos formularios.
- Cuentas personales 1:1 (AD-06) — sin invitaciones ni organizaciones en esta versión.
- Resolución centralizada de capacidades (AD-22) — reemplaza cualquier futura tentación de leer `plan` directamente.
- Protección de rutas de servidor y de las Vercel Functions existentes.
- Corrección de contenido: el copy de `newsletter.html` sobre la fecha de septiembre (ver [08-decisions-required.md](08-decisions-required.md)) se revisa en esta fase, junto con el equipo editorial, antes de que el flujo de alta cambie de comportamiento.

### Criterios de aceptación

- Un usuario nuevo puede completar el flujo de AD-04 de punta a punta contra `MockPaymentProvider`/sin proveedor de pago (Concejal no usa Mercado Pago).
- Ningún componente de frontend decide acceso por sí mismo — toda decisión de capacidad se resuelve en el servidor.
- Los `contacts` heredados migrados en FASE 1 pueden completar el "primer login" (magic link) y quedar vinculados a su cuenta Concejal preexistente, sin duplicarse.

---

## FASE 3 — Proveedor de pagos y simulador

- `MockPaymentProvider` primero, con los mismos eventos normalizados esperados de Mercado Pago real.
- El simulador debe **fallar al iniciar** (no solo "estar apagado") si se intenta habilitar en un entorno marcado como producción (AD-07, aplicado también al mock).
- `payment_provider_events` desde el arranque de esta fase — no como añadido posterior.
- Diseñar la interfaz `PaymentProvider` conservando lo que ya funciona bien en el código actual: verificación de firma con el SDK oficial (corrigiendo el fallo abierto, AD-07), re-consulta de la entidad real antes de confiar en el payload, nunca otorgar acceso desde `back_urls`.

### Criterios de aceptación

- Los 14 escenarios de simulación que pide el prompt maestro original (alta aprobada, pendiente, rechazada, renovación aprobada/rechazada, gracia y vencimiento, cambio de medio de pago, upgrade/downgrade, cancelación, reembolso, contracargo, webhook duplicado, evento fuera de orden, firma inválida, monto/moneda/referencia/plan incorrecto) tienen un test automatizado contra `MockPaymentProvider`.
- El escenario de gracia/vencimiento sigue exactamente AD-10 (día 0 → `past_due` + aviso 1; día 4 → aviso 2; día 5 → `suspended`, sin aviso 3).
- El escenario de upgrade/downgrade sigue exactamente AD-11 (upgrade inmediato con pago exitoso obligatorio antes de activar; downgrade siempre al próximo aniversario, revertible).

---

## FASE 4 — Mercado Pago real

- Implementar `MercadoPagoProvider` reusando los patrones ya validados del código actual (verificación de firma, re-consulta de entidad, no otorgar acceso desde retorno).
- Intendente y Gobernador requieren configuraciones recurrentes **distintas** en Mercado Pago (AD-03) — evaluar si conviene un Plan ID de MP por nivel en vez de `PreApproval` ad-hoc con monto hardcodeado (ver decisión técnica pendiente de diseño, no de negocio).
- Webhook falla cerrado en producción si falta `MP_WEBHOOK_SECRET` (AD-07) — bloquea el despliegue/activación, no solo loguea.
- Facturación (AD-08): generar `invoices` por cada pago aprobado, con idempotencia — pero **no emitir comprobantes fiscales reales** hasta que la verificación humana de situación fiscal/ARCA esté cerrada (ver [10-production-readiness-checklist.md](10-production-readiness-checklist.md)).
- Pruebas con credenciales/tarjetas de sandbox antes que nada — se puede reusar el runbook de `README-PAGOS.md`.

### Criterios de aceptación

- Ninguna prueba con dinero real corre sin aprobación explícita adicional, separada de `APROBAR FASE 1`.
- El bug de precio único queda erradicado: existe un test que confirma que elegir Intendente cobra el precio de Intendente y elegir Gobernador cobra el de Gobernador, en cualquier combinación de fundador/no fundador.
- Un webhook sin firma válida no produce ningún efecto observable (ni fila nueva, ni email, ni cambio de estado) — con test automatizado, no solo revisión manual.
- Un webhook duplicado (mismo evento reenviado) no reenvía email ni duplica ningún registro — con test automatizado.

---

## FASE 5 — Contenidos protegidos

Alcance definido punto por punto en AD-18, AD-19 y AD-20 — no queda ninguna ambigüedad de producto para esta fase, solo trabajo de implementación:

- **Recatalogar informes** según AD-18: la mayoría de lo que hoy está "gateado cosméticamente" pasa a ser explícitamente público con CTA (Anatomía de la dependencia, Presupuesto e Impositiva, El fin de una era, Radiografía del Estado). Solo **PBG Municipal** y **Un empleo cada 23 vecinos** quedan detrás de Gobernador real — este último es un cambio de estado respecto de hoy (hoy es público, pasa a requerir Gobernador) y debe coordinarse con el equipo editorial antes de tocar la página, porque implica retirar contenido ya publicado y reemplazarlo por una portada/adelanto.
- **Balance fiscal, Recaudación tributaria, Transferencias a municipios** pasan a requerir Intendente o superior — la nota y su herramienta interactiva se gatean juntas; la base CSV subyacente pasa a requerir Gobernador específicamente (hoy es una descarga pública sin ningún control).
- **Monitor 135** implementa la tabla completa de AD-19: los JSON dejan de ser estáticos públicos, se sirven por endpoint autenticado devolviendo solo los campos autorizados; "consulta municipal" tiene versión resumida (Concejal) y completa (Intendente/Gobernador); descarga/exportación de bases queda exclusiva de Gobernador.
- **Radar Fiscal PBA** (AD-20): se renombra el módulo interno del Monitor a "Indicadores fiscales municipales" para no confundirlo con la app pública; los CSV crudos de la app standalone dejan de ser accesibles por URL directa.
- Generalizar el patrón ya validado de `middleware.js` + endpoint validador (hoy usado para Olavarría/Exaltación de la Cruz) para servir contenido por capacidad en vez de por clave estática, reforzando los requisitos de seguridad de AD-15 para el caso institucional que sigue existiendo en paralelo.

### Criterios de aceptación

- Ningún test de "inspeccionar HTML/JSON servido a un usuario sin la capacidad requerida" encuentra el contenido protegido — ni completo, ni parcial, ni "tapado con CSS".
- El dataset de Monitor 135 responde distinto según la capacidad del pedido autenticado (verificable con al menos 3 cuentas de prueba: Concejal, Intendente, Gobernador).
- Los CSV de Radar Fiscal PBA devuelven 404 (o equivalente) por acceso directo sin pasar por el endpoint autorizado.

---

## FASE 6 — Resend completo

- Remitentes separados según AD-14 (`newsletter@alsinaar.com` editorial / `info@alsinaar.com` transaccional), configuración centralizada.
- Outbox con reintentos, reemplazando el envío síncrono actual.
- Webhook de Resend (rebotes/quejas/bajas) — hoy inexistente.
- `email_preferences` separa baja editorial de comunicaciones necesarias, tal como exige AD-04.

---

## FASE 7 — Paneles

- **Panel de usuario**: plan y estado, próxima renovación, historial de pagos/facturas, contenidos habilitados según capacidad, cambio de plan, actualización de medio de pago, cancelación autoservicio (AD-12).
- **Panel de administración — dos superficies distintas** (AD-17):
  - `super_admin` (Felipe): acceso operativo completo, con MFA.
  - `partner` (5 socios): solo vistas/endpoints agregados reales (no frontend-only), con supresión de segmentos <5 registros, sin acceso a PII, pagos individuales, facturas, webhooks ni secretos. MFA obligatorio también para este rol.

### Criterios de aceptación

- Existe al menos un endpoint que, llamado con credenciales `partner`, devuelve un error o un conjunto vacío ante un intento de leer un registro individual (no solo el frontend lo oculta).
- Un segmento con menos de 5 registros se agrupa o se omite en toda vista `partner`, verificable con un caso de prueba concreto.

---

## FASE 8 — Automatizaciones y conciliación

- Cron de gracia/suspensión siguiendo exactamente AD-10 (día 0/4/5).
- Reconciliación diaria Mercado Pago–Supabase.
- Tareas de depuración de retención según AD-16 (con registro de ejecución).
- Expiración de accesos manuales.
- Alertas por webhooks fallidos/duplicados.

---

## Riesgos vigentes

- El cambio de estado de "Un empleo cada 23 vecinos" (de público a Gobernador) es una decisión ya aprobada pero de alto impacto editorial/de producto — coordinar el momento exacto de aplicarlo con quien gestiona la publicación, para no retirar contenido ya indexado/compartido sin aviso.
- La emisión de facturas fiscales reales sigue bloqueada por una verificación humana externa (situación fiscal/ARCA) — FASE 4 puede completarse técnicamente sin que esa pieza esté lista, pero no se factura de verdad hasta cerrarla.
- El volumen real de trabajo de FASE 1 (modelo de datos completo + migración de datos heredados + inventario de renombrado) sigue siendo la mayor incertidumbre de esfuerzo del plan, aunque ya no tiene incertidumbre de alcance.
