import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { handlePaymentEvent } from '../../mercadopago-webhook.js';

// ALSINA — reprocesamiento manual de un pago real que Mercado Pago sí
// aprobó pero cuyo webhook nunca se pudo confirmar (bug real del SDK
// con TimestampOutOfTolerance, ya corregido en api/mercadopago-webhook.js
// — esto es para destrabar lo que quedó pendiente de ANTES del fix).
// Gateado con CRON_SECRET. Nunca inventa nada: busca el pago real
// asociado a la preapproval en la API de Mercado Pago y corre EXACTAMENTE
// la misma lógica que el webhook real (handlePaymentEvent), con la misma
// idempotencia vía payment_provider_events — si el webhook real llega
// después, no duplica nada.
// body: { provider_subscription_id } (la preapproval id).

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;

  const { provider_subscription_id: preapprovalId } = req.body || {};
  if (!preapprovalId) return res.status(400).json({ error: 'provider_subscription_id_requerido' });
  if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'pagos_no_configurados' });

  const r = await fetch(`https://api.mercadopago.com/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) return res.status(502).json({ error: 'mp_search_failed', status: r.status, body: await r.text() });
  const search = await r.json();
  const results = search.results || [];
  if (!results.length) return res.status(404).json({ error: 'sin_pagos_para_esta_preapproval', raw: search });

  const supa = getSupabaseAdmin();
  if (req.query?.raw === 'true') return res.status(200).json({ raw: search });

  const processed = [];
  for (const authorizedPayment of results) {
    // authorized_payments/search devuelve un ID propio (el de la fila
    // de "pago autorizado" de la suscripción) distinto del ID real del
    // recurso Payment de Mercado Pago — el que hace falta es el anidado
    // en payment.id, que es el que existe en /v1/payments/:id.
    const dataId = authorizedPayment.payment?.id ? String(authorizedPayment.payment.id) : null;
    if (!dataId) { processed.push({ authorizedPaymentId: authorizedPayment.id, skipped: 'sin_payment_id_anidado' }); continue; }
    const dedupKey = `mercadopago:payment:${dataId}`;
    const { data: existingEvent } = await supa.from('payment_provider_events').select('id, processed').eq('dedup_key', dedupKey).maybeSingle();
    if (existingEvent?.processed) { processed.push({ dataId, skipped: 'ya_procesado' }); continue; }

    let eventRowId = existingEvent?.id;
    if (!eventRowId) {
      const { data: inserted, error: insertError } = await supa
        .from('payment_provider_events')
        .insert({ provider: 'mercadopago', event_type: 'payment', provider_event_id: dataId, dedup_key: dedupKey, payload_sanitized: { type: 'payment', dataId, source: 'manual_reprocess' }, signature_valid: true })
        .select('id').single();
      if (insertError) { processed.push({ dataId, error: insertError.message }); continue; }
      eventRowId = inserted.id;
    }

    try {
      const result = await handlePaymentEvent(supa, dataId);
      await supa.from('payment_provider_events').update({ processed: true, processed_at: new Date().toISOString() }).eq('id', eventRowId);
      processed.push({ dataId, result });
    } catch (err) {
      await supa.from('payment_provider_events').update({ error: String(err.message).slice(0, 500) }).eq('id', eventRowId);
      processed.push({ dataId, error: err.message });
    }
  }

  return res.status(200).json({ status: 'ok', processed });
}
