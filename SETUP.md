# Alsina — Setup de captación + gating

## Stack

- **Site**: HTML estático en Vercel (sin build system)
- **API**: Vercel Serverless Functions en `/api/` (Node.js 20)
- **Base de datos**: Supabase (PostgreSQL + RLS)
- **Email**: Resend (transaccional)
- **Pagos**: Mercado Pago — **TODO, no integrado todavía**

---

## 1. Configurar Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com)
2. En **SQL Editor**, ejecutá todo el contenido de `supabase-migration.sql`
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

Ver `.env.example` para todos los valores esperados.

---

## 4. Endpoints API

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/subscribe` | POST | Suscripción al newsletter + doble opt-in |
| `/api/confirm` | GET | Confirma suscripción (link del mail) |
| `/api/unlock` | POST | Desbloquea contenido (informe o data-hub) |
| `/api/checkout` | POST | **STUB** — simula suscripción premium |

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

### `/api/checkout` (stub)
```json
{ "email": "usuario@mail.com" }
// Response: { "ok": true, "mock": true }
```

---

## 5. Páginas con captación

| Página | Gate | Recurso |
|---|---|---|
| `/newsletter` | Suscripción newsletter | `newsletter` |
| `/alsina-pbg-pba.html` | Informe completo tras email | `pbg-pba` |
| `/municipios-data-hub.html` | Tabla completa + datos premium | `data-hub` |

---

## 6. TODO — Mercado Pago

El flujo de pago está preparado pero sin integrar:

- **`/api/checkout.js`**: tiene el stub y el comentario `// TODO: integrar Mercado Pago`
- **`/newsletter.html`**: tiene el modal demo + `startCheckout()`
- **Tabla `subscriptions`**: lista para recibir datos de pago
- **Campo `is_subscriber`** en `contacts`: se setea desde el checkout

Cuando estés listo para integrar:
1. Instalar: `npm install mercadopago`
2. Agregar `MERCADOPAGO_ACCESS_TOKEN` en Vercel env vars
3. Descomentar y completar el código en `api/checkout.js`
4. Actualizar `startCheckout()` en `newsletter.html` para redirigir al init_point de MP
