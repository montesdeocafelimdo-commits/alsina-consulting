# Activar Mercado Pago — checklist

El sitio funciona completo sin estas credenciales: mientras `PAYMENTS_ENABLED`
esté en `false` (o no exista), todos los botones de compra y de Alsina Pro
capturan el mail en una lista de espera — nunca se llama a la API de
Mercado Pago y nunca se muestra texto de demo/stub. Activar pagos es
**solo** cargar variables de entorno en Vercel; no hace falta tocar código.

Tiempo estimado: 30 minutos.

## 1. Crear las credenciales en Mercado Pago

1. Entrá a [mercadopago.com.ar/developers/panel](https://www.mercadopago.com.ar/developers/panel) con la cuenta de ALSINA.
2. Creá (o abrí) la aplicación **"Tus Integraciones"**.
3. En **Credenciales de producción**, copiá:
   - `Access Token` → `MP_ACCESS_TOKEN`
   - `Public Key` → `MP_PUBLIC_KEY`
4. En la misma app, sección **Notificaciones webhooks**, configurá la URL:
   `https://alsinaar.com/api/webhook`
   y copiá la **Clave secreta** que te genera → `MP_WEBHOOK_SECRET`.
5. Para probar antes de ir a producción, repetí los pasos 3 y 4 con las
   **credenciales de prueba (sandbox)** y usalas en un deploy de preview
   de Vercel primero.

## 2. Cargar las variables en Vercel

Dashboard del proyecto → **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `PAYMENTS_ENABLED` | `true` |
| `MP_ACCESS_TOKEN` | el access token del paso 1 |
| `MP_PUBLIC_KEY` | la public key del paso 1 |
| `MP_WEBHOOK_SECRET` | la clave secreta del webhook |

Redeployá (Vercel lo hace automático si son env vars nuevas en un proyecto
ya conectado a git, o hacé un redeploy manual desde el dashboard).

## 3. Verificar que quedó bien conectado

1. Abrí `https://alsinaar.com/api/config` — debe devolver
   `{"paymentsEnabled": true}`. Si sigue en `false`, revisá que la env var
   se llame exactamente `PAYMENTS_ENABLED` con valor `true` (string, no
   boolean) y que el deploy sea posterior a haberla cargado.
2. Entrá a `/index.html#precios` y a `/informes.html`: los botones de
   "Comprar" / "Suscribirme a Pro" ahora deben pedir el mail y redirigir a
   Mercado Pago en vez de mostrar el mensaje de lista de espera.
3. Hacé una **compra de prueba en sandbox**: con las credenciales de
   prueba cargadas en un preview de Vercel, comprá un informe usando una
   [tarjeta de prueba de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards).
   Confirmá que:
   - Te redirige a Mercado Pago y de vuelta a `/informes.html?compra=ok`.
   - Llega el webhook (revisá los logs de la función `api/webhook` en
     Vercel — debe loguear sin errores de firma).
   - Se crea la fila en la tabla `purchases` de Supabase.
   - Llega el mail de confirmación (vía Resend).
4. Repetí el punto 3 para una suscripción a Alsina Pro (`type: 'pro'`) y
   confirmá que se crea/actualiza la fila en `subscriptions` con
   `status: 'active'`.

## 4. Qué cambia en el sitio al activar

- `assets/js/checkout.js` detecta `PAYMENTS_ENABLED=true` (vía
  `/api/config`) y reemplaza los formularios de lista de espera por
  botones de compra real, sin necesidad de editar HTML.
- El scroll-gate de las notas largas (`assets/js/gate.js`) deja de pedir
  solo el mail y pasa a ofrecer "Seguí leyendo con Alsina Pro" /
  "Comprá este informe".
- `api/checkout.js` empieza a crear preferencias/suscripciones reales en
  Mercado Pago en lugar de anotar en la lista de espera.
- `api/webhook.js` empieza a validar la firma de las notificaciones
  (antes, sin `MP_WEBHOOK_SECRET`, las dejaba pasar con un warning en los
  logs — dejá de ver ese warning como señal de que quedó bien
  configurado).

## 5. Después de activar: informes premium

El contenido premium de las notas largas (Finanzas PBA, Súper RIGI, PBG,
Radiografía Fiscal) sigue estando en el HTML público — solo lo tapa un
degradé + gate hasta que se paga o se es Pro. Es aceptable como primera
etapa, pero no es protección real: alguien con conocimientos técnicos
puede leer el HTML servido. Si eso pasa a ser un problema (contenido de
mucho valor, filtraciones), el siguiente paso es mover ese contenido
también detrás de `/api/informe.js` (mismo mecanismo que ya protege los
informes de clientes) en vez de ocultarlo solo con CSS/JS.

## Precios

Los montos que cobra `api/checkout.js` están hardcodeados en ese archivo
(`PRICES.informe` y `PRICES.pro`) y deben coincidir con los que se
muestran en `assets/js/pricing.js`. Si cambian los precios, actualizar
en los dos lugares.
