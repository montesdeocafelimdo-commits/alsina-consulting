# 11 — Decisiones aprobadas por Alsina

Fuente: `docs/subscriptions-audit/Alsina_Decisiones_Suscripciones_Consolidadas.md`, aprobado por Alsina. Este documento es la versión de referencia estable de esas decisiones — cada una queda identificada con un ID (`AD-01`…`AD-23`) para que el resto de los documentos de esta carpeta (`08`, `09`, `10-*`) puedan citarlas en vez de repetirlas. **No se modificó código, infraestructura ni variables de entorno para producir este documento.**

Estas decisiones ya no se presentan como preguntas — quedan registradas como reglas de negocio aprobadas, salvo donde el propio texto original marca una verificación humana pendiente (fiscal, DNS, credenciales reales), que se conserva como tal en [08-decisions-required.md](08-decisions-required.md) y [10-production-readiness-checklist.md](10-production-readiness-checklist.md).

---

## AD-01 — Planes, nombres y precios definitivos

Tres planes:

| Slug canónico | Nombre visible | Precio mensual final |
|---|---|---:|
| `concejal` | Concejal | ARS 0 |
| `intendente` | Intendente | ARS 25.000 |
| `gobernador` | Gobernador | ARS 45.000 |

Mapeo aprobado desde los nombres actuales del código:

| Nombre actual en el repo | Nombre nuevo |
|---|---|
| "Intendente" (gratis) | Concejal |
| "Ministro" | Intendente |
| "Gobernador" | Gobernador |

**Antes de renombrar en código**: inventariar todas las referencias existentes (código, base, formularios, URLs, analytics, `localStorage`, registros heredados). No reinterpretar silenciosamente datos históricos. Diseñar una migración o una capa de compatibilidad temporal, documentada explícitamente.

## AD-02 — Precios fundadores y versiones de precio

Los tres valores iniciales (`$0` / `$25.000` / `$45.000`) se comunican como **precios de fundadores**. No publicar fecha de lanzamiento hasta que Alsina la confirme explícitamente.

- El precio fundador se conserva **indefinidamente** mientras la cuenta mantenga el mismo plan y la suscripción siga activa.
- Un aumento futuro de precio de lista aplica solo a **nuevas** contrataciones.
- Se crean **nuevas versiones de precio**; nunca se sobrescribe una versión histórica.
- Los precios anteriores dejan de estar disponibles para altas nuevas, pero siguen vigentes para quien ya los tenía.
- Un pago rechazado, `past_due`, período de gracia, error técnico o suspensión recuperable **no elimina** el precio fundador.
- Un cambio de plan usa el precio vigente del plan de destino y **termina** el precio fundador anterior.
- Una cancelación efectiva **termina** el precio fundador.
- Quien vuelve después de cancelar contrata al precio vigente en ese momento (no recupera el fundador).
- **No crear un plan técnico `founder`**: "fundador" es una condición de la versión de precio contratada, no un cuarto plan.

## AD-03 — Fuente canónica de precios

Los importes **no pueden** quedar hardcodeados en `api/checkout.js` ni aceptarse desde el frontend. El backend recibe un identificador de plan, busca la versión de precio activa en base, y usa el identificador correspondiente del proveedor. Cada suscripción conserva una referencia inmutable a la versión de precio aceptada.

El modelo de precios debe contemplar como mínimo: plan, importe, moneda, frecuencia, vigencia, condición fundadora, disponibilidad para nuevas altas, identificador del proveedor.

Intendente y Gobernador requieren **configuraciones recurrentes distintas** en Mercado Pago. **Concejal no usa Mercado Pago ni pasa por `/api/checkout`** — es un alta sin cobro.

## AD-04 — Señal Alsina y Concejal son una sola suscripción comercial

> Suscribirse a Señal Alsina equivale a crear el plan Concejal.

No construir dos formularios ni dos recorridos distintos. Flujo único de alta:

1. El usuario ingresa su email.
2. Confirma mediante magic link.
3. Se crea o vincula su identidad de Supabase Auth.
4. Se crea su cuenta personal.
5. Se le asigna Concejal.
6. Se habilita Monitor 135 básico.
7. Se registra su suscripción a Señal Alsina.
8. Se envía una única bienvenida.

Aunque el alta sea única, **internamente se mantienen estados separados**: identidad, plan/permisos, y preferencias editoriales. Si alguien se desuscribe de los emails editoriales, conserva su cuenta Concejal y Monitor 135 básico — los mensajes imprescindibles de seguridad, cuenta y pagos siguen siendo transaccionales, nunca dependen de la preferencia editorial.

Toda la web debe impulsar la creación de Concejal mediante CTAs claros, adelantos y funciones bloqueadas visibles — **sin patrones engañosos** (dark patterns).

## AD-05 — Migración de contactos existentes

Los registros heredados con `contacts.confirmed = true` se consideran comercialmente **miembros Concejal heredados**:

- No pedirles una segunda suscripción.
- Preservar fecha y fuente originales.
- Mantener el consentimiento editorial ya confirmado.
- No inventar contraseñas.
- Vincular su identidad de Supabase Auth recién cuando verifiquen su email o usen el magic link por primera vez.
- Quien todavía no activó Auth **puede seguir recibiendo** Señal Alsina, pero **no entra al Monitor** hasta verificar su identidad.

`unlocks` se conserva como historial únicamente — **no se convierte automáticamente** en consentimiento editorial. `subscriptions` y `purchases` heredados **deben reconciliarse manualmente** antes de reconocer cualquier acceso pago a partir de ellos.

## AD-06 — Cuentas individuales (sin equipos en v1)

Los tres planes son **individuales**: Concejal, Intendente y Gobernador son, cada uno, para una sola persona. Cada identidad de Auth se vincula con una cuenta personal y un plan principal. **No implementar equipos, invitaciones, asientos ni precios por miembro en esta primera versión.**

`accounts` puede conservarse como abstracción para separar identidad/facturación/suscripción, pero la relación inicial es estrictamente 1:1.

Las claves compartidas de informes institucionales (AD-15) son una excepción aparte y **no consumen asientos** de ningún plan.

## AD-07 — Seguridad de Mercado Pago: fallar cerrado

Mercado Pago debe **fallar cerrado en producción**. Si el entorno es producción, `PAYMENTS_ENABLED=true` y falta `MP_WEBHOOK_SECRET`, hay que **bloquear la activación de pagos o el despliegue correspondiente** — no continuar con un warning como hace el código actual ([api/webhook.js:12-17](../../api/webhook.js#L12-L17)).

Para cada webhook:

1. Obtener el cuerpo original.
2. Validar la firma antes de confiar en el contenido.
3. Rechazar firmas ausentes o inválidas **sin producir ningún efecto**.
4. Procesar de forma idempotente.
5. Evitar pagos, accesos, emails o automatizaciones duplicados.
6. Conservar un registro sanitizado del evento.

La URL de retorno **nunca** concede acceso — esto ya se cumple hoy y se mantiene. El acceso depende exclusivamente del webhook verificado, la consulta al proveedor cuando corresponda, y el procesamiento idempotente.

`MockPaymentProvider` puede usarse en desarrollo y debe estar **técnicamente bloqueado** (falla al iniciar, no solo "no configurado") si se intenta habilitar en producción.

## AD-08 — Precios finales, impuestos y facturación

ARS 25.000 y ARS 45.000 son precios **finales para el cliente**, impuestos incluidos. No agregar IVA ni cargos después de elegir el plan.

Cada pago aprobado genera una obligación de facturación. **El comprobante de Mercado Pago no es automáticamente la factura fiscal de Alsina.**

Modelo de facturas a preparar, con estados `pending`, `issued`, `failed`, `cancelled`, `credited` — una sola factura por pago aprobado, con idempotencia. Los reembolsos contemplan nota de crédito.

**Antes de emitir comprobantes reales**, se requiere verificación humana con el responsable contable sobre: situación fiscal de Alsina, CUIT emisor, tipo de factura, punto de venta, tratamiento de IVA, credenciales y mecanismo de ARCA, procedimiento de notas de crédito. **No inventar credenciales ni emitir facturas fiscales reales antes de esa validación** — queda en [10-production-readiness-checklist.md](10-production-readiness-checklist.md).

## AD-09 — Fecha aniversario y prueba gratuita

Las suscripciones pagas cobran por **fecha aniversario**:

- El primer cobro se realiza al contratar; el acceso empieza cuando ese cobro queda aprobado.
- La fecha de contratación se vuelve el aniversario.
- En meses sin el mismo número de día, respetar el comportamiento ya documentado y probado de Mercado Pago (no inventar una regla propia).
- Mostrar fechas en `America/Argentina/Buenos_Aires`.
- Mercado Pago ejecuta la recurrencia — **Alsina no cobra tarjetas mediante un cron propio**.

Intendente y Gobernador **no tienen prueba gratuita**. Concejal cumple la función de entrada sin costo.

## AD-10 — Pago rechazado, gracia y avisos

Gracia de **5 días corridos**, con **solo 2 avisos**:

| Día | Estado | Acción |
|---|---|---|
| 0 | `past_due` | Mantener acceso, enviar primer aviso |
| 4 | `past_due` | Enviar segundo y último aviso, informando suspensión en 24 horas |
| 5 | `suspended` | Retirar permisos pagos, mantener Concejal, **sin** un tercer aviso |

Un webhook duplicado o un nuevo rechazo de la **misma** renovación no reinicia la gracia ni duplica emails. Si el pago se recupera antes de una cancelación definitiva, se restaura el plan y **se conserva el precio fundador** — la suspensión no equivale automáticamente a cancelación.

## AD-11 — Upgrade y downgrade

**Upgrade Intendente → Gobernador — inmediato:**

1. Mostrar y confirmar el precio vigente de Gobernador.
2. Informar que se cobrará el importe completo.
3. Informar que no hay crédito ni devolución por el período restante de Intendente.
4. Esperar la aprobación real del nuevo pago.
5. Activar Gobernador.
6. Detener la renovación anterior.
7. La fecha del upgrade se vuelve el nuevo aniversario.

Si el nuevo pago falla, **no se modifica** plan, permisos, precio ni aniversario existentes.

**Downgrade** (Gobernador→Intendente, Gobernador→Concejal, Intendente→Concejal) — **al próximo aniversario**:

- Se mantiene el plan actual hasta terminar el período ya pagado.
- No hay devolución proporcional.
- Se muestra y registra el precio del plan destino, aceptado al momento de solicitar el cambio.
- Se puede **revertir** el downgrade antes de su fecha efectiva.

## AD-12 — Cancelación

Se aplica al **final del período ya pagado**, sin devolución proporcional:

- Se detienen las renovaciones futuras.
- Se mantiene el acceso hasta `paid_through`.
- Se genera un código de cancelación.
- Se envía confirmación con la fecha efectiva.
- Se puede **revertir** antes de que sea efectiva, conservando plan, aniversario y precio fundador.
- Al hacerse efectiva: pasa a Concejal y **termina** el precio fundador pago.
- Una contratación posterior usa el precio vigente y crea un nuevo aniversario.

La baja **debe ser autoservicio** — sin llamada, documentación ni contacto comercial. La implementación debe contemplar y **señalar para revisión legal** el botón de arrepentimiento y los derechos aplicables a contratación online (queda en verificación jurídica, ver [10-production-readiness-checklist.md](10-production-readiness-checklist.md)).

## AD-13 — Reembolsos y contracargos

- Cancelación normal: sin devolución proporcional.
- **Devolución total** cuando corresponda: cobro duplicado, importe incorrecto, cobro posterior a una baja ya efectiva, derecho de arrepentimiento aplicable, o imposibilidad comprobable de prestar el servicio.
- Otros casos: revisión manual.
- Todo reembolso se procesa desde backend, con idempotencia, auditoría, verificación contra Mercado Pago y documentación contable.

Ante un contracargo: marcar el pago `disputed`, suspender temporalmente el acceso pago, mantener Concejal, alertar al administrador, conservar la evidencia necesaria. Si se resuelve a favor de Alsina: restaurar plan y precio fundador. Si se resuelve a favor del usuario: cancelar la suscripción paga, mantener Concejal, terminar el precio fundador.

## AD-14 — Remitentes y tono de email

| Canal | Remitente aprobado |
|---|---|
| Editorial (Señal Alsina, con baja) | `Señal Alsina <newsletter@alsinaar.com>` |
| Transaccional (Auth, onboarding, seguridad, pagos, suscripciones, cancelaciones, información contractual) | `Alsina <info@alsinaar.com>` |

Crear configuración centralizada de remitentes — **no hardcodear** en múltiples funciones (hoy `newsletter@alsinaar.com` está repetido en 3 archivos, ver [04-current-integrations.md](04-current-integrations.md)).

Tono: claro, humano, institucional sin ser burocrático, breve, directo, en castellano rioplatense. Evitar jerga, amenazas, urgencia falsa y promociones dentro de emails críticos.

Antes de producción: verificar que ambas casillas existan y reciban respuestas, que el dominio esté validado en Resend, y que SPF/DKIM/DMARC estén correctamente configurados (verificación humana, ver checklist).

## AD-15 — Informes institucionales con clave compartida

Olavarría, Exaltación de la Cruz y futuros informes por contrato **siguen fuera de los planes**. Cada cliente recibe una clave específica de su informe y puede compartirla con quienes quiera — no se exigen cuentas individuales ni se limitan miembros.

Requisitos de las claves:

- Generarse de forma segura.
- Almacenarse **solo como hash**.
- No aparecer en URLs.
- Poder rotarse y revocarse.
- Tener rate limiting.
- Crear una sesión firmada, `HttpOnly`, `Secure`, limitada al recurso.
- Proteger también archivos y descargas asociadas desde el backend.

Inventariar las claves existentes. Si los valores hoy documentados en `.env.example` son placeholders o estuvieron expuestos, **rotarlos antes de producción**. No modificar secretos sin verificación humana del entorno correcto.

## AD-16 — Retención y ubicación de registros

Supabase Postgres es la **fuente canónica**. Supabase Storage privado conserva documentos; Vercel mantiene logs técnicos operativos; Mercado Pago y Resend son fuentes de contraste, **no el único historial**.

| Información | Conservación |
|---|---:|
| Facturas, pagos, reembolsos, notas de crédito | 10 años |
| Historial de suscripciones y precios | 10 años |
| Auditoría financiera administrativa | 10 años |
| Payloads sanitizados de webhooks | 180 días |
| Eventos financieros normalizados | 10 años |
| Accesos y descargas | 12 meses |
| Eventos de entrega, rebote y apertura | 12 meses |
| Consentimientos y bajas editoriales | Vida de la cuenta + 5 años |
| Logs técnicos generales | 90 días |
| Seguridad y autenticación | 12 meses |

Los PDF fiscales se guardan en bucket privado; el usuario accede por URL firmada temporal. Implementar tareas de depuración periódica y registrar su ejecución. Antes de producción: definir backups automáticos, exportación cifrada separada y una prueba real de restauración (verificación humana).

## AD-17 — Administración interna

Seis usuarios administrativos:

- **Felipe** — único `super_admin`, facultades operativas completas.
- **Cinco socios** — rol técnico `partner`, mostrado como "Socio" o "Propietario".

`partner` solo accede a **métricas agregadas**: no ve nombres, emails, CUIT, pagos individuales, facturas, webhooks, claves, secretos ni registros personales. No modifica precios, suscripciones, reembolsos, accesos, roles ni configuración.

Crear endpoints/vistas agregadas **reales** — no ocultar datos solo en frontend. Suprimir o agrupar segmentos con menos de 5 registros para evitar reidentificación (k-anonimato).

Exigir cuentas separadas y **MFA** a los 6 administradores. No usar contraseñas compartidas. Verificar roles en backend/RLS y auditar cada acción administrativa.

## AD-18 — Matriz definitiva de notas e informes

| Recurso | Acceso aprobado |
|---|---|
| Un empleo cada 23 vecinos | Gobernador |
| 2027 empieza ahora | Público |
| Anatomía de la dependencia | Público; retirar gate y agregar CTA a Concejal |
| Presupuesto e Impositiva PBA 2026 | Público, informe muestra |
| El fin de una era | Público, contenido insignia con CTA |
| Radiografía del Estado PBA | Público, contenido de captación |
| PBG Municipal PBA 2021–2023 | Gobernador |
| Balance fiscal 1S 2026 | Intendente y Gobernador |
| Herramienta de Balance fiscal | Intendente y Gobernador |
| Base CSV de Balance fiscal | Solo Gobernador |
| Recaudación tributaria PBA | Intendente y Gobernador |
| Transferencias a municipios | Intendente y Gobernador |
| Mapa político PBA | Público |
| Súper RIGI app | Público; mantener la nota archivada fuera del listado |
| Informes territoriales por cliente | Clave institucional, fuera de planes |

Para contenido Gobernador que hoy es público, conservar una portada o introducción breve si sirve comercialmente, pero **no entregar el cuerpo completo, la herramienta ni los datos protegidos al navegador sin autorización**. El sistema usa capacidades, no comparaciones rígidas con nombres de plan.

## AD-19 — Monitor 135 definitivo

Un visitante sin cuenta ve un adelanto y CTA a Concejal (hoy la página es 100% pública sin esto).

| Función | Concejal | Intendente | Gobernador |
|---|---|---|---|
| Ingreso a Monitor 135 | Sí | Sí | Sí |
| Indicadores principales | Sí | Sí | Sí |
| Resumen electoral, fiscal y productivo | Sí | Sí | Sí |
| Consulta municipal | Resumida | Completa | Completa |
| Indicadores avanzados | Bloqueados | Sí | Sí |
| Comparación entre municipios | Bloqueada | Sí | Sí |
| Descarga de bases | Bloqueada | Bloqueada | Sí |
| Exportación de datos | Bloqueada | Bloqueada | Sí |

Los niveles inferiores **ven** las funciones/indicadores bloqueados, con nombre, explicación, candado, plan requerido y CTA — pero **el navegador nunca recibe el valor o dataset protegido**: no implementar seguridad mediante blur/CSS sobre datos ya descargados (defecto real de la implementación actual, ver [05-data-model-gap-analysis.md](05-data-model-gap-analysis.md) hallazgo D6 en la matriz previa).

Los JSON completos (`assets/data/monitor135-municipios.json`, `assets/data/monitor135-educacion.json`) **dejan de ser archivos estáticos públicos**. El acceso se mueve detrás de endpoints autenticados que devuelven solamente los campos autorizados por capacidad.

`Tableros comparativos intermunicipales` se integra con "Comparación entre municipios" — no se promete como producto separado.

## AD-20 — Radar Fiscal

La herramienta standalone se llama **Radar Fiscal PBA**:

- Es pública.
- Es **el mismo producto** que la promesa "Radar tributario de la Provincia" — se elimina esa promesa como beneficio exclusivo de Gobernador (ya está incluida, gratis, en Radar Fiscal PBA).
- El módulo interno del Monitor 135 se renombra a **Indicadores fiscales municipales** (para no confundirse con Radar Fiscal PBA).
- **Los CSV crudos de Radar Fiscal PBA dejan de ser accesibles por URL pública** (hoy lo son: `radar-fiscal/data/metricas-anuales.csv`, `radar-fiscal/data/recaudacion-tributaria.csv`).
- La visualización en sí permanece pública.
- No se ofrece descarga ni exportación de sus datos crudos.

## AD-21 — Beneficios no implementados: qué queda y qué se retira

- **Retirar** `Informe legislativo mensual` como beneficio.
- **Retirar** `Radar regulatorio y legislativo sectorial` como beneficio.
- **Mantener** `Acceso anticipado a nuevos productos` para Gobernador.
- **Mantener** `Archivo completo de informes` para Gobernador.
- **Mantener como capacidad futura** (sin prometer ni mostrar todavía) la descarga de informes en PDF para Intendente y Gobernador — recién se promete cuando esté implementada y protegida.
- **Eliminar** `Radar tributario provincial` como promesa separada — se unifica con Radar Fiscal PBA público (AD-20).
- No vender como beneficio ninguna funcionalidad indefinida o inexistente.

## AD-22 — Catálogo de capacidades

El catálogo de capacidades técnicas de [10-access-decision-matrix.md](10-access-decision-matrix.md) debe ajustarse a estas decisiones y permitir distinguir, como mínimo: recepción editorial, notas públicas, informes estándar, informes premium, archivo histórico, descarga de informes, Monitor básico, Monitor completo, exportación de Monitor, visualizaciones públicas, acceso anticipado, informes institucionales por clave.

Los recursos declaran capacidades y los planes conceden capacidades. **No dispersar reglas como `plan === 'gobernador'` por el código.**

## AD-23 — Verificaciones humanas que permanecen abiertas

No son decisiones comerciales pendientes — son verificaciones externas que ninguna decisión de negocio puede resolver por sí sola:

- Plan contratado y configuración real de Supabase.
- Plan contratado y configuración real de Vercel.
- Plan contratado y configuración real de Resend.
- Dominio y DNS.
- Backups y prueba de restauración.
- Credenciales reales y de prueba de Mercado Pago.
- Creación y asociación de planes de Mercado Pago.
- Secreto de webhooks.
- Situación fiscal y facturación ARCA.
- Creación y recepción de `info@alsinaar.com`.
- Rotación de claves institucionales.
- Revisión jurídica de términos, privacidad, cancelación y arrepentimiento.

Ver el listado operativo completo, con la ruta exacta de cada verificación, en [10-production-readiness-checklist.md](10-production-readiness-checklist.md).
