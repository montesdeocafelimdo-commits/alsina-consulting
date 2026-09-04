import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { verifyUnsubscribeToken } from '../unsubscribeToken.js';

// ALSINA — baja del newsletter desde el link del mail, sin login (ver
// api/_lib/unsubscribeToken.js para el diseño del token). Vive acá (no
// como api/unsubscribe.js suelto) por el límite de 12 Serverless
// Functions del plan Hobby de Vercel — ya estaba en el tope justo antes
// de esto (ver comentario en api/subscriptions/[action].js). A
// propósito NO pasa por requireCronAuth: quien la clickea es una
// persona real desde su mail, sin sesión — el token HMAC es la única
// autorización que hace falta acá, no CRON_SECRET.
//
// GET porque es un link que se clickea, no un formulario. Pone
// email_preferences.editorial_opt_in en false — el mismo campo que ya
// usa el toggle de /cuenta.html, no crea ninguna tabla/columna nueva.

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

function page(title, message) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Alsina</title></head>
<body style="margin:0;padding:0;background:#0e1c20;font-family:Arial,Helvetica,sans-serif;color:#F3EFE7;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;">
<div style="max-width:420px;padding:32px;">
  <div style="font-weight:900;font-size:20px;letter-spacing:5px;margin-bottom:24px;">ALSINA</div>
  <h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
  <p style="font-size:14px;color:#9e9992;line-height:1.6;">${message}</p>
  <p style="margin-top:24px;"><a href="${SITE_URL}" style="color:#00D5D8;text-decoration:none;">Volver a alsinaar.com →</a></p>
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const accountId = verifyUnsubscribeToken(req.query?.token);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!accountId) {
    return res.status(400).send(page('Link inválido', 'Este link de baja no es válido. Si querés darte de baja, escribinos a newsletter@alsinaar.com.'));
  }

  const supa = getSupabaseAdmin();
  const { error } = await supa.from('email_preferences').update({ editorial_opt_in: false }).eq('account_id', accountId);

  if (error) {
    console.error('unsubscribe: error actualizando email_preferences:', error.message);
    return res.status(500).send(page('Algo salió mal', 'No pudimos procesar la baja. Escribinos a newsletter@alsinaar.com y lo resolvemos a mano.'));
  }
  return res.status(200).send(page('Listo, te diste de baja', 'No vas a recibir más el newsletter de Alsina. Tu cuenta y tu plan siguen exactamente igual — esto solo afecta al newsletter.'));
}
