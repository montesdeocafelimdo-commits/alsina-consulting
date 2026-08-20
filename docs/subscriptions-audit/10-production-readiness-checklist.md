# 10 — Checklist de preparación para producción

Actualizado tras la aprobación de las decisiones en [11-approved-decisions.md](11-approved-decisions.md). Ya no incluye ítems que eran preguntas de negocio (esos están resueltos, ver [08-decisions-required.md](08-decisions-required.md)) ni correcciones de código (esas son criterios de aceptación de fase, ver [09-implementation-plan.md](09-implementation-plan.md)). Lo que queda acá son exclusivamente **verificaciones y gestiones externas al repositorio** — nada de esto se resolvió ni se verificó en esta ejecución.

## Vercel

- [ ] Confirmar Team propietario, nombre y miembros con rol — **Team → Settings → General/Members**.
- [ ] Confirmar plan contratado (Pro) en **Team → Settings → Billing**.
- [ ] Confirmar dominio `alsinaar.com` enlazado y redirects — **Proyecto → Settings → Domains**.
- [ ] Confirmar rama de producción — **Proyecto → Settings → Git**.
- [ ] Listar variables de entorno cargadas por entorno (local/preview/production) — **Proyecto → Settings → Environment Variables**.
- [ ] Revisar Usage y Spend Management — **Team → Settings → Billing → Usage / Spend Management**.
- [ ] Revisar protección de previews y accesos del equipo — **Proyecto → Settings → Deployment Protection**.

## Supabase

- [ ] Confirmar organización, proyecto y `project_ref` reales — **Project Settings → General**.
- [ ] Confirmar plan contratado (Pro) — **Project Settings → Billing**.
- [ ] Confirmar región y versión de Postgres — **Project Settings → Infrastructure**.
- [ ] Revisar backups y retención, y **ejecutar una prueba real de restauración** (AD-16 lo exige explícitamente, no alcanza con que el backup exista) — **Database → Backups**.

## Resend

- [ ] Confirmar dominio `alsinaar.com` verificado (SPF/DKIM/DMARC) — **Domains**.
- [ ] Confirmar plan y consumo — **Settings → Billing**.
- [ ] Confirmar plan/cupo de Marketing si se usa Broadcasts a futuro — **Audiences/Broadcasts**.
- [ ] **Crear y confirmar que reciben respuestas** las dos casillas aprobadas en AD-14: `newsletter@alsinaar.com` (editorial) e `info@alsinaar.com` (transaccional) — hoy solo existe evidencia de uso de `newsletter@alsinaar.com` en el código, `info@alsinaar.com` no está creada ni verificada.

## Mercado Pago

- [ ] Confirmar que la aplicación usada pertenece a la cuenta comercial de Alsina, no a una cuenta personal — panel `mercadopago.com.ar/developers/panel`.
- [ ] Confirmar nombre/ID de la aplicación.
- [ ] Confirmar que existen credenciales de prueba y de producción, cargadas en los entornos de Vercel correspondientes.
- [ ] **Crear y asociar los planes/configuraciones recurrentes de Mercado Pago para Intendente y Gobernador por separado** (AD-03 exige configuraciones distintas por nivel — hoy no existe ninguna, el código actual usa un único monto hardcodeado).
- [ ] Confirmar la URL de notificaciones webhook configurada en el panel coincide con `https://alsinaar.com/api/webhook`.
- [ ] Confirmar que hay una **Clave secreta** de webhook generada y cargada como `MP_WEBHOOK_SECRET` — bloqueante de seguridad (AD-07: sin esto, no se puede activar pagos en producción bajo ninguna circunstancia).
- [ ] Hacer una compra de prueba en sandbox para cada plan (Intendente y Gobernador por separado) antes de cualquier prueba con dinero real.

## Situación fiscal y facturación (nuevo — AD-08)

- [ ] Confirmar situación fiscal de Alsina (monotributo, responsable inscripto, u otra).
- [ ] Confirmar CUIT emisor, tipo de factura y punto de venta a usar.
- [ ] Confirmar tratamiento de IVA aplicable a los tres precios (ya se decidió que son precios finales para el cliente, AD-08 — falta la mecánica fiscal detrás).
- [ ] Confirmar credenciales y mecanismo de integración con ARCA.
- [ ] Confirmar procedimiento de emisión de notas de crédito ante reembolsos.
- [ ] **No emitir ninguna factura fiscal real ni cargar credenciales de ARCA hasta cerrar todo lo anterior** — el modelo interno de `invoices` (`pending`/`issued`/`failed`/`cancelled`/`credited`) puede construirse en FASE 4 sin esto, pero no puede emitir comprobantes reales.

## Claves institucionales (AD-15)

- [ ] Confirmar si `INFORME_KEY_HASH_OLAVARRIA`/`INFORME_KEY_HASH_EXALTACION` siguen siendo los placeholders documentados en `.env.example` (`"olavarria-2026"`/`"exaltacion-2026"`).
- [ ] Si lo son, rotarlas y avisar la clave nueva a cada cliente antes de producción — no rotar sin verificación humana del entorno correcto.

## Revisión jurídica (AD-12)

- [ ] Revisión legal de términos y condiciones, política de privacidad, política de cancelación y **derecho de arrepentimiento** en contratación online (relevante porque la cancelación es autoservicio y sin fricción, AD-12 lo señala explícitamente para revisión).

## GitHub

- [ ] Confirmar reglas de protección de rama sobre `main` — **Settings → Branches**.
- [ ] Decidir y documentar si se agrega CI antes de que el volumen de cambios de esta iniciativa lo haga necesario.
- [ ] Revisar el token embebido en la URL del remote `origin` (hallazgo de seguridad fuera de alcance de pagos, ver [01-account-and-environment-matrix.md](01-account-and-environment-matrix.md)).

---

Ningún ítem de esta lista se marcó como completado por esta ejecución — todos siguen pendientes de gestión humana o de verificación en un panel externo. Ninguno de ellos bloquea el inicio de FASE 1.
