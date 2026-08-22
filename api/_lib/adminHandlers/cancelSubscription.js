import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { requireSuperAdmin } from '../adminAuth.js';
import { sendEmail, templates } from '../email.js';

// ALSINA — baja administrativa INMEDIATA (AD-17: super_admin, "facultades
// operativas completas"). A diferencia de la cancelación autoservicio
// (AD-12, efectiva al final del período ya pagado), esta es para cuando
// Alsina necesita cortar el acceso y el cobro automático YA — soporte,
// fraude, pedido puntual del cliente por otra vía, etc. Cancela la
// preapproval en Mercado Pago de una (no la pausa), baja a Concejal en
// el momento, recalcula entitlements, audita con quién la pidió.
// body: { accountId, reason }.

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { accountId, reason } = req.body || {};
  if (!accountId || !reason || typeof reason !== 'string' || reason.trim().length < 3) {
    return res.status(400).json({ error: 'faltan_datos_o_motivo_insuficiente' });
  }

  const supa = getSupabaseAdmin();
  const { data: subscription, error } = await supa
    .from('subscriptions')
    .select('id, status, provider, provider_subscription_id, plans!plan_id(slug, name)')
    .eq('account_id', accountId)
    .maybeSingle();
  if (error || !subscription) return res.status(404).json({ error: 'cuenta_no_encontrada' });
  if (subscription.plans?.slug === 'concejal') return res.status(400).json({ error: 'ya_es_concejal' });

  if (subscription.provider === 'mercadopago' && subscription.provider_subscription_id && process.env.MP_ACCESS_TOKEN) {
    try {
      const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      await new PreApproval(client).update({ id: subscription.provider_subscription_id, body: { status: 'cancelled' } });
    } catch (mpErr) {
      console.error('admin cancel: no se pudo cancelar en Mercado Pago:', mpErr?.message || mpErr);
      await supa.from('audit_logs').insert({
        actor_role: 'super_admin', actor_profile_id: admin.profileId,
        action: 'admin_mp_cancel_failed', target_table: 'subscriptions', target_id: subscription.id,
        after: { error: String(mpErr?.message || mpErr).slice(0, 300) },
      });
      // No se corta acá: igual se baja del lado de Alsina — si MP falló
      // en cancelar, queda auditado para revisar a mano, pero el acceso
      // pago no debe seguir vigente porque el admin pidió cortarlo ya.
    }
  }

  const { data: concejalPlan } = await supa.from('plans').select('id').eq('slug', 'concejal').maybeSingle();
  const { data: concejalPrice } = await supa
    .from('plan_prices').select('id').eq('plan_id', concejalPlan.id).eq('available_for_new_signups', true)
    .order('effective_from', { ascending: false }).limit(1).maybeSingle();

  const { error: updateError } = await supa
    .from('subscriptions')
    .update({
      plan_id: concejalPlan.id, price_id: concejalPrice.id, status: 'canceled',
      provider: null, provider_subscription_id: null, canceled_at: new Date().toISOString(),
      pending_plan_id: null, pending_price_id: null,
      grace_started_at: null, grace_notice_final_sent_at: null, suspended_at: null,
    })
    .eq('id', subscription.id);
  if (updateError) return res.status(500).json({ error: 'error_interno' });

  await supa.rpc('recalculate_plan_entitlements', { p_account_id: accountId });

  await supa.from('audit_logs').insert({
    actor_role: 'super_admin', actor_profile_id: admin.profileId,
    action: 'admin_cancellation', target_table: 'subscriptions', target_id: subscription.id,
    before: { plan: subscription.plans?.name, status: subscription.status },
    after: { reason: reason.trim() },
  });

  const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', accountId).maybeSingle();
  const { data: ownerProfile } = acc
    ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
    : { data: null };
  if (ownerProfile?.email) {
    await sendEmail({
      to: ownerProfile.email,
      subject: 'Tu suscripción fue dada de baja',
      html: templates.planChanged('Concejal'),
      templateKey: 'admin_cancellation',
      accountId,
    });
  }

  return res.status(200).json({ status: 'ok' });
}
