# Informe: Electromovilidad en el territorio (Zona Norte)

Informe privado (plan Gobernador) en `/informe-electromovilidad-zona-norte.html`.
Describe mercado automotor, infraestructura de carga identificada y mapa
institucional/normativo en diez municipios de Zona Norte: San Isidro, Vicente
López, Tigre, Escobar, Pilar, San Fernando, San Miguel, General San Martín,
Malvinas Argentinas y José C. Paz. No es una landing comercial ni una
recomendación de inversión — ver la sección de cierre del propio informe.

## Mapa de archivos

| Archivo | Rol |
|---|---|
| `informe-electromovilidad-zona-norte.html` | Página del informe. Sin datos hardcodeados: todo lo renderiza `electromovilidad-app.js`. |
| `assets/js/electromovilidad-app.js` | Toda la lógica de render (síntesis, dashboard, mapa, explorador, infraestructura, institucional, glosario, metodología). |
| `assets/js/electromovilidad-indicadores.js` | Config pública y centralizada de indicadores (nombre, unidad, fórmula, utilidad, limitación). Único lugar donde se define un indicador. |
| `assets/data/zona-norte-partidos.json` | Geometría SVG real (pública, no sensible) de los 10 partidos — extraída de `alsina-mapa-politico.html`. |
| `scripts/data/electromovilidad-institucional.json` | Contenido institucional/normativo, editorial, de autoría manual. Se edita a mano. |
| `scripts/build-electromovilidad-data.mjs` | Script reproducible: lee el Excel fuente + el JSON institucional y genera el dataset privado. |
| `private/data/electromovilidad-zona-norte.json` | **Dataset privado generado.** Nunca se edita a mano ni se expone como estático — solo lo lee `api/monitor135/data.js`. |
| `api/monitor135/data.js` | Endpoint que sirve el dataset, gateado por `getResourceAccessLevel` sobre el recurso `informe-electromovilidad-zona-norte`. |
| `supabase/migrations/20260825150000_electromovilidad_resource.sql` | Alta del recurso, reutilizando la capacidad `report_premium_view` (Gobernador) ya existente. |

## Cómo se protege

- La página es públicamente ruteable (como `alsina-pbg-pba.html`), pero sin
  cuenta con acceso full solo muestra el estado `#emLocked` (sin datos).
- El dataset real nunca se sirve como archivo estático: vive en `private/`,
  bloqueado por `middleware.js`, y solo `api/monitor135/data.js` puede leerlo
  del filesystem en runtime (`vercel.json` ya incluye `private/**` para esa
  función).
- El endpoint resuelve el nivel de acceso server-side vía
  `getResourceAccessLevel(accountId, 'informe-electromovilidad-zona-norte')`
  — nunca confía en un query param o header del cliente. Si el nivel no es
  `'full'`, responde `{ access: { level: 'none' }, data: null }` sin leer el
  archivo.
- Se reutiliza la capacidad `report_premium_view` ya usada por otros
  informes Gobernador — no se creó un feature/plan nuevo, así que no hay
  impacto en planes ni precios existentes.
- Este dataset comparte endpoint con Monitor 135 por límite de infraestructura
  (Vercel Hobby: 12 Serverless Functions, el proyecto ya está en el límite),
  no por diseño — tiene su propia capacidad, resuelta de forma independiente.

## Cómo actualizar los datos cuando DNRPA publique un nuevo mes

1. Conseguir la nueva base con las mismas 4 hojas y columnas (Resumen / Base
   municipal / Enchufables detalle / Metodología y fuentes).
2. Correr `npm run build:electromovilidad -- ruta/al/nuevo.xlsx` (o sin
   argumento si se llama igual que el archivo original en la raíz del repo).
3. Revisar el resumen impreso por consola: totales agregados y la validación
   cruzada BEV/PHEV entre "Base municipal" y "Enchufables detalle" (debe
   imprimir ✓ para los 10 municipios).
4. Commitear `private/data/electromovilidad-zona-norte.json` regenerado.
5. El contenido institucional/normativo (`scripts/data/electromovilidad-
   institucional.json`) es editorial y se edita a mano — el script solo lo
   fusiona, nunca lo pisa ni lo genera.
6. Aplicar la migración `20260825150000_electromovilidad_resource.sql` contra
   Supabase si el recurso todavía no existe en el ambiente (ver estado
   pendiente más abajo).

## Pendiente de aplicar

La migración de Supabase (`supabase/migrations/20260825150000_electromovilidad
_resource.sql`) **no fue aplicada a ningún Supabase remoto** — este entorno no
tiene la CLI de Supabase autenticada. Aplicarla manualmente (SQL editor o
`supabase db push` desde un entorno con sesión activa) antes de que el plan
Gobernador dependa de este informe en producción. Rollback en
`supabase/rollbacks/20260825150000_electromovilidad_resource_rollback.sql`.

## Datos no incorporados por falta de información verificable

- Direcciones exactas, coordenadas, potencia, cantidad de conectores o estado
  operativo de cargadores: no existe un registro oficial nacional consolidado
  (el Registro Nacional de Infraestructura de Carga fue creado por Res.
  817/2023 y derogado por Res. 22/2025). Por eso la sección de infraestructura
  muestra únicamente nombres de establecimiento cuando están verificados, o
  un conteo agregado mínimo sin nombre ni ubicación cuando no lo están —
  nunca un marcador ficticio en el mapa.
- San Fernando, San Miguel, General San Martín, Malvinas Argentinas y José C.
  Paz no tienen sitios de carga identificados por nombre en el relevamiento
  utilizado (San Miguel y General San Martín sí tienen un conteo agregado
  mínimo de 1; los otros tres, cero identificados — lo que el informe aclara
  explícitamente no equivale a "sin cargadores").
