import { Resend } from 'resend';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  const clean = (email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return res.status(400).json({ error: 'Email inválido' });
  }

  let supa;
  try {
    supa = getSupabaseAdmin();
  } catch (err) {
    console.error('Supabase admin client error:', err.message);
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  const { data: existing } = await supa
    .from('contacts')
    .select('id, confirmed, confirmation_token')
    .eq('email', clean)
    .maybeSingle();

  if (existing?.confirmed) {
    return res.status(200).json({ status: 'already_subscribed' });
  }

  let token;
  if (existing) {
    token = existing.confirmation_token;
  } else {
    const { data, error } = await supa
      .from('contacts')
      .insert({ email: clean, source: 'newsletter' })
      .select('confirmation_token')
      .single();
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Error al registrar el contacto' });
    }
    token = data.confirmation_token;
  }

  // TODO: sync opcional a Resend Audiences o Brevo
  // await syncToAudience(clean);

  const confirmUrl = `${SITE_URL}/api/confirm?token=${token}`;
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error: mailError } = await resend.emails.send({
    // Dominio verificado: nw.alsinaar.com ("newletter" sin la segunda
    // "s", a propósito — ver api/_lib/email.js). Reply-To sin el
    // subdominio, ahí es donde llegan las respuestas.
    from: 'Alsina <newletter@nw.alsinaar.com>',
    reply_to: 'newletter@alsinaar.com',
    to: clean,
    subject: 'Confirmá tu suscripción a la Señal Alsina',
    html: buildWelcomeEmail(confirmUrl),
  });

  if (mailError) console.error('Resend error:', mailError);

  return res.status(200).json({ status: 'ok' });
}

function buildWelcomeEmail(confirmUrl) {
  const sections = [
    'La señal de la quincena',
    'Tema protagonista del mes (antesala del informe)',
    'Radar 135 — dato de un municipio',
    'Recurso de la casa',
    'Cierre + próximos pasos',
  ];
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0e1c20;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;">

  <!-- Header -->
  <div style="background:#0e1c20;padding:28px 40px 20px;border-bottom:2px solid #00D5D8;">
    <div style="font-family:Arial,sans-serif;font-weight:900;font-size:20px;letter-spacing:5px;color:#F3EFE7;">ALSINA</div>
    <div style="font-size:9px;color:#9e9992;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">Análisis · Estrategia · Impacto</div>
  </div>

  <!-- Body -->
  <div style="padding:40px;background:#152830;">
    <div style="font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#00D5D8;margin-bottom:20px;">Señal Alsina</div>
    <h1 style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#F3EFE7;line-height:1.1;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">
      Confirmá tu<br>suscripción
    </h1>
    <p style="font-size:14px;color:#9e9992;line-height:1.75;margin:0 0 28px;">
      Estás a un clic de recibir la Señal Alsina — análisis quincenal sobre gestión pública,
      finanzas municipales y política en los 135 partidos bonaerenses de la PBA.
    </p>
    <div style="margin:32px 0;">
      <a href="${confirmUrl}"
         style="display:inline-block;background:#00D5D8;color:#0e1c20;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;text-decoration:none;padding:16px 36px;">
        Confirmar suscripción →
      </a>
    </div>
    <p style="font-size:11px;color:rgba(158,153,146,0.55);line-height:1.6;margin:24px 0 0;">
      Si no pediste suscribirte, ignorá este mail.<br>
      Si el botón no funciona, copiá esta URL:<br>
      <a href="${confirmUrl}" style="color:#00D5D8;word-break:break-all;font-size:10px;">${confirmUrl}</a>
    </p>
  </div>

  <!-- What's included -->
  <div style="padding:28px 40px;background:#0e1c20;border-top:1px solid rgba(0,213,216,0.1);">
    <div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(0,213,216,0.6);margin-bottom:16px;">
      Cada quincena vas a recibir
    </div>
    ${sections.map(s => `
    <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
      <div style="width:5px;height:5px;background:#00D5D8;border-radius:50%;flex-shrink:0;"></div>
      <div style="font-size:12px;color:#9e9992;">${s}</div>
    </div>`).join('')}
    <div style="margin-top:20px;font-size:11px;color:rgba(158,153,146,0.4);">
      Frecuencia: quincenal · Por ahora gratis · En unos meses pasa a premium.
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:18px 40px;background:#0e1c20;border-top:1px solid rgba(0,213,216,0.06);text-align:center;">
    <div style="font-size:9px;color:rgba(158,153,146,0.35);letter-spacing:1px;">
      © 2026 Alsina · <a href="https://alsinaar.com" style="color:rgba(0,213,216,0.5);text-decoration:none;">alsinaar.com</a> · Provincia de Buenos Aires
    </div>
  </div>

</div>
</body>
</html>`;
}
