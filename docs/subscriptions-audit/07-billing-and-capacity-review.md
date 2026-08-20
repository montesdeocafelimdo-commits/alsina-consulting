# 07 — Revisión de facturación y capacidad (planes/infraestructura)

## Planes de negocio (Intendente / Ministro / Gobernador)

| Aspecto | Estado |
|---|---|
| Definición de alcance por plan | Definida en el prompt maestro (jerárquica y acumulativa) — no en código ni en base de datos. |
| Precios | Solo existen como copy de frontend: `intendenteMensual: 'Gratis'`, `ministroMensual: '$25.000'`, `gobernadorMensual: '$45.000'` ([assets/js/pricing.js:7-12](../../assets/js/pricing.js#L7-L12)). El prompt maestro pide explícitamente **no asumir precios definitivos** salvo de una fuente canónica inequívoca — estos valores están en un archivo de trabajo (`assets/js/pricing.js`) editado como parte del rediseño de la tabla comparativa, no se confirmó con el usuario que sean el precio final aprobado para facturar. Marcado como decisión pendiente en 08. |
| Cobro real por plan | **No implementado** — `api/checkout.js` cobra un único monto fijo (`PRICES.pro = 45000`) sin im
importar qué plan se eligió (ver hallazgo bloqueante en 00/03/08). |
| Jerarquía acumulativa (Ministro incluye Intendente, etc.) | Reflejada correctamente en el copy de la tabla comparativa (`tiers` acumulativos en `assets/js/subscription-compare.js`), pero **sin ningún respaldo en base de datos ni en lógica de autorización** — es solo visual. |

## Infraestructura pagada — decisión ya tomada, verificación pendiente

El prompt maestro fija la decisión de negocio (Supabase Pro, Resend Pro, Vercel Pro para producción). Esta auditoría **no encontró en el repo ninguna señal de que esos planes ya estén contratados** — no hay forma de verificarlo sin acceso a los paneles (ver matriz completa en [01-account-and-environment-matrix.md](01-account-and-environment-matrix.md)). Lo único parcialmente verificable desde el repo es que el proyecto de Vercel está vinculado a un **Team** (`orgId: team_...` en `.vercel/project.json`), lo cual es coherente con — pero no prueba — que sea un plan Pro/Team pago en vez de Hobby con team habilitado incorrectamente.

| Servicio | Plan que el repo permite inferir | Confirmación pendiente |
|---|---|---|
| Vercel | Proyecto en un Team (no cuenta personal) | Plan Pro vs. Hobby-con-team — dashboard → Billing |
| Supabase | Sin ninguna señal en el repo (ni `project_ref` real, ni link de CLI) | Todo — dashboard → Billing |
| Resend | Sin ninguna señal en el repo | Todo — dashboard → Billing |
| Mercado Pago | No aplica plan/tier de infraestructura — es transaccional por naturaleza (comisión por operación) | Confirmar que la aplicación es de la cuenta comercial correcta, no de una cuenta personal |

## Capacidad y límites relevantes al lanzamiento

- **Resend transaccional**: hoy el volumen de envío es mínimo (3 tipos de email, disparo puntual por acción de usuario) — no hay indicios de que el sitio esté cerca de los límites del plan Free (100/día), pero **tampoco hay ningún envío editorial masivo real todavía a través de este sistema** (confirmar con el usuario cómo se manda hoy la Señal Alsina quincenal — no se encontró en el repo). Si el newsletter editorial se migra a enviarse vía Resend Broadcasts en el futuro, el cálculo de cupo cambia por completo y debe rehacerse contra el volumen real de la lista.
- **Supabase Free vs. Pro — riesgo de pausa por inactividad**: es el hallazgo más concreto de esta sección. Si el proyecto sigue en el plan Free, y la actividad de escritura es baja (hoy el volumen de tráfico hacia `/api/subscribe`/`/api/unlock` no se pudo medir desde este entorno), existe el riesgo real que el prompt maestro ya identificó: pausa automática y pérdida de acceso a los `contacts`/`unlocks`/`purchases`/`subscriptions` ya recolectados hasta confirmar la reactivación manual.
- **Vercel Hobby vs. Pro — uso comercial**: el sitio ya vende servicios de consultoría y (potencialmente pronto) suscripciones — no es un proyecto personal. Confirmar que el plan contratado sea apto para uso comercial es una verificación de cumplimiento de los términos de servicio de Vercel, no solo de capacidad técnica.

## Conclusión de esta sección

No hay ningún dato de billing/capacidad verificable desde el código que contradiga las decisiones ya tomadas en el prompt maestro — pero tampoco hay ninguno que las confirme. Esta sección es, en la práctica, un checklist de verificación humana pendiente (consolidado también en [10-production-readiness-checklist.md](10-production-readiness-checklist.md)), más el hallazgo de que **los precios de plan usados hoy en el frontend no tienen trazabilidad de "fuente canónica aprobada"** — se pegaron en un archivo de JS junto con el resto del rediseño de la tabla comparativa, sin que este repo tenga evidencia de que sea la lista de precios final para facturar.
