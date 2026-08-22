# 13 — Carga de administradores (AD-17)

Procedimiento listo, pendiente únicamente de los 6 emails reales (no se
inventa ninguno). `admin_users.profile_id` referencia `profiles(id)` —
cada persona necesita haber iniciado sesión al menos una vez (magic
link, crea su cuenta Concejal automáticamente) **antes** de poder
cargarse acá.

## Carga (idempotente)

Con los 6 emails confirmados, se ejecuta una sola vez por persona:

```sql
insert into admin_users (profile_id, role, label)
select id, 'super_admin', 'Felipe' from profiles where email = 'EMAIL_DE_FELIPE'
on conflict (profile_id) do update set role = excluded.role, label = excluded.label;

insert into admin_users (profile_id, role, label)
select id, 'partner', 'Socio' from profiles where email = 'EMAIL_DEL_SOCIO_N'
on conflict (profile_id) do update set role = excluded.role, label = excluded.label;
-- (repetir para los 5 socios)
```

`on conflict (profile_id) do update` la hace segura de correr más de una
vez (ej. si se corrige un rol) sin duplicar filas ni fallar.

Si alguna persona todavía no inició sesión, el `select ... from profiles
where email = ...` no devuelve ninguna fila y el `insert` no inserta
nada — no falla, pero tampoco queda cargada. Hay que confirmar que las 6
`profiles` existan antes de correr esto (pedirles que entren una vez a
`/cuenta.html` con su mail).

## MFA (AD-17: "exigir cuentas separadas y MFA a los 6 administradores")

Supabase Auth MFA es autoservicio — nadie externo puede activarlo *por*
otra persona, cada quien lo hace desde su propia sesión. Hoy no hay UI
en el sitio para esto; el camino disponible ahora mismo:

1. La persona inicia sesión normalmente en `/cuenta.html`.
2. Desde la consola del navegador (temporal, hasta que exista una
   pantalla dedicada), con la sesión ya iniciada:
   ```js
   const supa = await window.AlsinaAuth /* ver getClient() interno */;
   ```
   — en la práctica, más simple: agregar una pantalla real de
   "Seguridad" en `/admin.html` que llame a
   `supabase.auth.mfa.enroll({ factorType: 'totp' })`, muestre el QR, y
   `supabase.auth.mfa.challengeAndVerify(...)` para confirmarlo. **No
   implementado todavía** — queda como próximo paso concreto, no como
   promesa vaga: es una pantalla acotada (un botón, un QR, un input de
   6 dígitos) sobre una función que Supabase ya expone.
3. Alternativa mientras tanto: activarlo manualmente desde el dashboard
   de Supabase (Authentication → Users → cada usuario → MFA), si el
   dashboard lo permite forzar por admin — a confirmar contra la versión
   real del dashboard, no asumido acá.

No hay forma de "forzar" MFA server-side sin que la persona complete el
enrolamiento — eso es una propiedad del protocolo TOTP, no una
limitación de este sitio.
