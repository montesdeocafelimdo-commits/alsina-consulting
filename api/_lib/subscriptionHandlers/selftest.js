import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { getSupabaseAdmin } from '../supabaseAdmin.js';
import accountHandler from '../../account.js';
import monitorHandler from '../../monitor135/data.js';
import cancelHandler from './cancel.js';
import revertCancelHandler from './revert-cancel.js';
import downgradeHandler from './downgrade.js';
import revertDowngradeHandler from './revert-downgrade.js';
import upgradeHandler from './upgrade.js';
import checkoutHandler from './checkout.js';

// ALSINA — diagnóstico interno end-to-end. Corre server-side, así usa
// las claves reales del runtime sin exponerlas nunca a quien lo llama.
// Gateado con el mismo CRON_SECRET que los cron jobs (mismo nivel de
// confianza — nadie sin ese secreto puede activarlo). Crea un usuario
// fixture real, identificable por su email, y lo borra al final pase lo
// que pase. No hace ningún cobro real (PAYMENTS_ENABLED sigue
// controlando eso en cada endpoint probado).

function mockRes() {
  return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(o) { this._json = o; return this; }, setHeader() { return this; }, end() { return this; } };
}

export default async function selftest(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'not_configured' });
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });

  const admin = getSupabaseAdmin();
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

  // Auto-limpieza de fixtures huérfanos de una corrida anterior que se
  // haya cortado a mitad de camino (ej. el bug de email_outbox
  // encontrado la primera vez que corrió esto en Preview). Identificable
  // solo por el patrón de email — nunca toca cuentas reales.
  const orphanSweep = [];
  try {
    const { data: orphanProfiles } = await admin
      .from('profiles').select('id, email')
      .or('email.ilike.claude-selftest-%@example.invalid,email.ilike.claude-checkpoint-test-%@example.invalid');
    for (const p of orphanProfiles || []) {
      const { data: acc } = await admin.from('accounts').select('id').eq('owner_profile_id', p.id).maybeSingle();
      if (acc) {
        await admin.from('entitlements').delete().eq('account_id', acc.id);
        await admin.from('subscriptions').delete().eq('account_id', acc.id);
        await admin.from('email_preferences').delete().eq('account_id', acc.id);
        await admin.from('email_outbox').delete().eq('account_id', acc.id);
        await admin.from('accounts').delete().eq('id', acc.id);
      }
      await admin.from('profiles').delete().eq('id', p.id);
      await admin.auth.admin.deleteUser(p.id);
      orphanSweep.push(p.email);
    }
  } catch (sweepErr) {
    orphanSweep.push(`sweep_error: ${sweepErr.message}`);
  }

  const STAMP = Date.now();
  const email = `claude-selftest-${STAMP}@example.invalid`;
  const password = `Test-${STAMP}-!Aa1`;
  const results = [];
  let pass = 0, fail = 0;
  function check(name, cond, extra) {
    if (cond) { pass++; results.push({ ok: true, name }); }
    else { fail++; results.push({ ok: false, name, extra }); }
  }

  let userId, accountId, createdProviderSubscriptionId = null;
  try {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createErr) throw new Error('createUser: ' + createErr.message);
    userId = created.user.id;

    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
    if (signInErr) throw new Error('signIn: ' + signInErr.message);
    const token = signIn.session.access_token;
    const authHeaders = { authorization: `Bearer ${token}` };

    const { data: acc } = await admin.from('accounts').select('id').eq('owner_profile_id', userId).maybeSingle();
    accountId = acc?.id;
    check('trigger on_auth_user_created creó account', !!accountId);

    // ── cuenta recién creada: Concejal activo ──
    {
      const req2 = { method: 'GET', headers: authHeaders };
      const res2 = mockRes();
      await accountHandler(req2, res2);
      check('GET /api/account -> 200', res2._status === 200, res2._json);
      check('plan inicial = concejal', res2._json?.plan === 'concejal', res2._json);
      check('isFounderPrice = true', res2._json?.isFounderPrice === true, res2._json);
    }

    // ── PATCH preferencias ──
    {
      const req2 = { method: 'PATCH', headers: authHeaders, body: { editorialOptIn: false } };
      const res2 = mockRes();
      await accountHandler(req2, res2);
      check('PATCH /api/account (preferencias) -> 200', res2._status === 200 && res2._json?.editorialOptIn === false, res2._json);
    }

    // ── Monitor 135: Concejal ve basic, visitante ve none ──
    {
      const req2 = { method: 'GET', headers: authHeaders, query: { dataset: 'municipios' } };
      const res2 = mockRes();
      await monitorHandler(req2, res2);
      check('Monitor (concejal) -> access basic', res2._json?.access?.level === 'basic', res2._json?.access);
      const first = Object.values(res2._json?.municipios || {})[0];
      const rawDataset = JSON.parse(fs.readFileSync('private/data/monitor135-municipios.json', 'utf8'));
      const rawFirst = Object.values(rawDataset.municipios || {})[0];
      check('Monitor: campos redactados para Concejal', first && rawFirst && Object.keys(first).length < Object.keys(rawFirst).length, { redacted: first && Object.keys(first).length, full: rawFirst && Object.keys(rawFirst).length });
    }
    {
      const req2 = { method: 'GET', headers: {}, query: { dataset: 'municipios' } };
      const res2 = mockRes();
      await monitorHandler(req2, res2);
      check('Monitor (anónimo) -> access none, sin datos', res2._json?.access?.level === 'none' && Object.keys(res2._json?.municipios || {}).length === 0, res2._json);
    }

    // ── cancel/checkout/upgrade con Concejal: deben rechazar ──
    {
      const req2 = { method: 'POST', headers: authHeaders };
      const res2 = mockRes();
      await cancelHandler(req2, res2);
      check('cancel Concejal -> 400 concejal_no_se_cancela', res2._status === 400 && res2._json?.error === 'concejal_no_se_cancela', res2._json);
    }
    {
      const req2 = { method: 'POST', headers: authHeaders, body: {} };
      const res2 = mockRes();
      await upgradeHandler(req2, res2);
      check('upgrade sin ser Intendente -> pagos_no_habilitados o rechazo', [503, 400].includes(res2._status), res2._json);
    }
    {
      const req2 = { method: 'POST', headers: authHeaders, body: { planSlug: 'intendente' } };
      const res2 = mockRes();
      await checkoutHandler(req2, res2);
      if (process.env.PAYMENTS_ENABLED === 'true') {
        check('checkout (pagos activos) -> 200 + checkoutUrl real de Mercado Pago', res2._status === 200 && typeof res2._json?.checkoutUrl === 'string' && res2._json.checkoutUrl.includes('mercadopago'), res2._json);
        const { data: sub } = await admin.from('subscriptions').select('provider_subscription_id').eq('account_id', accountId).maybeSingle();
        createdProviderSubscriptionId = sub?.provider_subscription_id || null;
        check('checkout: guardó provider_subscription_id real', !!createdProviderSubscriptionId, sub);
      } else {
        check('checkout con PAYMENTS_ENABLED=false -> 503 + waitlisted', res2._status === 503 && res2._json?.waitlisted === true, res2._json);
      }
    }

    // ── upgrade manual a Intendente activo, para probar cancel/downgrade/revert reales ──
    const { data: intendentePlan } = await admin.from('plans').select('id, name').eq('slug', 'intendente').maybeSingle();
    const { data: intendentePrice } = await admin.from('plan_prices').select('id').eq('plan_id', intendentePlan.id).eq('available_for_new_signups', true).order('effective_from', { ascending: false }).limit(1).maybeSingle();
    const paidThroughFuture = new Date(Date.now() + 20 * 86400000).toISOString();
    await admin.from('subscriptions').update({ plan_id: intendentePlan.id, price_id: intendentePrice.id, status: 'active', paid_through: paidThroughFuture, provider: null, provider_subscription_id: null }).eq('account_id', accountId);
    await admin.rpc('recalculate_plan_entitlements', { p_account_id: accountId });

    {
      const req2 = { method: 'GET', headers: authHeaders, query: { dataset: 'municipios' } };
      const res2 = mockRes();
      await monitorHandler(req2, res2);
      check('Monitor (intendente) -> access full', res2._json?.access?.level === 'full', res2._json?.access);
    }

    // downgrade Intendente -> Concejal (delega a cancelAtPeriodEnd)
    let cancellationCode;
    {
      const req2 = { method: 'POST', headers: authHeaders, body: { targetPlan: 'concejal' } };
      const res2 = mockRes();
      await downgradeHandler(req2, res2);
      check('downgrade Intendente->Concejal -> 200 cancel_at_period_end', res2._status === 200 && res2._json?.mode === 'cancel_at_period_end', res2._json);
      cancellationCode = res2._json?.cancellationCode;
    }
    {
      const { data: sub } = await admin.from('subscriptions').select('status, cancellation_code').eq('account_id', accountId).maybeSingle();
      check('DB: status = cancel_at_period_end', sub?.status === 'cancel_at_period_end', sub);
      check('DB: cancellation_code coincide', sub?.cancellation_code === cancellationCode, sub);
    }
    {
      const req2 = { method: 'POST', headers: authHeaders };
      const res2 = mockRes();
      await revertCancelHandler(req2, res2);
      check('revert-cancel -> 200', res2._status === 200, res2._json);
    }
    {
      const { data: sub } = await admin.from('subscriptions').select('status').eq('account_id', accountId).maybeSingle();
      check('DB: status vuelve a active tras revert', sub?.status === 'active', sub);
    }

    // downgrade Gobernador -> Intendente pendiente (sin preapproval real, provider null -> no llama a MP)
    const { data: gobernadorPlan } = await admin.from('plans').select('id').eq('slug', 'gobernador').maybeSingle();
    const { data: gobernadorPrice } = await admin.from('plan_prices').select('id').eq('plan_id', gobernadorPlan.id).eq('available_for_new_signups', true).limit(1).maybeSingle();
    await admin.from('subscriptions').update({ plan_id: gobernadorPlan.id, price_id: gobernadorPrice.id, provider: null, provider_subscription_id: null }).eq('account_id', accountId);
    {
      const req2 = { method: 'POST', headers: authHeaders, body: { targetPlan: 'intendente' } };
      const res2 = mockRes();
      await downgradeHandler(req2, res2);
      check('downgrade Gobernador->Intendente -> 200 pending_downgrade', res2._status === 200 && res2._json?.mode === 'pending_downgrade', res2._json);
    }
    {
      const { data: sub } = await admin.from('subscriptions').select('pending_plan_id').eq('account_id', accountId).maybeSingle();
      check('DB: pending_plan_id seteado', !!sub?.pending_plan_id, sub);
    }
    {
      const req2 = { method: 'POST', headers: authHeaders };
      const res2 = mockRes();
      await revertDowngradeHandler(req2, res2);
      check('revert-downgrade -> 200', res2._status === 200, res2._json);
    }
    {
      const { data: sub } = await admin.from('subscriptions').select('pending_plan_id').eq('account_id', accountId).maybeSingle();
      check('DB: pending_plan_id limpio tras revert', sub?.pending_plan_id === null, sub);
    }

    // ── sin token -> 401 ──
    for (const [name, h, method] of [['account', accountHandler, 'GET'], ['cancel', cancelHandler, 'POST'], ['revert-cancel', revertCancelHandler, 'POST'], ['downgrade', downgradeHandler, 'POST'], ['upgrade', upgradeHandler, 'POST']]) {
      const req2 = { method, headers: {}, body: {} };
      const res2 = mockRes();
      await h(req2, res2);
      check(`${name} sin token -> 401`, res2._status === 401, res2._json);
    }
  } catch (err) {
    fail++;
    results.push({ ok: false, name: 'EXCEPCION', extra: err.message });
  } finally {
    const cleanupErrors = [];
    try {
      if (createdProviderSubscriptionId && process.env.MP_ACCESS_TOKEN) {
        // Cancela en Mercado Pago la preapproval de prueba que este mismo
        // run creó (checkout real con pagos activos) — nunca cobra nada
        // (el buyer de prueba no llegó a autorizar), pero no la deja
        // colgada en el panel de MP.
        try {
          const { MercadoPagoConfig, PreApproval } = await import('mercadopago');
          const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
          await new PreApproval(client).update({ id: createdProviderSubscriptionId, body: { status: 'cancelled' } });
        } catch (mpCleanupErr) {
          cleanupErrors.push(['mp_cancel_test_preapproval', mpCleanupErr?.message || String(mpCleanupErr)]);
        }
      }
      if (accountId) {
        let r;
        r = await admin.from('entitlements').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['entitlements', r.error.message]);
        r = await admin.from('subscriptions').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['subscriptions', r.error.message]);
        r = await admin.from('email_preferences').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['email_preferences', r.error.message]);
        // cancelAtPeriodEnd() manda un email real (sendEmail -> email_outbox
        // registra el intento) — su FK a accounts hay que limpiarla antes,
        // si no accounts/profiles/auth.users quedan bloqueados en cadena.
        r = await admin.from('email_outbox').delete().eq('account_id', accountId); if (r.error) cleanupErrors.push(['email_outbox', r.error.message]);
        r = await admin.from('audit_logs').delete().eq('target_id', accountId); if (r.error) cleanupErrors.push(['audit_logs', r.error.message]);
        r = await admin.from('accounts').delete().eq('id', accountId); if (r.error) cleanupErrors.push(['accounts', r.error.message]);
      }
      if (userId) {
        const r = await admin.from('profiles').delete().eq('id', userId);
        if (r.error) cleanupErrors.push(['profiles', r.error.message]);
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
        if (deleteUserError) cleanupErrors.push(['auth.deleteUser', deleteUserError.message]);
      }
      const { data: remainingProfiles } = await admin.from('profiles').select('id').eq('email', email);
      results.push({ cleanup: true, remainingProfiles: remainingProfiles?.length ?? 'n/a', cleanupErrors });
    } catch (cleanupErr) {
      results.push({ cleanup: false, error: cleanupErr.message, fixtureEmail: email });
    }
  }

  return res.status(200).json({ pass, fail, orphanSweep, results });
}
