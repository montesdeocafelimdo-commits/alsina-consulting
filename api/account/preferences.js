import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js';
import { requireAuthenticatedAccount } from '../_lib/auth.js';

// ALSINA — preferencia editorial (AD-04): desuscribirse de los emails de
// Señal Alsina nunca toca la cuenta Concejal ni el Monitor 135 — son
// estados separados. Los mensajes transaccionales (seguridad, cuenta,
// pagos) nunca dependen de esta preferencia.

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'method_not_allowed' });

  const account = await requireAuthenticatedAccount(req, res);
  if (!account) return;

  const { editorialOptIn } = req.body || {};
  if (typeof editorialOptIn !== 'boolean') return res.status(400).json({ error: 'valor_invalido' });

  const supa = getSupabaseAdmin();
  const { error } = await supa
    .from('email_preferences')
    .upsert({ account_id: account.accountId, editorial_opt_in: editorialOptIn }, { onConflict: 'account_id' });
  if (error) {
    console.error('preferences: error:', error.message);
    return res.status(500).json({ error: 'error_interno' });
  }
  return res.status(200).json({ status: 'ok', editorialOptIn });
}
