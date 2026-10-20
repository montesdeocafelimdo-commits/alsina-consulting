import { readFile } from 'fs/promises';
import path from 'path';
import { Resend } from 'resend';
import { getSupabaseAdmin } from '../supabaseAdmin.js';
import { buildUnsubscribeToken, buildEmailUnsubscribeToken } from '../unsubscribeToken.js';

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
// Destinatarios (2026-10-20: "todas las personas que nos dejaron su mail
// de alguna forma en la página"):
//  1. Cuentas con email_preferences.editorial_opt_in = true (baja = false).
//  2. Todos los mails de `contacts` — formulario de newsletter
//     (api/subscribe.js) y desbloqueo de informes (api/unlock.js), estén o
//     no confirmados — salvo que sean de una cuenta que se dio de baja o
//     figuren en audit_logs con action='newsletter_unsubscribe' (baja de
//     alguien sin cuenta, ver unsubscribe.js).
// Si `contacts` falla, el dry-run lo informa en contactsError: revisarlo
// antes del envío real, porque el envío sigue solo con las cuentas.

const NEWSLETTER_FILE = 'newsletter-monitor135-octubre-2026.html';
const UNSUB_PLACEHOLDER_HREF = 'mailto:newsletter@alsinaar.com?subject=Baja%20newsletter';
const RESEND_BATCH_LIMIT = 100; // límite documentado de la API de Batch de Resend

// Acepta NEWSLETTER_SEND_SECRET (clave propia del envío, 2026-10-20) o
// CRON_SECRET. CRON_SECRET es tipo Secret en Vercel y no se puede volver
// a leer; rotarlo rompería los links de baja ya enviados (unsubscribeToken
// firma con él), así que el envío tiene su propia clave.
function requireCronAuth(req, res) {
  // trim: `openssl rand -hex 32 | pbcopy` copia la clave con un salto de
  // línea al final, y pegada así en Vercel queda como parte del valor.
  const secrets = [process.env.NEWSLETTER_SEND_SECRET, process.env.CRON_SECRET].map(s => (s || '').trim()).filter(Boolean);
  if (!secrets.length) { res.status(503).json({ error: 'not_configured' }); return false; }
  const auth = (req.headers['authorization'] || '').trim();
  if (!secrets.some(s => auth === `Bearer ${s}`)) { res.status(401).json({ error: 'unauthorized' }); return false; }
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

// Trae todas las filas (PostgREST corta en 1000 por pedido).
async function selectAll(supa, table, cols, filter = q => q) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(supa.from(table).select(cols)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const normEmail = e => String(e || '').trim().toLowerCase();
const looksLikeEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function getRecipients(supa) {
  const prefs = await selectAll(supa, 'email_preferences', 'account_id, editorial_opt_in');
  const accounts = await selectAll(supa, 'accounts', 'id, owner_profile_id');
  const profiles = await selectAll(supa, 'profiles', 'id, email');

  const optIn = new Set(prefs.filter(p => p.editorial_opt_in).map(p => p.account_id));
  const optedOut = new Set(prefs.filter(p => !p.editorial_opt_in).map(p => p.account_id));
  const emailByProfileId = new Map(profiles.map(p => [p.id, normEmail(p.email)]));

  const recipients = [];
  const seen = new Set();
  const blocked = new Set(); // mails de cuentas que se dieron de baja
  for (const acc of accounts) {
    const email = emailByProfileId.get(acc.owner_profile_id);
    if (!email) continue;
    if (optedOut.has(acc.id)) { blocked.add(email); continue; }
    if (!optIn.has(acc.id) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ accountId: acc.id, email, source: 'cuenta' });
  }
  const fromAccounts = recipients.length;

  let contactsError = null, contactsTotal = 0;
  const skipped = { bajaCuenta: 0, bajaContacto: 0, mailInvalido: 0, duplicado: 0 };
  try {
    const unsubs = await selectAll(supa, 'audit_logs', 'after', q => q.eq('action', 'newsletter_unsubscribe'));
    const unsubEmails = new Set(unsubs.map(u => normEmail(u.after?.email)));
    const contacts = await selectAll(supa, 'contacts', 'email, source, confirmed');
    contactsTotal = contacts.length;
    for (const c of contacts) {
      const email = normEmail(c.email);
      if (!looksLikeEmail(email)) { skipped.mailInvalido++; continue; }
      if (blocked.has(email)) { skipped.bajaCuenta++; continue; }
      if (unsubEmails.has(email)) { skipped.bajaContacto++; continue; }
      if (seen.has(email)) { skipped.duplicado++; continue; }
      seen.add(email);
      recipients.push({ accountId: null, email, source: c.source || 'contacts' });
    }
  } catch (err) {
    contactsError = err.message;
  }

  return { recipients, stats: { total: recipients.length, fromAccounts, fromContacts: recipients.length - fromAccounts, contactsTotal, skipped, contactsError } };
}

const unsubscribeUrl = r => `https://www.alsinaar.com/api/subscriptions/unsubscribe?token=${r.accountId ? buildUnsubscribeToken(r.accountId) : buildEmailUnsubscribeToken(r.email)}`;

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

  let recipients, stats;
  try {
    ({ recipients, stats } = await getRecipients(supa));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const isRealSend = confirm === 'ENVIAR_A_TODOS';

  if (!isRealSend) {
    // ── dry-run: arma todo, no manda nada ──
    const n = Number(sampleSize) || 3;
    const sample = [...recipients.filter(r => r.accountId).slice(0, n), ...recipients.filter(r => !r.accountId).slice(0, n)]
      .map(r => ({ email: r.email, origen: r.source, unsubscribeUrl: unsubscribeUrl(r) }));
    return res.status(200).json({
      status: 'dry_run',
      subject: template.subject,
      recipientCount: recipients.length,
      stats,
      sample,
      note: 'No se envió nada. Para el envío real: POST con {"confirm":"ENVIAR_A_TODOS"}. Para una prueba a una sola dirección: POST con {"testEmail":"vos@mail.com"} (no depende de confirm).',
    });
  }

  // Pedido explícito: llegar a todos los que dejaron su mail. Si contacts
  // falló, no se manda un envío parcial solo a las cuentas.
  if (stats.contactsError) {
    return res.status(500).json({ error: 'contacts_no_disponible', detail: stats.contactsError, note: 'No se envió nada: la lista de contactos sin cuenta no se pudo leer.' });
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
      html: template.raw.replace(UNSUB_PLACEHOLDER_HREF, unsubscribeUrl(r)),
    }));

    // Outbox ANTES de mandar, igual que sendEmail() en api/_lib/email.js —
    // poder auditar incluso si el batch entero falla. account_id es null
    // para los contactos sin cuenta.
    const outboxInserts = batch.map(r => ({ account_id: r.accountId, to_email: r.email, template_key: 'newsletter_2026_10', status: 'pending' }));
    const { data: outboxRows } = await supa.from('email_outbox').insert(outboxInserts).select('id');
    const outboxIds = (outboxRows || []).map(o => o.id);

    const { data, error } = await resend.batch.send(payload);

    if (error) {
      if (outboxIds.length) await supa.from('email_outbox').update({ status: 'failed', last_error: error.message, attempts: 1 }).in('id', outboxIds);
      results.push({ batchSize: batch.length, status: 'failed', error: error.message });
      continue;
    }

    if (outboxIds.length) await supa.from('email_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', outboxIds);
    results.push({ batchSize: batch.length, status: 'sent', resendIds: (data?.data || []).map(d => d.id) });
  }

  return res.status(200).json({ status: 'sent', subject: template.subject, recipientCount: recipients.length, stats, batches: results });
}
