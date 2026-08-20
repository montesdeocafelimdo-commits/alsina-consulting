import { Resend } from 'resend';
import { WebhookSignatureValidator } from 'mercadopago';
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

// Verifica la firma que manda Mercado Pago (header x-signature) usando el
// validador oficial del SDK. Si MP_WEBHOOK_SECRET todavía no está
// configurado, deja pasar la notificación igual (para no romper mientras
// se activa) pero deja un warning — configurarlo es obligatorio antes de
// ir a producción con pagos reales (ver README-PAGOS.md).
function verifySignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('MP_WEBHOOK_SECRET no configurado — firma no verificada');
    return true;
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId: req.query['data.id'],
      secret,
      toleranceSeconds: 300,
    });
    return true;
  } catch (err) {
    console.error('Firma de webhook rechazada:', err.reason || err.message);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  const type = req.body?.type || req.query.type;
  const dataId = req.body?.data?.id || req.query['data.id'] || req.query.id;

  if (!dataId || (type !== 'payment' && type !== 'subscription_preapproval')) {
    // Otros tipos de notificación (merchant_order, etc.) — se acusa
    // recibo sin procesar para que MP no reintente indefinidamente.
    return res.status(200).json({ received: true });
  }

  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Firma inválida' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('MP_ACCESS_TOKEN no configurado');
    return res.status(500).json({ error: 'No configurado' });
  }

  let supa;
  try {
    supa = getSupabaseAdmin();
  } catch (err) {
    console.error('Supabase admin client error:', err.message);
    return res.status(500).json({ error: 'No configurado' });
  }

  try {
    if (type === 'payment') {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payment = await r.json();

      if (payment.status !== 'approved') {
        return res.status(200).json({ received: true, status: payment.status });
      }

      const [, resource, email] = (payment.external_reference || '').split(':');
      if (!email || !resource) {
        console.error('external_reference inesperado:', payment.external_reference);
        return res.status(200).json({ received: true });
      }

      await supa.from('purchases').upsert(
        {
          email,
          resource,
          mp_payment_id: String(dataId),
          amount: payment.transaction_amount,
          status: 'paid',
        },
        { onConflict: 'mp_payment_id' }
      );

      // Mismo mecanismo de desbloqueo que /api/unlock — acceso inmediato.
      await supa
        .from('unlocks')
        .upsert({ email, resource }, { onConflict: 'email,resource', ignoreDuplicates: true });

      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Alsina Consulting <newsletter@alsinaar.com>',
        to: email,
        subject: `Tu informe está listo — ${resource}`,
        html: `<p>Gracias por tu compra. Ya tenés acceso a tu informe.</p>
               <p><a href="${SITE_URL}/informes.html">Ver mis informes en alsinaar.com</a></p>`,
      });
    }

    if (type === 'subscription_preapproval') {
      const r = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const sub = await r.json();
      const email = (sub.external_reference || '').split(':')[1] || sub.payer_email;
      if (!email) {
        console.error('No se pudo determinar el email de la suscripción', dataId);
        return res.status(200).json({ received: true });
      }

      const status = sub.status === 'authorized' ? 'active' : sub.status;

      await supa.from('subscriptions').upsert(
        {
          email,
          plan: 'pro',
          status,
          mp_preapproval_id: String(dataId),
          started_at: new Date().toISOString(),
        },
        { onConflict: 'mp_preapproval_id' }
      );

      if (status === 'active') {
        await supa.from('contacts').update({ is_subscriber: true }).eq('email', email);
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Alsina Consulting <newsletter@alsinaar.com>',
          to: email,
          subject: 'Bienvenido a Alsina Pro',
          html: `<p>Tu suscripción a Alsina Pro está activa. Ya tenés acceso completo al Monitor 135, todos los informes y la Señal Alsina.</p>
                 <p><a href="${SITE_URL}/municipios-data-hub.html">Abrir el Monitor 135</a></p>`,
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
}
