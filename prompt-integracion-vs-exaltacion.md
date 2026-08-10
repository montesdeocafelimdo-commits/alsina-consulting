# Prompt de integración — Informe Exaltación de la Cruz
# Para usar en Claude desde VS Code

---

## Contexto del proyecto

Estoy trabajando en el sitio de **Alsina** (`alsina-consulting.vercel.app`), un sitio estático
deployado en Vercel. Ya tengo un archivo HTML completo del informe de Exaltación de la Cruz
llamado `exaltacion-de-la-cruz.html`. Necesito integrarlo al sitio y terminar algunos detalles.

El archivo usa estas dependencias CDN (ya incluidas en el `<head>`):
- Chart.js 4.4.2
- Leaflet.js 1.9.4
- Inter + JetBrains Mono (Google Fonts)

El GeoJSON del partido lo tengo en este proyecto en: `./geodatos/exaltacion.geojson`
(ruta relativa desde donde esté el HTML). El archivo ya tiene un `fetch('./exaltacion.geojson')`
con fallback a un polígono aproximado si el GeoJSON no existe.

---

## Lo que necesitás hacer

### 1. Ubicación del archivo en el proyecto

Mové `exaltacion-de-la-cruz.html` a la carpeta de informes del sitio. Típicamente sería:
```
/informes/exaltacion-de-la-cruz.html
```
o donde vos tengas la estructura de municipios. Ajustá la ruta del GeoJSON en el script
si la estructura de carpetas cambia:
```js
const GEOJSON_PATH = './geodatos/exaltacion.geojson';
// → ajustar si el HTML queda en /informes/:
const GEOJSON_PATH = '../geodatos/exaltacion.geojson';
```

### 2. Protección con contraseña (Vercel)

Para proteger `/informes/*`, creá un middleware de Edge en Vercel.
Agregá a tu proyecto el archivo `middleware.ts` (o `middleware.js`) en la raíz:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PROTECTED_PREFIX = '/informes'
const PASSWORD = process.env.REPORT_PASSWORD ?? 'alsina2026'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith(PROTECTED_PREFIX)) return NextResponse.next()

  const auth = request.headers.get('authorization')
  if (auth) {
    const [scheme, encoded] = auth.split(' ')
    if (scheme === 'Basic') {
      const [, pwd] = atob(encoded).split(':')
      if (pwd === PASSWORD) return NextResponse.next()
    }
  }

  return new NextResponse('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Informes Alsina"' },
  })
}

export const config = { matcher: ['/informes/:path*'] }
```

Luego en el Dashboard de Vercel → Settings → Environment Variables:
- `REPORT_PASSWORD` = la clave que quieras

**Alternativa sin Next.js (sitio estático puro):** usá un `vercel.json` con
`"headers"` y un script JS de login en el front-end que valide contra `sessionStorage`.

### 3. Enlace desde el nav del sitio

En el archivo HTML principal del sitio, agregá la entrada al menú de informes:
```html
<a href="/informes/exaltacion-de-la-cruz.html">
  Exaltación de la Cruz
</a>
```

### 4. Mapa — GeoJSON

El mapa Leaflet ya funciona sin el GeoJSON (usa un polígono aproximado como fallback).
Para activar el polígono exacto, asegurate de que `exaltacion.geojson` esté en la ruta
correcta relativa al HTML. El código relevante en el archivo está al final del `<script>`:

```js
const GEOJSON_PATH = './exaltacion.geojson'; // ← ajustá esta línea
```

### 5. Ajustes opcionales de contenido

Si querés actualizar algo desde VS Code, estos son los lugares clave:

**Historia electoral** — el timeline está en el Capítulo II, dentro del `<div class="timeline">`.
Cada `<div class="tl-item">` es un año electoral. La lógica de colores:
- `.tl-dot` (sin clase extra) = peronismo → verde teal
- `.tl-dot.cambiemos` = Cambiemos → ámbar
- `.tl-dot.lla` = La Libertad Avanza → púrpura

**Notas sobre los datos del Dashboard Alsina:**
- Los datos de transferencias (Capítulo III) son EXACTOS del Alsina Dashboard:
  - B1 2024 total: $3.956B
  - B1 2025 total: $12.927B
  - B1 2026 total: $17.871B
  - Copa B1 2026: $14.905B (+39,9% nominal / +5,7% real)
- El dashboard de Alsina **no tiene datos electorales cargados** para este municipio
  (campo vacío `{}`). Los resultados del timeline son de fuentes primarias (Junta Electoral PBA).
- El campo `pres_2026` en Alsina para este municipio es `0` (no cargado).

---

## Datos del municipio para referencia rápida

```
MUNICIPIO:         Exaltación de la Cruz
SECCIÓN ELECTORAL: 2.ª Sección PBA
CABECERA:          Capilla del Señor
COORDENADAS:       −34.268°S, −59.100°W
CUD %:             0.45705%
PADRÓN NAC.:       34.059 electores
POBLACIÓN 2022:    40.159 hab.
SUPERFICIE:        634,2 km²
INT. ELECTO:       Diego Nanni (fue a Diputado Provincial 2025)
INT. ACTUAL:       Vacante / sucesor de Nanni
FUERZA PERONISTA:  Fuerza Patria
RESULTADO 2023:    Nanni 47,2% · Sancho 32,0%
RESULTADO 2025:    Fuerza Patria (M. Nanni) 42,2% · LLA 35,9% · Potencia 9,5%
```

---

## Si querés crear el informe de otro municipio

Usá esta estructura de prompt:

```
Sos analista territorial de Alsina Consulting. Tu estilo es preciso y basado en datos.
Generá el informe HTML para el municipio de [NOMBRE] usando la misma estructura
que el archivo exaltacion-de-la-cruz.html del proyecto.

Datos del municipio (del Alsina Dashboard):
- Población: [N]
- Sección: [N.ª]
- Intendente: [Nombre] ([Partido])
- Resultado 2023: [...]
- Resultado 2025: [...]
- Copa B1 2026: $[N]M
- Total transferencias B1 2026: $[N]B

Historia electoral: [resumí los resultados principales]
Problema territorial principal: [describilo]

Generá el HTML completo reutilizando el CSS del informe de Exaltación.
```
