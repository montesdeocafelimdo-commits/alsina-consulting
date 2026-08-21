import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireSuperAdmin } from '../_lib/adminAuth.js';

// ALSINA — reembolso manual (AD-13, AD-17). Solo super_admin (Felipe) —
// los partners no modifican pagos ni reembolsos. Idempotente vía
// refunds.provider_refund_id, siempre verificado contra Mercado Pago
// (nunca confía en "decime que reembolsaste", ejecuta el reembolso real).
//
// body: { paymentId, reason }. Reembolso total únicamente (AD-13: "otros
// casos: revisión manual" — un reembolso parcial puntual se hace a mano
// en el panel de Mercado Pago, documentado aparte, no por acá).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { paymentId, reason } = req.body || {};
  if (!paymentId || !reason || typeof reason !== 'string' || reason.trim().length < 5) {
    return res.status(400).json({ error: 'faltan_datos_o_motivo_insuficiente' });
  }
  if (!process.env.MP_ACCESS_TOKEN) return res.status(500).json({ error: 'pagos_no_configurados' });

  const supa = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await supa
    .from('payments')
    .select('id, account_id, provider_payment_id, amount, status')
    .eq('id', paymentId)
    .maybeSingle();
  if (paymentError || !payment) return res.status(404).json({ error: 'pago_no_encontrado' });
  if (payment.status !== 'approved') return res.status(400).json({ error: 'solo_se_reembolsan_pagos_aprobados' });

  const { data: existing } = await supa.from('refunds').select('id, status').eq('payment_id', paymentId).maybeSingle();
  if (existing?.status === 'processed') {
    return res.status(200).json({ status: 'ok', alreadyProcessed: true, refundId: existing.id });
  }

  let refundRowId = existing?.id;
  if (!refundRowId) {
    const { data: inserted, error: insertError } = await supa
      .from('refunds')
      .insert({ payment_id: paymentId, account_id: payment.account_id, amount: payment.amount, reason: reason.trim(), requested_by: admin.profileId, status: 'pending' })
      .select('id')
      .single();
    if (insertError) return res.status(500).json({ error: 'error_interno' });
    refundRowId = inserted.id;
  }

  try {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${payment.provider_payment_id}/refunds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const mpRefund = await r.json();
    if (!r.ok) throw new Error(mpRefund?.message || `Mercado Pago respondió ${r.status}`);

    await supa
      .from('refunds')
      .update({ status: 'processed', provider_refund_id: String(mpRefund.id), processed_at: new Date().toISOString() })
      .eq('id', refundRowId);
    await supa.from('payments').update({ status: 'refunded' }).eq('id', paymentId);
    await supa.from('audit_logs').insert({
      actor_role: 'super_admin', actor_profile_id: admin.profileId,
      action: 'refund_processed', target_table: 'payments', target_id: paymentId,
      after: { reason: reason.trim(), providerRefundId: String(mpRefund.id) },
    });

    return res.status(200).json({ status: 'ok', refundId: refundRowId, providerRefundId: mpRefund.id });
  } catch (err) {
    console.error('refund: error contra Mercado Pago:', err.message);
    await supa.from('refunds').update({ status: 'failed' }).eq('id', refundRowId);
    return res.status(500).json({ error: 'no_se_pudo_procesar_el_reembolso', detail: err.message });
  }
}
