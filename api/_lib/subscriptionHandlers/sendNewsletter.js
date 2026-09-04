import { readFile } from 'fs/promises';
import path from 'path';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { buildUnsubscribeToken } from '../unsubscribeToken.js';

// ALSINA — primer envío real del newsletter por Resend (2026-09-04).
// Gateado con CRON_SECRET (esto SÍ es una acción admin — a diferencia
// de unsubscribe.js, nadie clickea esto desde afuera).
//
// SEGURIDAD DEL ENVÍO (a propósito, no accidental):
//  - Por default (sin `confirm`) es un dry-run: arma todo (destinatarios,
//    HTML personalizado por persona) pero NUNCA llama a Resend ni toca
//    email_outbox. Devuelve el conteo real y una muestra para revisar.
//  - Un envío real de verdad exige `confirm: 'ENVIAR_A_TODOS'` (un
//    string exacto, no un booleano cualquiera — para que no salga un
//    envío real por un typo o un valor default mal puesto en otro lado).
//  - `testEmail` manda UN mail real a esa dirección puntual (para
//    revisar en la bandeja real antes del envío masivo) — no depende
//    de `confirm` ni toca la lista de 108 destinatarios reales.
//
// "Suscripto al newsletter" = email_preferences.editorial_opt_in = true
// (ver api/account.js, api/_lib/unsubscribeToken.js) — hoy son las 108
// cuentas registradas (accounts=email_preferences=108, nadie se dio de
// baja todavía). La tabla `contacts` (alta de newsletter sin cuenta, ver
// api/subscribe.js) da error "table not found" en producción — no es la
// fuente real de estos 108, y es un bug aparte sin resolver todavía.

const NEWSLETTER_FILE = 'newsletter-monitor135-agosto-2026.html';
const UNSUB_PLACEHOLDER_HREF = 'mailto:newsletter@alsinaar.com?subject=Baja%20newsletter';
const RESEND_BATCH_LIMIT = 100; // límite documentado de la API de Batch de Resend

function requireCronAuth(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { res.status(503).json({ error: 'not_configured' }); return false; }
  if ((req.headers['authorization'] || '') !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false; }
  return true;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadTemplate() {
  const raw = await readFile(path.join(process.cwd(), NEWSLETTER_FILE), 'utf8');
  const subjectMatch = raw.match(/<!--\s*ASUNTO SUGERIDO:\s*(.+?)\s*-->/);
  const subject = subjectMatch ? subjectMatch[1].trim() : 'Novedades de Alsina';
  if (!raw.includes(UNSUB_PLACEHOLDER_HREF)) {
    throw new Error(`No se encontró el placeholder de baja ("${UNSUB_PLACEHOLDER_HREF}") en ${NEWSLETTER_FILE} — revisar si el HTML cambió.`);
  }
  return { raw, subject };
}

async function getRecipients(supa) {
  const { data: prefs, error: prefsError } = await supa
    .from('email_preferences').select('account_id').eq('editorial_opt_in', true);
  if (prefsError) throw new Error(`email_preferences: ${prefsError.message}`);
  const accountIds = (prefs || []).map(p => p.account_id).filter(Boolean);
  if (!accountIds.length) return [];

  const { data: accounts, error: accountsError } = await supa
    .from('accounts').select('id, owner_profile_id').in('id', accountIds);
  if (accountsError) throw new Error(`accounts: ${accountsError.message}`);

  const profileIds = accounts.map(a => a.owner_profile_id).filter(Boolean);
  const { data: profiles, error: profilesError } = await supa
    .from('profiles').select('id, email').in('id', profileIds);
  if (profilesError) throw new Error(`profiles: ${profilesError.message}`);

  const emailByProfileId = new Map(profiles.map(p => [p.id, p.email]));
  const recipients = [];
  const seenEmails = new Set(); // por si dos cuentas comparten owner_profile_id (no debería, pero no se asume)
  for (const acc of accounts) {
    const email = emailByProfileId.get(acc.owner_profile_id);
    if (!email || seenEmails.has(email.toLowerCase())) continue;
    seenEmails.add(email.toLowerCase());
    recipients.push({ accountId: acc.id, email });
  }
  return recipients;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!requireCronAuth(req, res)) return;
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'resend_no_configurado' });

  const { confirm, testEmail, sampleSize } = req.body || {};
  const supa = getSupabaseAdmin();

  let template;
  try {
    template = await loadTemplate();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  // ── envío de prueba a una sola dirección — no toca la lista real ──
  if (testEmail) {
    const fakeAccountId = 'test-' + Buffer.from(testEmail).toString('hex').slice(0, 24);
    const personalized = template.raw.replace(UNSUB_PLACEHOLDER_HREF, `https://www.alsinaar.com/api/subscriptions/unsubscribe?token=${buildUnsubscribeToken(fakeAccountId)}`);
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: 'Alsina <newsletter@alsinaar.com>',
      reply_to: 'newsletter@alsinaar.com',
      to: testEmail,
      subject: `[PRUEBA] ${template.subject}`,
      html: personalized,
    });
    if (error) return res.status(502).json({ status: 'error', error: error.message });
    return res.status(200).json({ status: 'test_sent', to: testEmail, resendId: data?.id, subject: template.subject });
  }

  let recipients;
  try {
    recipients = await getRecipients(supa);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const isRealSend = confirm === 'ENVIAR_A_TODOS';

  if (!isRealSend) {
    // ── dry-run: arma todo, no manda nada ──
    const sample = recipients.slice(0, Number(sampleSize) || 3).map(r => ({
      email: r.email,
      unsubscribeUrl: `https://www.alsinaar.com/api/subscriptions/unsubscribe?token=${buildUnsubscribeToken(r.accountId)}`,
    }));
    return res.status(200).json({
      status: 'dry_run',
      subject: template.subject,
      recipientCount: recipients.length,
      sample,
      note: 'No se envió nada. Para el envío real: POST con {"confirm":"ENVIAR_A_TODOS"}. Para una prueba a una sola dirección: POST con {"testEmail":"vos@mail.com"} (no depende de confirm).',
    });
  }

  // ── envío real a todos ──
  const resend = new Resend(process.env.RESEND_API_KEY);
  const batches = chunk(recipients, RESEND_BATCH_LIMIT);
  const results = [];

  for (const batch of batches) {
    const payload = batch.map(r => ({
      from: 'Alsina <newsletter@alsinaar.com>',
      reply_to: 'newsletter@alsinaar.com',
      to: r.email,
      subject: template.subject,
      html: template.raw.replace(UNSUB_PLACEHOLDER_HREF, `https://www.alsinaar.com/api/subscriptions/unsubscribe?token=${buildUnsubscribeToken(r.accountId)}`),
    }));

    // Outbox ANTES de mandar, igual que sendEmail() en api/_lib/email.js —
    // poder auditar incluso si el batch entero falla.
    const outboxInserts = batch.map(r => ({ account_id: r.accountId, to_email: r.email, template_key: 'newsletter_2026_08', status: 'pending' }));
    const { data: outboxRows } = await supa.from('email_outbox').insert(outboxInserts).select('id, to_email');
    const outboxIdByEmail = new Map((outboxRows || []).map(o => [o.to_email, o.id]));

    const { data, error } = await resend.batch.send(payload);

    if (error) {
      for (const r of batch) {
        const id = outboxIdByEmail.get(r.email);
        if (id) await supa.from('email_outbox').update({ status: 'failed', last_error: error.message, attempts: 1 }).eq('id', id);
      }
      results.push({ batchSize: batch.length, status: 'failed', error: error.message });
      continue;
    }

    for (const r of batch) {
      const id = outboxIdByEmail.get(r.email);
      if (id) await supa.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
    }
    results.push({ batchSize: batch.length, status: 'sent', resendIds: (data?.data || []).map(d => d.id) });
  }

  return res.status(200).json({ status: 'sent', subject: template.subject, recipientCount: recipients.length, batches: results });
}
