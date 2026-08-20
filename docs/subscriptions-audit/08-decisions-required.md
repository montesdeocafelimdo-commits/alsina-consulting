# 08 — Decisiones (resueltas) y verificaciones humanas restantes

**Actualizado tras la aprobación de Alsina.** Todas las decisiones de negocio que este documento planteaba como pendientes en la FASE 0 quedaron resueltas — el detalle normativo completo vive en [11-approved-decisions.md](11-approved-decisions.md) (`AD-01`…`AD-23`), aprobado a partir de `Alsina_Decisiones_Suscripciones_Consolidadas.md`. Este documento ya no plantea preguntas de negocio: separa qué quedó resuelto, qué acción de implementación queda derivada de cada resolución, y qué sigue siendo una verificación humana externa genuina (algo que ninguna decisión de negocio puede cerrar por sí sola — un dato de un panel, una gestión fiscal, una revisión legal).

## 1. Decisiones específicas de esta auditoría — resueltas

| Pendiente original (FASE 0) | Resuelto por | Acción de implementación derivada (no es una decisión pendiente) |
|---|---|---|
| Precio único hardcodeado en `api/checkout.js` sin distinguir plan | [AD-01](11-approved-decisions.md#ad-01--planes-nombres-y-precios-definitivos), [AD-03](11-approved-decisions.md#ad-03--fuente-canónica-de-precios) | Construir el modelo de `plan_prices` versionado y reescribir `api/checkout.js` para que reciba un identificador de plan, no un monto — FASE 1/4 de [09-implementation-plan.md](09-implementation-plan.md). |
| Fecha de septiembre 2026 anunciada en `newsletter.html` | [AD-02](11-approved-decisions.md#ad-02--precios-fundadores-y-versiones-de-precio) ("no publicar fecha de lanzamiento hasta que Alsina la confirme") | El copy ya publicado en [newsletter.html:575](../../newsletter.html#L575) contradice esta decisión hoy — corregirlo es una acción de contenido a coordinar con el equipo editorial antes o durante FASE 2, no una decisión técnica. |
| Qué hacer con `contacts`/`unlocks`/`subscriptions`/`purchases` existentes | [AD-05](11-approved-decisions.md#ad-05--migración-de-contactos-existentes) | Diseñar la migración de `contacts.confirmed = true` a "miembro Concejal heredado" en FASE 1, con reconciliación manual de `subscriptions`/`purchases` heredados antes de reconocer accesos pagos. |
| Webhook de Mercado Pago falla abierto sin `MP_WEBHOOK_SECRET` | [AD-07](11-approved-decisions.md#ad-07--seguridad-de-mercado-pago-fallar-cerrado) | Reescribir `api/webhook.js` para bloquear la activación en producción si falta el secreto — criterio de aceptación de FASE 4. |
| Remitente de email hardcodeado en 3 archivos | [AD-14](11-approved-decisions.md#ad-14--remitentes-y-tono-de-email) | Crear configuración centralizada de remitentes (`newsletter@alsinaar.com` editorial / `info@alsinaar.com` transaccional) — FASE 6. |
| Modelo de acceso de informes institucionales vs. planes | [AD-15](11-approved-decisions.md#ad-15--informes-institucionales-con-clave-compartida) | Quedan fuera de los planes, con requisitos de seguridad reforzados (sesión firmada `HttpOnly`/`Secure`, rate limiting, rotación) — FASE 5. |

## 2. Lista heredada del prompt maestro original — resuelta en bloque

Todos estos puntos, listados en la versión anterior de este documento como pendientes, están resueltos por las decisiones aprobadas indicadas:

| Punto | Resuelto por |
|---|---|
| Precios ARS finales y política de actualización | AD-01, AD-02 |
| Impuestos y facturación | AD-08 |
| Día fijo o fecha aniversario de cobro | AD-09 |
| Existencia y duración de prueba gratuita | AD-09 (no hay prueba gratuita paga; Concejal cumple esa función) |
| Período de gracia ante cobro fallido | AD-10 (5 días corridos, 2 avisos) |
| Cantidad y cadencia de avisos de recuperación | AD-10 |
| Límites de miembros por cuenta institucional | AD-06 (no aplica: no hay equipos en v1; los informes institucionales no consumen asientos) |
| Permisos exactos del usuario registrado gratuito | AD-19 (Monitor 135 básico), AD-18 (matriz de informes) |
| Upgrade inmediato o próximo ciclo | AD-11 |
| Downgrade en próximo ciclo | AD-11 |
| Cancelación al final del período ya pagado | AD-12 |
| Reembolsos y contracargos | AD-13 |
| Capacidad exacta requerida por cada recurso | AD-18, AD-19, AD-20, AD-21, AD-22 — y el detalle recurso por recurso en [10-access-decision-matrix.md](10-access-decision-matrix.md) |
| Retención de logs y auditorías | AD-16 |
| Remitentes y tono final de cada email | AD-14 |
| Responsables humanos y roles administrativos | AD-17 |

Ninguno de estos puntos vuelve a plantearse como pregunta abierta salvo que Alsina decida revisarlo explícitamente.

## 3. Verificaciones humanas reales que siguen abiertas

Esto **no es una lista de decisiones de negocio** — son datos y gestiones que existen fuera del código y del repositorio, y que ninguna decisión aprobada puede resolver por escrito. El detalle operativo (a qué panel entrar, qué copiar) está en [10-production-readiness-checklist.md](10-production-readiness-checklist.md); acá solo el resumen, tal como lo fija [AD-23](11-approved-decisions.md#ad-23--verificaciones-humanas-que-permanecen-abiertas):

1. Plan contratado y configuración real de Supabase.
2. Plan contratado y configuración real de Vercel.
3. Plan contratado y configuración real de Resend.
4. Dominio y DNS de `alsinaar.com`.
5. Backups y una prueba real de restauración.
6. Credenciales reales y de prueba de Mercado Pago.
7. Creación y asociación de los planes recurrentes de Mercado Pago (Intendente y Gobernador, configuraciones distintas).
8. Secreto de verificación de webhooks (`MP_WEBHOOK_SECRET`) cargado en el entorno correcto.
9. Situación fiscal y facturación ARCA de Alsina (CUIT emisor, tipo de factura, punto de venta, tratamiento de IVA, credenciales/mecanismo de ARCA, procedimiento de notas de crédito).
10. Creación y recepción real de la casilla `info@alsinaar.com`.
11. Rotación de las claves de acceso de los informes institucionales (`INFORME_KEY_HASH_OLAVARRIA`/`INFORME_KEY_HASH_EXALTACION`), si siguen siendo los placeholders documentados en `.env.example`.
12. Revisión jurídica de términos, política de privacidad, cancelación y derecho de arrepentimiento en la contratación online.

Nada de esta lista bloquea el inicio de la FASE 1 (modelo de datos, identidad) — son verificaciones que corresponden más adelante, antes de activar pagos reales o emitir facturas reales, y ya están reflejadas como tales en [09-implementation-plan.md](09-implementation-plan.md).
