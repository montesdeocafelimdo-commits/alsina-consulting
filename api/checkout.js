import { createClient } from '@supabase/supabase-js';

// TODO: integrar Mercado Pago
// import MercadoPago from 'mercadopago';
// const mp = new MercadoPago({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  const clean = (email || '').trim().toLowerCase();

  if (clean && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // STUB: marcar como suscriptor para poder demostrar el flujo
    await supa
      .from('contacts')
      .upsert({ email: clean, is_subscriber: true }, { onConflict: 'email' });

    await supa
      .from('subscriptions')
      .insert({
        email: clean,
        plan: 'pro',
        status: 'active',
        started_at: new Date().toISOString(),
      });
  }

  // TODO: reemplazar con checkout de Mercado Pago
  // const preference = await mp.preferences.create({ ... });
  // return res.status(200).json({ ok: true, checkoutUrl: preference.init_point });

  return res.status(200).json({
    ok: true,
    mock: true,
    message: 'Stub — Mercado Pago no integrado todavía',
  });
}
