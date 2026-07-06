import { createClient } from '@supabase/supabase-js';

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.redirect(`${SITE_URL}/newsletter?confirmed=error`);
  }

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supa
    .from('contacts')
    .update({ confirmed: true })
    .eq('confirmation_token', token)
    .select('email')
    .maybeSingle();

  if (error || !data) {
    console.error('Confirm error:', error);
    return res.redirect(`${SITE_URL}/newsletter?confirmed=error`);
  }

  return res.redirect(`${SITE_URL}/newsletter?confirmed=true`);
}
