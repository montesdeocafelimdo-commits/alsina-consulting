# ALSINA — Decisiones consolidadas de suscripciones, pagos y accesos

## Instrucción para Claude Code

Leé completamente, antes de actuar:

- `docs/subscriptions-audit/00-executive-summary.md`
- `docs/subscriptions-audit/01-account-and-environment-matrix.md`
- `docs/subscriptions-audit/02-routes-and-resources-inventory.md`
- `docs/subscriptions-audit/03-access-matrix.md`
- `docs/subscriptions-audit/04-current-integrations.md`
- `docs/subscriptions-audit/05-data-model-gap-analysis.md`
- `docs/subscriptions-audit/06-security-and-rls-audit.md`
- `docs/subscriptions-audit/07-billing-and-capacity-review.md`
- `docs/subscriptions-audit/08-decisions-required.md`
- `docs/subscriptions-audit/09-implementation-plan.md`
- `docs/subscriptions-audit/10-production-readiness-checklist.md`
- `docs/subscriptions-audit/10-access-decision-matrix.md`

Este documento contiene las decisiones aprobadas por Alsina después de la auditoría. Ya no deben presentarse como preguntas pendientes.

## Compuerta obligatoria: documentación antes que código

En esta ejecución:

1. No modifiques código de producción.
2. No ejecutes migraciones.
3. No crees recursos externos.
4. No cambies variables de entorno.
5. No despliegues nada.
6. No actives pagos.

Primero:

1. Creá `docs/subscriptions-audit/11-approved-decisions.md` con todas las decisiones de este documento, preservando su significado exacto.
2. Actualizá `08-decisions-required.md` para marcar como resueltas estas decisiones y dejar únicamente verificaciones humanas reales.
3. Actualizá `09-implementation-plan.md` para que el orden de trabajo y los criterios de aceptación sean compatibles con estas decisiones.
4. Actualizá `10-access-decision-matrix.md` con la matriz definitiva aprobada.
5. Actualizá `10-production-readiness-checklist.md` con las verificaciones externas que todavía correspondan.
6. Mostrá un resumen de los cambios documentales, los supuestos eliminados y los bloqueantes humanos restantes.
7. Detenete. No empieces FASE 1 hasta recibir literalmente `APROBAR FASE 1`.

---

## 1. Planes, nombres y precios definitivos

El modelo definitivo tiene tres planes:

| Slug canónico | Nombre visible | Precio mensual final |
|---|---|---:|
| `concejal` | Concejal | ARS 0 |
| `intendente` | Intendente | ARS 25.000 |
| `gobernador` | Gobernador | ARS 45.000 |

El código actual utiliza otros nombres. El mapeo aprobado es:

| Nombre actual | Nombre nuevo |
|---|---|
| Intendente gratis | Concejal |
| Ministro | Intendente |
| Gobernador | Gobernador |

Antes de renombrar, inventariar referencias en código, base, formularios, URLs, analytics, `localStorage` y registros heredados. No reinterpretar silenciosamente información histórica. Diseñar una migración o compatibilidad temporal documentada.

## 2. Precios fundadores y versiones de precio

Los tres valores iniciales se comunicarán como **precios de fundadores**.

- Concejal fundador: ARS 0.
- Intendente fundador: ARS 25.000 mensuales.
- Gobernador fundador: ARS 45.000 mensuales.

No publicar una fecha de lanzamiento hasta que Alsina la confirme.

El precio fundador se conserva indefinidamente mientras el usuario mantenga el mismo plan y la misma suscripción activa.

- Un aumento futuro se aplica solo a nuevas contrataciones.
- Crear nuevas versiones de precio; nunca sobrescribir precios históricos.
- Los precios anteriores dejan de estar disponibles para nuevas altas, pero siguen vigentes para suscripciones existentes.
- Un pago rechazado, `past_due`, período de gracia, error técnico o suspensión recuperable no elimina el precio fundador.
- Un cambio de plan utiliza el precio vigente del plan de destino y termina el beneficio anterior.
- Una cancelación efectiva termina el precio fundador.
- Si el usuario vuelve después de cancelar, contrata al precio vigente.

No crear un cuarto plan técnico llamado `founder`. Fundador es una condición de la versión de precio contratada.

## 3. Fuente canónica de precios

Los importes no pueden quedar hardcodeados en `api/checkout.js` ni aceptarse desde el frontend.

El backend recibe un identificador de plan, busca la versión de precio activa y utiliza el identificador correcto del proveedor. Cada suscripción conserva una referencia inmutable a la versión aceptada.

El modelo de precios debe contemplar, como mínimo:

- plan;
- importe;
- moneda;
- frecuencia;
- vigencia;
- condición fundadora;
- disponibilidad para nuevas altas;
- identificador del proveedor.

Intendente y Gobernador requieren configuraciones recurrentes diferentes en Mercado Pago. Concejal no utiliza Mercado Pago ni pasa por `/api/checkout`.

## 4. Señal Alsina y Concejal son una sola suscripción comercial

Desde la experiencia del usuario:

> Suscribirse a Señal Alsina equivale a crear el plan Concejal.

No construir dos formularios ni dos recorridos.

Para un usuario nuevo:

1. Ingresa su email.
2. Confirma mediante magic link.
3. Se crea o vincula su identidad de Supabase Auth.
4. Se crea su cuenta personal.
5. Se asigna Concejal.
6. Se habilita Monitor 135 básico.
7. Se registra su suscripción a Señal Alsina.
8. Se envía una única bienvenida.

Aunque el alta sea única, conservar internamente estados separados para identidad, plan/permisos y preferencias editoriales. Si alguien se desuscribe de los emails editoriales, conserva su cuenta Concejal y Monitor 135 básico. Los mensajes imprescindibles de seguridad, cuenta y pagos siguen siendo transaccionales.

Toda la web debe impulsar la creación de Concejal mediante CTAs claros, adelantos y funciones bloqueadas, sin patrones engañosos.

## 5. Migración de contactos existentes

Los registros heredados con `contacts.confirmed = true` deben considerarse comercialmente miembros Concejal heredados.

- No pedirles una segunda suscripción.
- Preservar fecha y fuente originales.
- Mantener el consentimiento editorial confirmado.
- No inventar contraseñas.
- Vincular Supabase Auth cuando verifiquen su email o utilicen el magic link.
- Quien todavía no haya activado Auth puede seguir recibiendo Señal Alsina, pero no entra al Monitor hasta verificar su identidad.

Los `unlocks` se conservan como historial y no se convierten automáticamente en consentimiento editorial. `subscriptions` y `purchases` heredados deben reconciliarse antes de reconocer accesos pagos.

## 6. Cuentas individuales

Todos los planes son individuales:

- Concejal: una persona.
- Intendente: una persona.
- Gobernador: una persona.

Cada identidad de Auth se vincula con una cuenta personal y un plan principal. No implementar equipos, invitaciones, asientos ni precios por miembro en la primera versión.

Se puede conservar `accounts` como abstracción para separar identidad, facturación y suscripción, pero la relación inicial es 1:1.

Las claves compartidas de informes institucionales son una excepción separada y no consumen asientos.

## 7. Seguridad de Mercado Pago

Mercado Pago debe fallar cerrado en producción.

Si el entorno es producción, `PAYMENTS_ENABLED=true` y falta `MP_WEBHOOK_SECRET`, bloquear la activación de pagos o el despliegue correspondiente. No continuar con un warning.

Para cada webhook:

1. Obtener el cuerpo original.
2. Validar la firma antes de confiar en el contenido.
3. Rechazar firmas ausentes o inválidas sin producir efectos.
4. Procesar de forma idempotente.
5. Evitar pagos, accesos, emails o automatizaciones duplicados.
6. Conservar un registro sanitizado.

La URL de retorno nunca concede acceso. El acceso depende del webhook verificado, la consulta al proveedor cuando corresponda y el procesamiento idempotente.

`MockPaymentProvider` puede utilizarse en desarrollo y debe estar técnicamente bloqueado en producción.

## 8. Precios finales, impuestos y facturación

ARS 25.000 y ARS 45.000 son precios finales para el cliente e incluyen los impuestos aplicables. No agregar IVA ni cargos después de seleccionar el plan.

Cada pago aprobado genera una obligación de facturación. El comprobante de Mercado Pago no se considera automáticamente la factura fiscal de Alsina.

Preparar un modelo de facturas con estados como `pending`, `issued`, `failed`, `cancelled` y `credited`. Una sola factura por pago aprobado, con idempotencia. Los reembolsos deben contemplar nota de crédito.

Antes de emitir comprobantes reales se requiere verificación humana con el responsable contable sobre:

- situación fiscal de Alsina;
- CUIT emisor;
- tipo de factura;
- punto de venta;
- tratamiento de IVA;
- credenciales y mecanismo de ARCA;
- procedimiento de notas de crédito.

No inventar credenciales ni emitir facturas fiscales reales antes de esa validación.

## 9. Fecha aniversario y prueba gratuita

Las suscripciones pagas cobran por fecha aniversario.

- El primer cobro se realiza al contratar.
- El acceso comienza cuando queda aprobado.
- La fecha de contratación se convierte en aniversario.
- En meses sin el mismo número de día, respetar el comportamiento documentado y probado de Mercado Pago.
- Mostrar fechas en `America/Argentina/Buenos_Aires`.
- Mercado Pago ejecuta la recurrencia; Alsina no cobra tarjetas mediante un cron propio.

Intendente y Gobernador no tienen prueba gratuita. Concejal cumple la función de entrada sin costo.

## 10. Pago rechazado, gracia y avisos

Aplicar cinco días corridos de gracia y solo dos avisos:

- Día 0: pasar a `past_due`, mantener acceso y enviar primer aviso.
- Día 4: enviar segundo y último aviso; informar suspensión en 24 horas.
- Día 5: pasar a `suspended`, retirar permisos pagos y mantener Concejal. No enviar un tercer aviso.

Un webhook duplicado o un nuevo rechazo de la misma renovación no reinicia la gracia ni duplica emails.

Si el pago se recupera antes de una cancelación definitiva, restaurar el plan y conservar el precio fundador. La suspensión no equivale automáticamente a cancelación.

## 11. Upgrade y downgrade

### Upgrade Intendente a Gobernador

Es inmediato:

1. Mostrar y confirmar el precio vigente de Gobernador.
2. Informar que se cobrará el importe completo.
3. Informar que no hay crédito ni devolución por el período restante de Intendente.
4. Esperar aprobación real del nuevo pago.
5. Activar Gobernador.
6. Detener la renovación anterior.
7. La fecha del upgrade se convierte en nuevo aniversario.

Si el nuevo pago falla, no modificar plan, permisos, precio ni aniversario existentes.

### Downgrade

Gobernador a Intendente, Gobernador a Concejal o Intendente a Concejal se aplican al próximo aniversario.

- Mantener el plan actual hasta finalizar el período pagado.
- No devolver proporcionalmente.
- Mostrar y registrar el precio del destino aceptado al solicitar el cambio.
- Permitir revertir el downgrade antes de su fecha efectiva.

## 12. Cancelación

La cancelación se aplica al final del período ya pagado y no genera devolución proporcional.

- Detener renovaciones futuras.
- Mantener acceso hasta `paid_through`.
- Generar un código de cancelación.
- Enviar confirmación con fecha efectiva.
- Permitir revertirla antes de que sea efectiva y conservar plan, aniversario y precio fundador.
- Al hacerse efectiva, pasar a Concejal y terminar el precio fundador pago.
- Una contratación posterior usa el precio vigente y crea nuevo aniversario.

La baja debe ser autoservicio y no requerir llamada, documentación ni contacto comercial.

La implementación debe contemplar y señalar para revisión legal el botón de arrepentimiento y los derechos aplicables a contratación online.

## 13. Reembolsos y contracargos

- Cancelación normal: sin devolución proporcional.
- Cobro duplicado, importe incorrecto, cobro posterior a una baja efectiva, derecho de arrepentimiento aplicable o imposibilidad comprobable de prestar el servicio: contemplar devolución total.
- Otros casos: revisión manual.
- Todo reembolso se procesa desde backend, con idempotencia, auditoría, verificación en Mercado Pago y documentación contable.

Ante un contracargo:

- marcar el pago `disputed`;
- suspender temporalmente el acceso pago;
- mantener Concejal;
- alertar al administrador;
- conservar evidencia necesaria.

Si se resuelve a favor de Alsina, restaurar plan y precio fundador. Si se resuelve a favor del usuario, cancelar la suscripción paga, mantener Concejal y terminar el precio fundador.

## 14. Remitentes y tono de email

Remitentes aprobados:

- Editorial: `Señal Alsina <newsletter@alsinaar.com>`.
- Transaccional: `Alsina <info@alsinaar.com>`.

Crear configuración centralizada; no hardcodear remitentes en múltiples funciones.

Señal Alsina utiliza el canal editorial con bajas. `info@alsinaar.com` se utiliza para Auth, onboarding, seguridad, pagos, suscripciones, cancelaciones e información contractual.

El tono debe ser claro, humano, institucional sin ser burocrático, breve, directo y en castellano rioplatense. Evitar jerga, amenazas, urgencia falsa y promociones dentro de emails críticos.

Antes de producción verificar que ambas casillas existan o reciban respuestas, el dominio esté validado en Resend y SPF, DKIM y DMARC estén correctamente configurados.

## 15. Informes institucionales con clave compartida

Olavarría, Exaltación de la Cruz y futuros informes por contrato continúan fuera de los planes.

Cada cliente recibe una clave específica para su informe y puede compartirla con quienes quiera. No exigir cuentas individuales ni limitar miembros.

Las claves deben:

- generarse de forma segura;
- almacenarse solo como hash;
- no aparecer en URLs;
- poder rotarse y revocarse;
- tener rate limiting;
- crear una sesión firmada, `HttpOnly`, `Secure` y limitada al recurso;
- proteger también archivos y descargas en backend.

Inventariar las claves existentes. Si los valores documentados en `.env.example` son placeholders o estuvieron expuestos, rotarlos antes de producción. No modificar secretos sin verificación humana del entorno correcto.

## 16. Retención y ubicación de registros

Supabase Postgres es la fuente canónica. Supabase Storage privado conserva documentos; Vercel mantiene logs técnicos operativos; Mercado Pago y Resend son fuentes de contraste, no el único historial.

Plazos aprobados:

| Información | Conservación |
|---|---:|
| Facturas, pagos, reembolsos y notas de crédito | 10 años |
| Historial de suscripciones y precios | 10 años |
| Auditoría financiera administrativa | 10 años |
| Payloads sanitizados de webhooks | 180 días |
| Eventos financieros normalizados | 10 años |
| Accesos y descargas | 12 meses |
| Eventos de entrega, rebote y apertura | 12 meses |
| Consentimientos y bajas editoriales | Vida de la cuenta + 5 años |
| Logs técnicos generales | 90 días |
| Seguridad y autenticación | 12 meses |

Los PDF fiscales se guardan en bucket privado. El usuario accede mediante URL firmada temporal. Implementar tareas de depuración y registrar su ejecución.

Antes de producción definir backups automáticos, exportación cifrada separada y prueba de restauración.

## 17. Administración interna

Habrá seis usuarios administrativos independientes:

- Felipe: único `super_admin` con facultades operativas completas.
- Cinco socios: rol técnico `partner`, mostrado como Socio o Propietario.

`partner` solo accede a métricas agregadas. No ve nombres, emails, CUIT, pagos individuales, facturas, webhooks, claves, secretos ni registros personales. No modifica precios, suscripciones, reembolsos, accesos, roles ni configuración.

Crear endpoints o vistas agregadas reales; no ocultar datos solamente en frontend. Suprimir o agrupar segmentos con menos de cinco registros para evitar reidentificación.

Exigir cuentas separadas y MFA a los seis administradores. No utilizar contraseñas compartidas. Verificar roles en backend/RLS y auditar acciones.

## 18. Matriz definitiva de notas e informes

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

Para contenido Gobernador actualmente público, conservar una portada o introducción breve si sirve comercialmente, pero no entregar el cuerpo completo, la herramienta ni los datos protegidos al navegador sin autorización.

El sistema debe utilizar capacidades, no comparaciones rígidas con nombres de plan.

## 19. Monitor 135 definitivo

Un visitante sin cuenta ve un adelanto y CTA a Concejal.

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

Los niveles inferiores deben ver las funciones e indicadores bloqueados con nombre, explicación, candado, plan requerido y CTA. El navegador nunca recibe el valor o dataset protegido: no implementar seguridad mediante blur/CSS sobre datos ya descargados.

Los JSON completos dejan de ser archivos estáticos públicos. Mover el acceso detrás de endpoints autenticados que devuelvan solamente campos autorizados.

`Tableros comparativos intermunicipales` se integra con la comparación de Monitor y no se promete como producto separado.

## 20. Radar Fiscal

La herramienta standalone se denomina **Radar Fiscal PBA**.

- Es pública.
- Es el mismo producto que la promesa `Radar tributario de la Provincia`.
- Eliminar esa promesa como beneficio exclusivo de Gobernador.
- Renombrar el módulo interno del Monitor como **Indicadores fiscales municipales**.
- Los CSV crudos de Radar Fiscal PBA dejan de ser accesibles por URL pública.
- La visualización permanece pública.
- No ofrecer descarga o exportación de sus datos crudos.

## 21. Beneficios no implementados

Para el lanzamiento:

- Retirar `Informe legislativo mensual`.
- Retirar `Radar regulatorio y legislativo sectorial`.
- Mantener `Acceso anticipado a nuevos productos` para Gobernador.
- Mantener `Archivo completo de informes` para Gobernador.
- Mantener como capacidad futura la descarga de informes en PDF para Intendente y Gobernador, pero no mostrarla ni prometerla hasta que esté implementada y protegida.
- Eliminar `Radar tributario provincial` como promesa separada porque se unifica con Radar Fiscal PBA público.
- No vender como beneficio ninguna funcionalidad indefinida o inexistente.

## 22. Catálogo de capacidades

Revisar el catálogo propuesto en `10-access-decision-matrix.md` y ajustarlo a estas decisiones. Como mínimo debe permitir distinguir:

- recepción editorial;
- notas públicas;
- informes estándar;
- informes premium;
- archivo histórico;
- descarga de informes;
- Monitor básico;
- Monitor completo;
- exportación de Monitor;
- visualizaciones públicas;
- acceso anticipado;
- informes institucionales por clave.

Los recursos declaran capacidades y los planes conceden capacidades. No dispersar reglas como `plan === 'gobernador'` por el código.

## 23. Verificaciones humanas que deben permanecer abiertas

No tratar como decisiones comerciales pendientes lo ya resuelto. Mantener como verificaciones externas:

- plan contratado y configuración real de Supabase;
- plan contratado y configuración real de Vercel;
- plan contratado y configuración real de Resend;
- dominio y DNS;
- backups y prueba de restauración;
- credenciales reales y de prueba de Mercado Pago;
- creación y asociación de planes de Mercado Pago;
- secreto de webhooks;
- situación fiscal y facturación ARCA;
- creación y recepción de `info@alsinaar.com`;
- rotación de claves institucionales;
- revisión jurídica de términos, privacidad, cancelación y arrepentimiento.

## Resultado esperado de esta ejecución

Entregá:

1. Archivos documentales actualizados.
2. Tabla de decisiones antes pendientes y ahora resueltas.
3. Lista corta de verificaciones humanas reales.
4. Plan actualizado de FASE 1 con criterios de aceptación y rollback.
5. Confirmación explícita de que no se modificó código ni infraestructura.

Después detenete y esperá `APROBAR FASE 1`.
