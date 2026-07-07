# Inventario de contenido — alsinaar.com (Fase 0.4)

Estado al 2026-07-07, rama `main`, antes de crear `redesign-2026`.

Leyenda de destino: **Home** = home nueva · **/informes** = biblioteca de informes · **/consultoria** = página B2G · **/que-es-alsina** = manifiesto · **newsletter.html** = se mantiene · **sin cambios** = no es contenido de sitio (backend/datos) · **ELIMINAR (Fase 1)** = artefacto de desarrollo, no es contenido.

## 1. `index.html` (home actual) — se reemplaza por completo, contenido se reubica sección por sección

| # | Sección actual (id) | Contenido | Destino nueva arquitectura |
|---|---|---|---|
| 1.1 | `#hero` | Hero institucional actual (titular, sub, CTA contacto) | **Home** — reemplazado por el hero nuevo (Fase 3.2). Copy actual se descarta (ya no aplica: la conversión pasa a ser newsletter, no contacto directo). |
| 1.2 | `#problema` | Diagnóstico "Sin Alsina / Con Alsina" | **/consultoria** (Fase 4.1) |
| 1.3 | `#propuesta` | Propuesta de valor B2G ("No vendemos diagnósticos...") | **/consultoria** |
| 1.4 | `#metodologia` | Método de 4 pasos (Relevar/Ordenar/Priorizar/Implementar) | **/consultoria** |
| 1.5 | `#servicios` | 5 servicios: Diagnóstico municipal (+ 2 PDFs modelo), CRM VinculAR (+ demo), CICERO, Herramientas de gestión, Planificación urbana | **/consultoria** |
| 1.6 | `#informes` (grid de notas) | Cards: Presupuesto e Impositiva 2026, Finanzas PBA, Recaudación tributaria + Radar Fiscal, Mapa político, Súper RIGI, PBG Municipal, Análisis 2027 (nota electoral) | **/informes** — sección "Notas y análisis" (Fase 4.2). En Home nueva solo queda el resumen de 4 líneas (Fase 3.5), no las notas individuales. |
| 1.7 | `#numeros` (contadores 135 / 8 / etc.) | Contadores animados "0 Municipios PBA", "0 Líneas de servicio" | **Home** — se fusiona con la "Franja de complejidad" nueva (Fase 3.3), que ya contempla estas cifras como chips. Fix de fallback en Fase 1.2. |
| 1.8 | `#medios` ("En los medios") | Placeholders vacíos, sin contenido real | Sin destino visible por ahora — queda **comentado en código** (Fase 1.2), listo para reactivar cuando haya menciones reales. No pertenece a ninguna página nueva todavía. |
| 1.9 | `#señal` (captura newsletter inline) | Formulario de suscripción embebido en home | **Home** — reemplazado por los formularios de captura nuevos (hero 3.2 y CTA final 3.9), mismo backend (`/api/subscribe`). |
| 1.10 | `#quienes-somos` (+ iframe/link a presentación) | Presentación institucional embebida + link a `alsina-presentacion.html` | **/consultoria** — presentación institucional completa (Fase 4.1). |
| 1.11 | `#contacto` | CTA de contacto directo (mailto) | **/consultoria** (CTA de contacto al final de la página B2G). |
| 1.12 | `#clientes` (cards Olavarría / Exaltación de la Cruz) | Cards de informes de clientes con acceso por clave | **Home** — resumen en "Prueba social" (Fase 3.7). Acceso completo se mueve a **/informes** — sección "Informes de clientes" (Fase 4.2), con protección server-side (Fase 6.2). |
| 1.13 | Footer | Links + contacto | **Home** — footer nuevo (Fase 3.10), mismos destinos actualizados. |
| 1.14 | Nav — links "Provincia de Buenos Aires" / "Argentina" (footer, `href="#"`) | Links muertos, sin destino | **Hallazgo adicional Fase 1**: son enlaces rotos (`href="#"`) sin contenido real detrás. Marcar para eliminar o completar en Fase 1/9. |

## 2. Páginas de informes / notas (hoy sueltas en la raíz)

| Página | Contenido | Destino |
|---|---|---|
| `alsina-presupuesto-impositiva-2026.html` | Nota: Presupuesto e Impositiva PBA 2026 | **/informes** → Notas y análisis |
| `alsina-nota-finanzas-pba.html` | Nota: Finanzas de la PBA | **/informes** → Notas y análisis |
| `alsina-radiografia-pba.html` | Nota: Radiografía PBA | **/informes** → Notas y análisis |
| `alsina-recaudacion-tributaria-pba.html` | Nota: Radiografía Fiscal 1999–2026 (enlaza a Radar Fiscal) | **/informes** → Notas y análisis |
| `alsina-informe-transferencias.html` | Informe de transferencias a municipios (enlazado desde otras notas, sin link directo desde home) | **/informes** → Notas y análisis |
| `alsina-informe-super-rigi.html` | Nota: Súper RIGI — inversiones y municipios (enlaza a `/super-rigi/`) | **/informes** → Notas y análisis |
| `alsina-pbg-pba.html` | Informe PBG Municipal PBA 2021–2023 | **/informes** → Notas y análisis |
| `nota-electoral-2027.html` | Nota electoral "2027 empieza ahora" | **/informes** → Notas y análisis |
| `municipios-data-hub.html` | Monitor 135 / Data Hub (mapa + tabla + fichas) | **Home** (preview insignia, Fase 3.4) + **/informes** → Herramientas interactivas. Página en sí no cambia de URL. |
| `alsina-mapa-politico.html` | Mapa político PBA interactivo | **/informes** → Herramientas interactivas |
| `radar-fiscal/` (app Next.js exportada, + `radar-fiscal-app/` fuente) | Laboratorio fiscal interactivo | **/informes** → Herramientas interactivas. `radar-fiscal-app/` (fuente) → sin cambios, no es contenido servido. |
| `super-rigi/` (app Next.js exportada, + `super-rigi-app/` fuente) | Módulo interactivo Súper RIGI | Enlazado desde `alsina-informe-super-rigi.html` → **/informes** (queda embebido en esa nota, misma URL). `super-rigi-app/` (fuente) → sin cambios. |

## 3. Páginas institucionales / de servicio

| Página | Contenido | Destino |
|---|---|---|
| `alsina-diagnostico-servicio.html` | Landing del servicio "Diagnóstico Municipal Integral" | **/consultoria** (linkeada desde la sección de servicios) |
| `alsina-presentacion.html` | Presentación institucional completa (pantalla completa) | **/consultoria** (embebida/linkeada, ver 1.10). **Contiene un tercer email distinto** (`contacto@alsinaconsulting.com.ar` en el `href`, texto visible `contacto@alsina.ar`) — corregir a `contacto@alsinaar.com` en Fase 1. |
| `vincular-demo.html` | Demo del CRM VinculAR | **/consultoria** (linkeada desde servicios) |

## 4. Newsletter y clientes

| Página | Contenido | Destino |
|---|---|---|
| `newsletter.html` | 5 secciones + vista previa de edición + (hoy) stub de Alsina Pro | **newsletter.html** — se mantiene, se limpia (Fase 1) y se actualiza (Fase 4.4) |
| `informes/olavarria.html` | Informe de cliente completo, "protegido" por `prompt()` de JS | **/informes** → Informes de clientes. **Contenido debe salir del hosting público** (Fase 6.2). Referencia rota a `alsina-consulting.vercel.app` (Fase 1.4). Portada Unsplash a reemplazar (Fase 1.5). |
| `informes/exaltacion-de-la-cruz.html` | Informe de cliente completo, mismo esquema de "protección" | **/informes** → Informes de clientes. Mismo tratamiento server-side. Referencia a `alsina-consulting.vercel.app` en el footer (línea 1240). |
| `alsina-newsletter-001.html` | "Monitor Alsina N°01 · Junio 2026" — parece ser una edición real o maqueta de edición, **no está linkeada desde ninguna página del sitio** | **A confirmar con el equipo**: ¿es la primera edición real (debería vivir en un archivo de ediciones de `newsletter.html`) o un descarte de diseño? Propuesta: si es contenido real, mover a un archivo de "ediciones anteriores" enlazado desde `newsletter.html`; si es un descarte, no migrar. |
| `alsina-newsletter-001-email.html` | Versión email de la edición N°01, tampoco linkeada | Mismo tratamiento que la fila anterior (probablemente el HTML que se envía por Resend como plantilla de ejemplo). |

## 5. Artefactos de desarrollo (no son contenido — se eliminan o no se publican, Fase 1 / hallazgo adicional)

| Archivo | Problema | Acción |
|---|---|---|
| `alsina-home-mockup.html` | Mockup aprobado de la nueva home, **hoy servible públicamente** en `alsinaar.com/alsina-home-mockup.html` (está trackeado en git, sin ignorar) | Usar como referencia en Fase 3, luego **eliminar del repo** (o mover a una carpeta no servida) al cerrar el rediseño — es un artefacto de trabajo, no contenido del sitio. |
| `prompt-integracion-vs-exaltacion.md` | Archivo de prompt suelto en la raíz, sin trackear (`??` en `git status`) | No se commitea; si se commitea por error terminaría accesible como archivo estático. Dejar fuera del control de versiones o mover a una carpeta ignorada. |
| Newsletter: bloque "Alsina Pro $XX/mes (demo)", modal stub, banner "API response mock" | Ver Fase 1.1 | Eliminar en Fase 1 |
| Home: contadores que muestran "0" sin JS, "En los medios" vacío | Ver Fase 1.2 | Arreglar/comentar en Fase 1 |

## 6. Backend y datos (sin cambios — no es contenido de sitio)

| Recurso | Nota |
|---|---|
| `api/subscribe.js`, `api/confirm.js`, `api/unlock.js` | Ya implementados sobre Supabase + Resend, funcionando (ver hallazgos Fase 0 más abajo). Sin cambios de contenido. |
| `api/checkout.js` | Stub de Mercado Pago — se reemplaza en Fase 6.1, no es "contenido" sino backend. |
| `supabase-migration.sql`, `SETUP.md`, `.env.example` | Documentación/infra — sin cambios de contenido, se actualizan en Fase 6 si corresponde. |
| `Datos electorales/`, `Info_Municipios_nueva/`, `*.csv`, `*.xlsx`, `*.docx` sueltos en la raíz | Fuentes de datos internas para los informes, no se sirven como páginas — sin cambios. |

---

**Total de filas: 33. Todas tienen destino asignado**, salvo la sección "En los medios" (1.8, sin destino visible hasta tener contenido real — decisión consciente, no un olvido) y las dos ediciones de newsletter sueltas (fila 4, sección 4) que requieren tu confirmación sobre si son contenido real a preservar.
