import { Resend } from 'resend';
import { getSupabaseAdmin } from './supabaseAdmin.js';

// ALSINA — envío transaccional centralizado (AD-14, FASE 6).
// Un solo lugar define los remitentes — nada de hardcodear
// "Alsina Consulting <newsletter@alsinaar.com>" en cada endpoint.
//
// Patrón outbox mínimo: cada envío queda registrado en email_outbox antes
// y después de intentarlo (para poder auditar/reintentar), pero el envío
// en sí es síncrono todavía — el reintento automático por cron es trabajo
// de FASE 8, no implementado en esta pasada.

// Dominio verificado en Resend: alsinaar.com directo (antes se usaba el
// subdominio nw.alsinaar.com como workaround mientras el dominio real
// todavía no estaba verificado — ya no hace falta). From y Reply-To
// coinciden, mismo dominio.
export const SENDERS = {
  editorial: { from: 'Alsina <newsletter@alsinaar.com>', replyTo: 'newsletter@alsinaar.com' },
  transactional: { from: 'Alsina <info@alsinaar.com>', replyTo: 'info@alsinaar.com' },
};

/**
 * @param {{ to: string, subject: string, html: string, templateKey: string,
 *           accountId?: string|null, channel?: 'editorial'|'transactional' }} params
 */
export async function sendEmail({ to, subject, html, templateKey, accountId = null, channel = 'transactional' }) {
  const supa = getSupabaseAdmin();
  const sender = channel === 'editorial' ? SENDERS.editorial : SENDERS.transactional;

  const { data: outboxRow, error: insertError } = await supa
    .from('email_outbox')
    .insert({ account_id: accountId, to_email: to, template_key: templateKey, status: 'pending' })
    .select('id')
    .single();
  if (insertError) {
    console.error('email_outbox insert error:', insertError.message);
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({ from: sender.from, to, subject, html, reply_to: sender.replyTo });
    if (sendError) throw new Error(sendError.message || 'resend_error');

    if (outboxRow) {
      await supa
        .from('email_outbox')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', outboxRow.id);
    }
    return { status: 'sent' };
  } catch (err) {
    console.error(`Email "${templateKey}" a cuenta no enviado:`, err.message);
    if (outboxRow) {
      await supa
        .from('email_outbox')
        .update({ status: 'failed', last_error: err.message, attempts: 1 })
        .eq('id', outboxRow.id);
    }
    // No relanzar: un email que falla nunca debe tumbar el flujo de pago/
    // acceso que lo disparó (el pago/webhook ya se procesó igual).
    return { status: 'failed', error: err.message };
  }
}

function shell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0e1c20;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0e1c20;padding:28px 40px 20px;border-bottom:2px solid #00D5D8;">
    <div style="font-weight:900;font-size:20px;letter-spacing:5px;color:#F3EFE7;">ALSINA</div>
  </div>
  <div style="padding:40px;background:#152830;">
    <h1 style="font-size:22px;font-weight:900;color:#F3EFE7;margin:0 0 16px;">${title}</h1>
    <div style="font-size:14px;color:#9e9992;line-height:1.75;">${bodyHtml}</div>
  </div>
  <div style="padding:18px 40px;background:#0e1c20;text-align:center;">
    <div style="font-size:9px;color:rgba(158,153,146,0.35);">© 2026 Alsina · alsinaar.com</div>
  </div>
</div></body></html>`;
}

export const templates = {
  subscriptionActive: (planName) => shell(
    `Bienvenido a Alsina ${planName}`,
    `<p>Tu suscripción está activa. Ya tenés acceso a los beneficios de tu plan.</p>
     <p><a href="https://alsinaar.com/cuenta.html" style="color:#00D5D8;">Ver mi cuenta →</a></p>`
  ),
  paymentFailedFirstNotice: (planName) => shell(
    'Hubo un problema con tu pago',
    `<p>No pudimos procesar el cobro de tu suscripción a ${planName}. Tenés 5 días para actualizar tu medio de pago sin perder el acceso.</p>
     <p><a href="https://alsinaar.com/cuenta.html" style="color:#00D5D8;">Actualizar medio de pago →</a></p>`
  ),
  paymentFailedFinalNotice: (planName) => shell(
    'Último aviso — tu suscripción se suspende en 24 horas',
    `<p>Seguimos sin poder cobrar tu suscripción a ${planName}. Si no se regulariza, mañana perdés el acceso a los beneficios pagos (conservás Concejal).</p>
     <p><a href="https://alsinaar.com/cuenta.html" style="color:#00D5D8;">Actualizar medio de pago →</a></p>`
  ),
  paymentRecovered: (planName) => shell(
    'Tu acceso se restableció',
    `<p>Pudimos procesar el pago pendiente de ${planName} y tu acceso pago está activo de nuevo, sin cambios en tu plan ni en tu precio.</p>`
  ),
  suspended: (planName) => shell(
    'Tu suscripción quedó suspendida',
    `<p>No se pudo regularizar el pago de ${planName} y tu acceso pago quedó suspendido. Conservás tu cuenta Concejal sin cambios.</p>
     <p><a href="https://alsinaar.com/planes.html" style="color:#00D5D8;">Reactivar mi plan →</a></p>`
  ),
  cancellationConfirmed: (paidThroughDate) => shell(
    'Confirmamos tu cancelación',
    `<p>Tu suscripción va a estar activa hasta el ${paidThroughDate}. Después de esa fecha pasás a Concejal, sin cargo.</p>
     <p>Podés revertir esto en cualquier momento antes de esa fecha desde tu cuenta.</p>`
  ),
  planChanged: (planName) => shell(
    `Ahora sos ${planName}`,
    `<p>Tu cambio de plan ya está activo.</p>`
  ),
  checkoutAbandoned: (planName) => shell(
    `Tu suscripción a ${planName} todavía no se completó`,
    `<p>Empezaste a suscribirte a ${planName} pero el pago no se terminó de confirmar. Tu cuenta sigue como estaba — podés retomarlo cuando quieras, no perdiste nada.</p>
     <p><a href="https://alsinaar.com/planes.html" style="color:#00D5D8;">Continuar suscripción →</a></p>`
  ),
};
