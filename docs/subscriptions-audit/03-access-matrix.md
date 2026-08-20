# 03 — Matriz de acceso (estado actual vs. modelo objetivo)

## Estado actual: no hay matriz de acceso, hay un interruptor binario

Hoy no existen "tipos de usuario" en el sentido del prompt maestro. Lo único que el sistema distingue es:

1. **Anónimo sin mail** → ve todo el contenido público completo (el gate es cosmético, ver 02), no puede acceder a informes de clientes ni comprar.
2. **Anónimo que dejó el mail** (`localStorage.alsina_email_given = '1'`, más una fila en `contacts`/`unlocks`) → deja de ver los gates, sigue viendo exactamente el mismo contenido que el anónimo (porque el contenido gateado ya estaba completo en el HTML). No hay ninguna verificación de servidor de que ese mail sea "suyo" en visitas futuras — es un flag de `localStorage`, trivialmente reseteable.
3. **Con clave de cliente institucional** (Olavarría / Exaltación de la Cruz) → acceso a un único informe estático, validado por hash compartido, sin cuenta ni sesión.
4. **`is_subscriber = true` en `contacts`** (seteado únicamente por el webhook cuando una `PreApproval` de MP queda `active`) → **no cambia nada visible en el sitio**: no hay ningún punto del código que lea `contacts.is_subscriber` para condicionar contenido. Es un campo que se escribe pero nunca se lee.

No hay sesión de servidor en ningún punto: nada usa cookies de sesión, JWT, ni Supabase Auth. El único "estado" persistente del lado del navegador es `localStorage`/`sessionStorage`, que no autoriza nada del lado del servidor.

## Comparación contra los tipos de usuario del prompt maestro

| Tipo previsto | Existe hoy | Evidencia |
|---|---|---|
| Visitante | Sí (es el default) | — |
| Usuario registrado sin suscripción | **No** — no hay registro de usuario, solo captura de email en una tabla de leads | `contacts` no es una tabla de usuarios, no tiene contraseña, no tiene sesión asociada |
| Suscriptor individual | **No, a medias** — `subscriptions`/`purchases` existen pero no están atadas a ninguna identidad autenticada, solo a un email de texto libre | [supabase-migration.sql](../../supabase-migration.sql) |
| Cuenta institucional/organización | **No existe en absoluto** — no hay tabla `accounts` ni ningún concepto de organización. Los "informes de clientes" (Olavarría, Exaltación de la Cruz) son lo más cercano, pero son páginas estáticas con clave compartida, no cuentas | [api/informe.js](../../api/informe.js) |
| Miembro invitado de organización | **No existe** — no hay tabla de invitaciones ni de miembros | — |
| Equipo Alsina (Editor/Soporte/Admin/Superadmin) | **No existe** — no hay ningún login administrativo, ningún rol, ningún panel de administración | — |

## Matriz de acceso a recursos hoy (real, no la deseada)

| Recurso | Anónimo | Dejó el mail | `is_subscriber=true` en base | Clave de cliente |
|---|---|---|---|---|
| Notas públicas (`alsina-presupuesto-impositiva-2026.html`, etc.) | Acceso total | Acceso total | Acceso total | Acceso total |
| Notas con scroll-gate (Finanzas PBA, Súper RIGI, PBG, Recaudación) | Contenido completo en el HTML, tapado por CSS hasta accionar el gate | Igual — el gate ya no se dispara pero el contenido era el mismo | Sin diferencia — nada lee este campo | Sin relación |
| Monitor 135 / Mapa político | Acceso total, con modal no bloqueante | Acceso total | Sin diferencia | Sin relación |
| Informes de clientes (Olavarría / Exaltación de la Cruz) | Denegado (401) sin clave | Denegado sin clave | Denegado sin clave — el campo `is_subscriber` no participa de esta verificación | Acceso al informe correspondiente |
| Descargas | No existen (ver 02) | No existen | No existen | No existen |
| Bases municipales / dashboards completos ("Gobernador") | No existen como recurso diferenciado | No existen | No existen | No existen |

**Conclusión**: la matriz de acceso real hoy tiene **una sola fila efectiva** (todo público, salvo dos informes institucionales con clave fija). Nada en el código actual distingue Intendente/Ministro/Gobernador, ni siquiera a nivel de intención (el único lugar donde esos tres nombres existen es el copy de la tabla comparativa de precios). Construir la matriz real de capacidades por plan es trabajo de FASE 1 (tablas `plans`/`features`/`plan_features`/`resources`) y FASE 2 (resolución centralizada de capacidades), no algo que se pueda derivar de código existente.

## Riesgo detectado si se activa `PAYMENTS_ENABLED=true` sin resolver esto primero

Ya descrito en el resumen ejecutivo: los tres botones de plan cobran el mismo monto vía `PreApproval` sin importar cuál se eligió, y ningún plan efectivamente desbloquea nada distinto porque no hay lectura de `is_subscriber` ni de `plan` en ningún punto de gating. Es decir, hoy **cobrar "funciona" (crea el `PreApproval`, el webhook lo registra) pero no autoriza nada acorde al plan pagado**. No activar pagos en producción hasta resolver esto — ya es la postura por defecto del propio código (`PAYMENTS_ENABLED=false`), y esta auditoría la confirma como correcta.
