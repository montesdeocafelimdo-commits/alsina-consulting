# 10 — Matriz de acceso por recurso (definitiva, aprobada)

Reemplaza la versión anterior (hipótesis + `requiere decisión`). Esta matriz refleja las decisiones aprobadas en [11-approved-decisions.md](11-approved-decisions.md) — en particular AD-01 (nomenclatura), AD-18 (informes), AD-19 (Monitor 135), AD-20 (Radar Fiscal) y AD-21 (beneficios retirados). Documento de planificación: **no se modificó ningún archivo de código**. Cada fila sigue indicando la evidencia del estado actual (para que FASE 5 sepa exactamente qué cambiar) y, cuando el estado actual difiere del aprobado, qué acción de implementación queda pendiente — ya no como pregunta, sino como tarea.

## Nomenclatura (ya resuelta — AD-01)

| Columna de esta matriz | Slug | Precio de fundador |
|---|---|---:|
| Público | — | — |
| Concejal | `concejal` | ARS 0 |
| Intendente | `intendente` | ARS 25.000/mes |
| Gobernador | `gobernador` | ARS 45.000/mes |

El código hoy usa "Intendente" (gratis) / "Ministro" / "Gobernador" — el renombrado a estos slugs es el primer paso de FASE 1 (inventario de referencias antes de migrar, AD-01), no algo ya aplicado.

## Cómo leer las columnas de acceso

`sí` / `no` / `versión básica` / `versión completa` — ya no hay `requiere decisión` en esta versión de la matriz salvo en los dos casos residuales marcados explícitamente al final (diseño técnico, no decisión de negocio).

---

## A. Páginas institucionales y de producto (sin cambios — fuera del alcance de planes)

Sin cambios respecto de la auditoría original: `index.html`, `consultoria.html`, `que-es-alsina.html`, `productos.html`, `alsina-presentacion.html`, `alsina-diagnostico-servicio.html`, `vincular-demo.html`, los PDFs de muestra de `consultoria.html` (`alsina-diagnostico-modelo-v2.pdf`, `alsina-diagnostico-olavarria-v2.pdf`) y `newsletter.html` (como landing) siguen 100% públicos para todos los niveles, incluido Público. No son recursos de suscripción.

`newsletter.html` deja de anunciar una fecha de cierre sin confirmación de Alsina (hoy dice "desde septiembre de 2026", en tensión con AD-02) — corrección de contenido a coordinar en FASE 2, ver [09-implementation-plan.md](09-implementation-plan.md).

`informes.html` (biblioteca) pasa a filtrar por capacidad real del visitante en vez de solo mostrar un badge cosmético — mismo listado, pero el link a un recurso Gobernador para un visitante Público/Concejal lleva a una portada/CTA, no al contenido completo (AD-18).

## B. Newsletter y formularios — fusionados en el alta de Concejal (AD-04)

| # | Nombre visible | Ruta o archivo | Estado aprobado | Fuente | Acción pendiente |
|---|---|---|---|---|---|
| B1 | Alta a Señal Alsina = alta de Concejal | `POST /api/subscribe` (hoy) → un único endpoint de alta en FASE 2 | Un solo formulario, un solo recorrido: email → magic link → identidad → cuenta → Concejal → Monitor 135 básico → suscripción a Señal Alsina → una bienvenida | AD-04 | Hoy `/api/subscribe` solo crea un `contact`, sin identidad ni cuenta — se reemplaza en FASE 2, no se extiende. |
| B2 | Confirmación | `GET /api/confirm` → magic link de Supabase Auth en FASE 2 | El link de confirmación pasa a ser el magic link de Auth, no un token propio de `contacts` | AD-04 | — |
| B3 | Desbloqueo gratuito por mail | `POST /api/unlock` | Sin uso futuro previsto — el modelo de capacidades reemplaza los desbloqueos ad-hoc por email | AD-22 | Evaluar en FASE 1 si se retira o se reconvierte en un tipo de `manual_access_grant`. |
| B4 | Flag de pagos activos | `GET /api/config` | Sin cambios | — | — |

## C. Informes y notas (matriz definitiva — AD-18)

| # | Nombre visible | Ruta o archivo | Público | Concejal | Intendente | Gobernador | Estado actual (auditoría) | Acción pendiente |
|---|---|---|---|---|---|---|---|---|
| C1 | Un empleo cada 23 vecinos | `nota-un-empleo-cada-23-vecinos.html` | no | no | no | sí | Hoy 100% público y catalogado como `accessType: free` en [assets/data/publications.js:33-34](../../assets/data/publications.js#L33-L34) | **Cambio de estado real**: pasa de público a exclusivo de Gobernador. Requiere retirar el cuerpo completo del HTML público y dejar portada/adelanto — coordinar momento con editorial (contenido ya publicado el 18/08). |
| C2 | 2027 empieza ahora | `nota-electoral-2027.html` | sí | sí | sí | sí | Ya público, sin gate — coincide | Sin acción. |
| C3 | Anatomía de la dependencia | `alsina-nota-finanzas-pba.html` | sí | sí | sí | sí | Tiene scroll-gate cosmético hoy ([initScrollGate](../../alsina-nota-finanzas-pba.html)) pese a estar catalogada como libre | **Retirar el gate** y agregar CTA a Concejal en su lugar (AD-18 lo pide explícitamente). |
| C4 | Presupuesto e Impositiva PBA 2026 | `alsina-presupuesto-impositiva-2026.html` | sí | sí | sí | sí | Público hoy, pero el catálogo decía `requiredPlan: gobernador` ([assets/data/publications.js:54-55](../../assets/data/publications.js#L54-L55)), contradiciendo `SETUP.md` | Se confirma como "informe muestra", público a propósito — **corregir el catálogo** (`publications.js`) para que dej de decir `gobernador`. |
| C5 | El fin de una era | `nota-fin-de-una-era.html` | sí | sí | sí | sí | Público hoy, catálogo decía `gobernador` | Se confirma como contenido insignia con CTA — **corregir el catálogo**, agregar CTA a Concejal/planes si no lo tiene. |
| C6 | Radiografía del Estado PBA | `alsina-radiografia-pba.html` | sí | sí | sí | sí | Público hoy, catálogo decía `gobernador` | Se confirma como contenido de captación — **corregir el catálogo**. |
| C7 | PBG Municipal PBA 2021–2023 | `alsina-pbg-pba.html` | no | no | no | sí | Solo scroll-gate cosmético hoy — cualquiera que deje el mail lo lee completo | **Gate real**: mover a protección server-side por capacidad (patrón de FASE 5), no alcanza con el gate actual. |
| C8 | Balance fiscal 1S 2026 (nota) | `alsina-balance-fiscal-1s2026.html` | no | no | sí | sí | 100% público hoy, sin ningún gate | **Gate real** requerido — hoy no tiene ni siquiera protección cosmética. |
| C9 | Herramienta de Balance fiscal (interactiva embebida) | Misma página, `assets/js/balance-fiscal-tool.js` | no | no | sí | sí | Pública hoy, sin gate | Se gatea junto con la nota (mismo criterio). |
| C10 | Base CSV de Balance fiscal | `/assets/data/transferencias-135-municipios-2026.csv` | no | no | no | sí | Hoy es una descarga pública explícita con atributo `download`, sin ningún control ([alsina-balance-fiscal-1s2026.html:372,645,704](../../alsina-balance-fiscal-1s2026.html#L372)) | **Cambio de estado real**: pasa de descarga pública a exclusiva de Gobernador. Requiere moverla detrás de un endpoint autenticado — no puede seguir siendo un archivo estático público. |
| C11 | Recaudación tributaria PBA | `alsina-recaudacion-tributaria-pba.html` | no | no | sí | sí | Scroll-gate cosmético hoy | Reemplazar por gate real por capacidad. |
| C12 | Transferencias a municipios | `alsina-informe-transferencias.html` | no | no | sí | sí | Público hoy, sin gate | Implementar gate real. |
| C13 | Mapa político PBA | `alsina-mapa-politico.html` | sí | sí | sí | sí | Público hoy con soft-gate cosmético | Coincide con lo aprobado (público) — el soft-gate puede mantenerse como CTA suave a Concejal, no como control de acceso. |
| C14 | Súper RIGI (app) | `/super-rigi/` | sí | sí | sí | sí | Público hoy | Coincide. |
| C15 | Súper RIGI (nota) | `alsina-informe-super-rigi.html` | — | — | — | — | `status: archived` en el catálogo pero la URL sigue viva y sin protección real | Mantener fuera del listado de `informes.html` (ya es así) — evaluar si además debe dejar de resolver por URL directa, ya que hoy "archivado" no la protege. |

## D. Monitor 135 (matriz definitiva — AD-19)

| # | Función | Ruta o archivo | Público | Concejal | Intendente | Gobernador | Estado actual (auditoría) | Acción pendiente |
|---|---|---|---|---|---|---|---|---|
| D1 | Ingreso a Monitor 135 | `municipios-data-hub.html` | no (ve adelanto + CTA) | sí | sí | sí | Hoy 100% público, sin ningún adelanto/CTA diferenciado | Implementar la pantalla de adelanto para visitantes sin cuenta. |
| D2 | Indicadores principales | ídem | — | sí | sí | sí | Público para todos hoy | Sin cambio de contenido, sí de control de acceso (requiere sesión Concejal+). |
| D3 | Resumen electoral, fiscal y productivo | ídem | — | sí | sí | sí | Público para todos hoy | Ídem D2. |
| D4 | Consulta municipal | ídem | — | versión básica | versión completa | versión completa | Hoy es una única vista completa para todos, sin distinción | Implementar la vista resumida vs. completa — no existe hoy ninguna versión recortada. |
| D5 | Indicadores avanzados | ídem | — | no | sí | sí | Sin distinción hoy | Implementar bloqueo real (con candado visible + CTA, nunca dato en el navegador de quien no puede verlo). |
| D6 | Comparación entre municipios | ídem | — | no | sí | sí | Sin distinción hoy | Ídem D5. Incluye lo que antes se proponía como "Tableros comparativos intermunicipales" — ya no es un producto separado (AD-19). |
| D7 | Descarga de bases | `assets/data/monitor135-municipios.json`, `assets/data/monitor135-educacion.json` | no | no | no | sí | Hoy son archivos estáticos públicos, accesibles por URL directa sin ningún control | **Cambio de arquitectura obligatorio**: dejan de ser estáticos, se sirven por endpoint autenticado con campos filtrados por capacidad. |
| D8 | Exportación de datos | ídem | no | no | no | sí | No implementado como función separada de la descarga | Se resuelve junto con D7. |

## E. Mapas y visualizaciones interactivas

| # | Nombre visible | Ruta o archivo | Público | Concejal | Intendente | Gobernador | Estado actual | Acción pendiente |
|---|---|---|---|---|---|---|---|---|
| E1 | Mapa político PBA | `alsina-mapa-politico.html` | sí | sí | sí | sí | Público, coincide | Sin acción. |
| E2 | **Radar Fiscal PBA** (nombre definitivo, AD-20) | `/radar-fiscal/` | sí | sí | sí | sí | Público hoy bajo el nombre "Radar Fiscal" | Confirmar el nombre "Radar Fiscal PBA" en el sitio; ya no hay conflicto con ninguna promesa de plan — es el mismo producto que "Radar tributario de la Provincia", que se retira como promesa separada (AD-20/AD-21). |
| E2b | CSV crudos de Radar Fiscal PBA | `radar-fiscal/data/metricas-anuales.csv`, `radar-fiscal/data/recaudacion-tributaria.csv` | no | no | no | no (nadie los descarga) | Hoy accesibles públicamente por URL directa | **Cambio obligatorio**: dejan de ser accesibles por URL pública. Ninguna capacidad habilita su descarga — la regla de "no ofrecer visualizaciones como descarga" aplica también a sus datos crudos (AD-20). |
| E3 | Súper RIGI (app) | `/super-rigi/` | sí | sí | sí | sí | Público, coincide | Sin acción. |
| E4 | Indicadores fiscales municipales (nombre nuevo, AD-20) | Módulo dentro de `municipios-data-hub.html` | — | sí | sí | sí | Hoy es parte del bundle único de Monitor 135, sin nombre propio | Renombrar en la interfaz para no confundir con Radar Fiscal PBA; sigue las mismas reglas de acceso que D2/D3 (incluido en Monitor básico). |

## F. Informes territoriales institucionales (AD-15 — fuera de los planes)

| # | Nombre visible | Ruta o archivo | Acceso | Estado actual | Acción pendiente |
|---|---|---|---|---|---|
| F1 | Informe territorial — Olavarría | `informes/olavarria.html` → `private/informes/olavarria.html` vía `/api/informe` | Clave institucional, fuera de planes, sin límite de miembros | Middleware 404 + hash SHA-256 ya implementado | Reforzar según AD-15: sesión firmada `HttpOnly`/`Secure` limitada al recurso (hoy no hay sesión, se revalida en cada request), rate limiting (hoy ausente), confirmar rotación de la clave si sigue siendo el placeholder de `.env.example`. |
| F2 | Informe territorial — Exaltación de la Cruz | `informes/exaltacion-de-la-cruz.html` → `private/informes/exaltacion-de-la-cruz.html` | Ídem F1 | Ídem F1 | Ídem F1. |

## G. Beneficios comerciales — qué queda y qué se retira (AD-21)

| # | Nombre | Estado aprobado | Acción pendiente |
|---|---|---|---|
| G1 | Informe legislativo mensual | **Retirado** | Quitar de `assets/js/subscription-compare.js` (categoría "Contenidos y análisis"). |
| G2 | Radar regulatorio y legislativo sectorial | **Retirado** | Quitar de `assets/js/subscription-compare.js` (categoría "Análisis territorial"). |
| G3 | Acceso anticipado a nuevos productos | **Se mantiene**, exclusivo Gobernador | Sin cambio de copy; sigue sin tener ningún soporte técnico — es una política de lanzamiento, no un recurso a gatear. |
| G4 | Archivo completo de informes | **Se mantiene**, exclusivo Gobernador | Implementar el corte real en `informes.html`: Público/Concejal/Intendente ven solo lo reciente, Gobernador ve el histórico completo (hoy todos ven todo). |
| G5 | Descarga de informes en PDF | **Capacidad futura**, no se promete ni se muestra hasta estar implementada y protegida | No mostrar en la tabla de precios hasta que exista de verdad — hoy no hay ninguna generación de PDF en el sitio. |
| G6 | Radar tributario provincial | **Retirado como promesa separada** — se unifica con Radar Fiscal PBA (E2), ya público para todos | Quitar de `assets/js/subscription-compare.js` como ítem exclusivo de Gobernador. |
| G7 | Tableros comparativos intermunicipales | **Retirado como promesa separada** — se unifica con "Comparación entre municipios" (D6) | Quitar como ítem propio de la tabla comparativa si estuviera listado aparte. |

---

## Catálogo de capacidades técnicas (ajustado — AD-22)

| Capacidad | Qué habilita | Plan mínimo que la concede |
|---|---|---|
| `newsletter_receive` | Recibir Señal Alsina | Concejal |
| `report_free_view` | Leer notas/informes públicos (incluye C2-C6, C13-C14) | Público |
| `report_standard_view` | Leer informes de nivel intermedio (C8, C9, C11, C12) | Intendente |
| `report_premium_view` | Leer informes de nivel superior (C1, C7) | Gobernador |
| `report_archive_access` | Ver el archivo histórico completo en `informes.html` sin corte por antigüedad | Gobernador |
| `report_download` | Descargar un informe en PDF (capacidad futura, no prometida aún — G5) | Intendente (cuando exista) |
| `monitor_basic_view` | Ingreso a Monitor 135, indicadores principales, resumen electoral/fiscal/productivo, consulta municipal resumida | Concejal |
| `monitor_full_view` | Consulta municipal completa, indicadores avanzados, comparación entre municipios | Intendente |
| `monitor_data_export` | Descarga y exportación de bases completas del Monitor 135 | Gobernador |
| `interactive_tool_view` | Ver visualizaciones interactivas públicas (Mapa Político, Radar Fiscal PBA, Súper RIGI) — nunca incluye descarga de datos crudos | Público |
| `institutional_report_access` | Acceso a un informe territorial por clave — no depende de plan, depende de contrato (AD-15) | No aplica a planes |
| `early_product_access` | Acceso anticipado a productos nuevos (sin soporte técnico aún) | Gobernador |

Capacidades retiradas del catálogo anterior por no tener producto detrás (AD-21): `provincial_tax_radar_access` (se unifica con `interactive_tool_view` vía Radar Fiscal PBA), `regulatory_radar_access`, `legislative_monthly_report_access`, `raw_dataset_download` (queda explícitamente **prohibida**, no solo sin implementar — ningún plan la concede, AD-20).

---

## Los dos únicos puntos que siguen abiertos (diseño técnico, no decisión de negocio)

1. **Retiro/reconversión de `/api/unlock`**: la matriz de capacidades ya no tiene ningún hueco para "desbloqueo gratuito ad-hoc por email" — queda para FASE 1 decidir si se elimina el endpoint o se reconvierte en un tipo de `manual_access_grant` administrado.
2. **Si "Súper RIGI (nota archivada)" (C15) debe dejar de resolver por URL directa** o alcanza con que ya esté fuera del listado — es una decisión de implementación menor, no bloquea ninguna fase.

Todo lo demás que en la versión anterior de esta matriz decía `requiere decisión` quedó resuelto por AD-01 a AD-22.
