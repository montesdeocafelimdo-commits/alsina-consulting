import crypto from 'crypto';

// ALSINA — link de baja del newsletter sin login (2026-09-04, primer
// envío real por Resend). No agrega ninguna columna/tabla nueva: el
// token es un HMAC-SHA256 del accountId, firmado con CRON_SECRET (el
// mismo secreto ya usado para gatear las acciones admin — nunca se
// expone acá, un HMAC es unidireccional, no se puede recuperar el
// secreto a partir del token). Verificar el token alcanza para saber
// "este link es legítimo para este accountId", sin depender de una
// sesión ni de que la persona esté logueada — así tiene que ser un
// link de baja desde un mail.
//
// "Suscripto al newsletter" = email_preferences.editorial_opt_in = true
// (ver api/account.js) — la baja simplemente lo pone en false, mismo
// campo que ya usa el toggle de /cuenta.html. No hay una tabla
// separada de "suscriptores del newsletter": es un atributo de la
// cuenta.

function secret() {
  const s = process.env.CRON_SECRET;
  if (!s) throw new Error('CRON_SECRET no configurado — no se puede firmar/verificar el link de baja');
  return s;
}

export function buildUnsubscribeToken(accountId) {
  const sig = crypto.createHmac('sha256', secret()).update(accountId).digest('hex').slice(0, 32);
  return `${accountId}.${sig}`;
}

/** @returns {string|null} el accountId si el token es válido, null si no. */
export function verifyUnsubscribeToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [accountId, sig] = token.split('.');
  if (!accountId || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(accountId).digest('hex').slice(0, 32);
  // Comparación en tiempo constante — evita timing attacks para adivinar el HMAC.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return accountId;
}
