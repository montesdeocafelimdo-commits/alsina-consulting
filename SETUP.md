# Alsina — Setup de captación, gating y pagos

## Stack

- **Site**: HTML estático en Vercel (sin build system)
- **API**: Vercel Serverless Functions en `/api/` (Node.js 20)
- **Base de datos**: Supabase (PostgreSQL + RLS)
- **Email**: Resend (transaccional)
- **Pagos**: Mercado Pago — integración completa, apagada por defecto (ver `README-PAGOS.md`)

---

## 1. Configurar Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecutá todo el contenido de `supabase-migration.sql`
   (es acumulativo — si ya corriste una versión anterior, correlo de
   nuevo igual, todas las sentencias son `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`)
3. Copiá las credenciales desde **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. Configurar Resend

1. Creá cuenta en [resend.com](https://resend.com)
2. Verificá el dominio `alsinaar.com` en **Domains** (agrega los DNS records en Hostinger)
3. Creá una API key → `RESEND_API_KEY`

---

## 3. Variables de entorno en Vercel

En el dashboard de Vercel → **Settings → Environment Variables**, agregá:

| Variable | Dónde usarla |
|---|---|
| `SUPABASE_URL` | API serverless |
| `SUPABASE_SERVICE_ROLE_KEY` | API serverless (**nunca en el cliente**) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente (con RLS) |
| `RESEND_API_KEY` | API serverless (**nunca en el cliente**) |
| `SITE_URL` | `https://alsinaar.com` |
| `INFORME_KEY_HASH_OLAVARRIA` | API serverless — protección del informe de Olavarría |
| `INFORME_KEY_HASH_EXALTACION` | API serverless — protección del informe de Exaltación de la Cruz |
| `PAYMENTS_ENABLED` | `false` hasta activar pagos (ver `README-PAGOS.md`) |

Ver `.env.example` para todos los valores esperados, incluidas las de Mercado Pago.

---

## 4. Endpoints API

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/subscribe` | POST | Suscripción al newsletter + doble opt-in |
| `/api/confirm` | GET | Confirma suscripción (link del mail) |
| `/api/unlock` | POST | Desbloquea contenido (informe o data-hub) por mail |
| `/api/config` | GET | Expone flags de solo lectura al frontend (hoy: `paymentsEnabled`) |
| `/api/informe` | POST | Valida la clave de un informe de cliente y devuelve su HTML privado |
| `/api/checkout` | POST | Compra de informe o suscripción Pro. Con `PAYMENTS_ENABLED=false`, anota en lista de espera; con `true`, crea la preferencia/suscripción en Mercado Pago |
| `/api/webhook` | POST | Notificaciones de Mercado Pago (pago aprobado, suscripción activada) |

### `/api/subscribe`
```json
{ "email": "usuario@mail.com" }
// Response: { "status": "ok" | "already_subscribed" }
```

### `/api/unlock`
```json
{ "email": "usuario@mail.com", "resource": "pbg-pba" }
// Response: { "status": "ok" }
```

### `/api/informe`
```json
{ "slug": "olavarria", "key": "la-clave-del-cliente" }
// Response: HTML del informe (200) o mensaje de acceso denegado (401)
```

### `/api/checkout`
```json
{ "type": "informe" | "pro", "resource": "recaudacion", "email": "usuario@mail.com" }
// PAYMENTS_ENABLED=false -> { "status": "ok", "waitlist": true }
// PAYMENTS_ENABLED=true  -> { "status": "ok", "checkoutUrl": "https://mercadopago..." }
```

---

## 5. Páginas con captación o gating

| Página | Mecanismo | Recurso / detalle |
|---|---|---|
| `/newsletter.html` | Suscripción newsletter | `/api/subscribe` |
| `/municipios-data-hub.html` | Modal suave (no bloqueante) | mapa y tabla comparativa 100% abiertos |
| `/alsina-mapa-politico.html` | Modal suave (no bloqueante) | 100% abierto |
| `/alsina-nota-finanzas-pba.html`, `/alsina-informe-super-rigi.html`, `/alsina-pbg-pba.html`, `/alsina-recaudacion-tributaria-pba.html` | Scroll gate al 30% | contenido completo en el HTML, tapado con degradé hasta dejar el mail (o comprar, con pagos activos) |
| `/alsina-presupuesto-impositiva-2026.html` | Ninguno — nota de muestra | 100% abierta a propósito |
| `/informes/olavarria.html`, `/informes/exaltacion-de-la-cruz.html` | Clave por cliente, validada server-side | el contenido real vive en `private/informes/` y nunca se sirve sin pasar por `/api/informe` |

---

## 6. Mercado Pago

Ver `README-PAGOS.md` para el checklist completo de activación.
