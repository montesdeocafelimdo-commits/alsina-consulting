import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail, templates } from '../_lib/email.js';

// ALSINA — cron diario de gracia/suspensión (AD-10) y de cancelaciones
// programadas que ya se hicieron efectivas (AD-12). Mercado Pago ejecuta
// la recurrencia de cobro — este cron NUNCA cobra nada, solo reacciona a
// estados que ya están en nuestra base (grace_started_at lo abre el
// webhook cuando un pago de renovación es rechazado).
//
// Día 0 (primer aviso): lo envía api/mercadopago-webhook.js en el
// momento del rechazo — no es responsabilidad de este cron.
// Día 4 (segundo y último aviso) y día 5 (suspensión): responsabilidad
// de este cron, con columnas dedicadas para nunca duplicar un aviso ya
// enviado, sin importar cuántas veces corra.

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/dunning] CRON_SECRET no configurado — rechazando por seguridad (fail closed).');
    res.status(503).json({ error: 'not_configured' });
    return false;
  }
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (!requireCronAuth(req, res)) return;

  const supa = getSupabaseAdmin();
  const now = Date.now();
  const summary = { finalNoticesSent: 0, suspended: 0, cancellationsFinalized: 0, errors: [] };

  // ── día 4: segundo y último aviso ──
  try {
    const { data: dueForFinalNotice, error } = await supa
      .from('subscriptions')
      .select('id, account_id, grace_started_at, plans(name)')
      .eq('status', 'past_due')
      .is('grace_notice_final_sent_at', null)
      .not('grace_started_at', 'is', null);
    if (error) throw error;

    for (const sub of dueForFinalNotice || []) {
      const ageMs = now - new Date(sub.grace_started_at).getTime();
      const ageDays = ageMs / 86400000;
      if (ageDays < 4) continue; // todavía no llega al día 4

      const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', sub.account_id).maybeSingle();
      const { data: ownerProfile } = acc
        ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
        : { data: null };

      await supa.from('subscriptions').update({ grace_notice_final_sent_at: new Date().toISOString() }).eq('id', sub.id);

      if (ownerProfile?.email) {
        await sendEmail({
          to: ownerProfile.email,
          subject: 'Último aviso — tu suscripción se suspende en 24 horas',
          html: templates.paymentFailedFinalNotice(sub.plans?.name || 'tu plan'),
          templateKey: 'payment_failed_final_notice',
          accountId: sub.account_id,
        });
      }
      summary.finalNoticesSent++;
    }
  } catch (err) {
    console.error('[cron/dunning] error en avisos día 4:', err.message);
    summary.errors.push({ stage: 'final_notice', error: err.message });
  }

  // ── día 5: suspensión ──
  try {
    const { data: dueForSuspension, error } = await supa
      .from('subscriptions')
      .select('id, account_id, grace_started_at, plans(name)')
      .eq('status', 'past_due')
      .not('grace_started_at', 'is', null);
    if (error) throw error;

    for (const sub of dueForSuspension || []) {
      const ageDays = (now - new Date(sub.grace_started_at).getTime()) / 86400000;
      if (ageDays < 5) continue;

      await supa
        .from('subscriptions')
        .update({ status: 'suspended', suspended_at: new Date().toISOString() })
        .eq('id', sub.id);
      await supa.rpc('recalculate_plan_entitlements', { p_account_id: sub.account_id });

      const { data: acc } = await supa.from('accounts').select('owner_profile_id').eq('id', sub.account_id).maybeSingle();
      const { data: ownerProfile } = acc
        ? await supa.from('profiles').select('email').eq('id', acc.owner_profile_id).maybeSingle()
        : { data: null };
      if (ownerProfile?.email) {
        await sendEmail({
          to: ownerProfile.email,
          subject: 'Tu suscripción quedó suspendida',
          html: templates.suspended(sub.plans?.name || 'tu plan'),
          templateKey: 'subscription_suspended',
          accountId: sub.account_id,
        });
      }
      await supa.from('audit_logs').insert({
        actor_role: 'system', action: 'subscription_suspended',
        target_table: 'subscriptions', target_id: sub.id,
        after: { grace_started_at: sub.grace_started_at },
      });
      summary.suspended++;
    }
  } catch (err) {
    console.error('[cron/dunning] error en suspensión día 5:', err.message);
    summary.errors.push({ stage: 'suspend', error: err.message });
  }

  // ── cancelaciones programadas que ya llegaron a su paid_through (AD-12) ──
  try {
    const { data: concejalPlan } = await supa.from('plans').select('id').eq('slug', 'concejal').maybeSingle();
    const { data: concejalPrice } = await supa
      .from('plan_prices')
      .select('id')
      .eq('plan_id', concejalPlan.id)
      .eq('available_for_new_signups', true)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: dueForFinal, error } = await supa
      .from('subscriptions')
      .select('id, account_id, paid_through, provider, provider_subscription_id')
      .eq('status', 'cancel_at_period_end')
      .lte('paid_through', new Date().toISOString());
    if (error) throw error;

    for (const sub of dueForFinal || []) {
      // Cancelación definitiva y sin vuelta atrás en Mercado Pago (venía
      // solo pausada desde que se pidió la baja, ver api/subscriptions/
      // cancel.js). A partir de acá ya no hay revert-cancel posible.
      if (sub.provider === 'mercadopago' && sub.provider_subscription_id && process.env.MP_ACCESS_TOKEN) {
        try {
          const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
          const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
          await new PreApproval(client).update({ id: sub.provider_subscription_id, body: { status: 'cancelled' } });
        } catch (mpErr) {
          console.error('[cron/dunning] no se pudo cancelar en Mercado Pago:', mpErr?.message || mpErr);
          summary.errors.push({ stage: 'mp_cancel', subscriptionId: sub.id, error: mpErr?.message });
        }
      }
      await supa
        .from('subscriptions')
        .update({
          plan_id: concejalPlan.id,
          price_id: concejalPrice.id,
          status: 'active',
          provider: null,
          provider_subscription_id: null,
          canceled_at: new Date().toISOString(),
          grace_started_at: null,
          grace_notice_final_sent_at: null,
          suspended_at: null,
        })
        .eq('id', sub.id);
      await supa.rpc('recalculate_plan_entitlements', { p_account_id: sub.account_id });
      await supa.from('audit_logs').insert({
        actor_role: 'system', action: 'cancellation_finalized',
        target_table: 'subscriptions', target_id: sub.id,
        after: { paid_through: sub.paid_through },
      });
      summary.cancellationsFinalized++;
    }
  } catch (err) {
    console.error('[cron/dunning] error finalizando cancelaciones:', err.message);
    summary.errors.push({ stage: 'finalize_cancellation', error: err.message });
  }

  // ── downgrades pago-a-pago programados que llegaron a su paid_through (AD-11) ──
  try {
    const { data: dueForDowngrade, error } = await supa
      .from('subscriptions')
      .select('id, account_id, pending_plan_id, pending_price_id, plans(name)')
      .eq('status', 'active')
      .not('pending_plan_id', 'is', null)
      .lte('paid_through', new Date().toISOString());
    if (error) throw error;

    for (const sub of dueForDowngrade || []) {
      const { data: newPlan } = await supa.from('plans').select('name').eq('id', sub.pending_plan_id).maybeSingle();
      await supa
        .from('subscriptions')
        .update({ plan_id: sub.pending_plan_id, price_id: sub.pending_price_id, pending_plan_id: null, pending_price_id: null })
        .eq('id', sub.id);
      await supa.rpc('recalculate_plan_entitlements', { p_account_id: sub.account_id });
      await supa.from('audit_logs').insert({
        actor_role: 'system', action: 'downgrade_finalized',
        target_table: 'subscriptions', target_id: sub.id,
        before: { plan: sub.plans?.name }, after: { plan: newPlan?.name },
      });
      summary.downgradesFinalized = (summary.downgradesFinalized || 0) + 1;
    }
  } catch (err) {
    console.error('[cron/dunning] error finalizando downgrades:', err.message);
    summary.errors.push({ stage: 'finalize_downgrade', error: err.message });
  }

  console.log('[cron/dunning]', JSON.stringify(summary));
  return res.status(200).json(summary);
}
