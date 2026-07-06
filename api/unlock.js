import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, resource } = req.body || {};
  const clean = (email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (!resource || typeof resource !== 'string' || resource.length > 100) {
    return res.status(400).json({ error: 'Resource inválido' });
  }

  const supa = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Upsert contact — ignorar si ya existe para no sobreescribir source anterior
  await supa
    .from('contacts')
    .upsert(
      { email: clean, source: `informe:${resource}` },
      { onConflict: 'email', ignoreDuplicates: true }
    );

  // Registrar unlock (no falla si ya existe)
  const { error } = await supa
    .from('unlocks')
    .upsert(
      { email: clean, resource },
      { onConflict: 'email,resource', ignoreDuplicates: true }
    );

  if (error) {
    console.error('Unlock error:', error);
    return res.status(500).json({ error: 'Error al registrar el acceso' });
  }

  return res.status(200).json({ status: 'ok' });
}
