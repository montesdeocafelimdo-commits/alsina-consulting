import { getSupabaseAdmin } from './_lib/supabaseAdmin.js';

// Deben coincidir con assets/js/pricing.js — si cambian los precios,
// actualizar en los dos lugares (client-side para mostrar, acá para cobrar).
const PRICES = {
  informe: 25000, // ARS, "desde"
  pro: 45000, // ARS / mes
};

const SITE_URL = process.env.SITE_URL || 'https://alsinaar.com';

async function waitlist(supa, clean, type, resource) {
  const tag = `waitlist:${type}${resource ? ':' + resource : ''}`;

  const { error: contactError } = await supa
    .from('contacts')
    .upsert({ email: clean, source: tag }, { onConflict: 'email', ignoreDuplicates: true });
  if (contactError) {
    // Nunca propagar mensaje/código/detalle de Supabase al cliente — solo
    // al log del servidor, y solo lo mínimo (nunca la key administrativa).
    console.error('Waitlist error (contacts):', contactError.message);
    throw new Error('waitlist_write_failed');
  }

  const { error: unlockError } = await supa
    .from('unlocks')
    .upsert({ email: clean, resource: tag }, { onConflict: 'email,resource', ignoreDuplicates: true });
  if (unlockError) {
    console.error('Waitlist error (unlocks):', unlockError.message);
    throw new Error('waitlist_write_failed');
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, resource, email } = req.body || {};
  const clean = (email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return res.status(400).json({ error: 'Email inválido' });
  }
  if (type !== 'informe' && type !== 'pro') {
    return res.status(400).json({ error: 'Tipo inválido' });
  }

  let supa;
  try {
    supa = getSupabaseAdmin();
  } catch (err) {
    console.error('Supabase admin client error:', err.message);
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }
  const paymentsEnabled = process.env.PAYMENTS_ENABLED === 'true';

  // ── Pagos apagados (default): captura como lista de espera, mismo
  // backend que el newsletter. Nunca se muestra texto de demo/stub. ──
  if (!paymentsEnabled) {
    try {
      await waitlist(supa, clean, type, resource);
      return res.status(200).json({ status: 'ok', waitlist: true });
    } catch (err) {
      console.error('Waitlist error:', err);
      return res.status(500).json({ error: 'Error al registrar el acceso' });
    }
  }

  // ── Pagos activos: Mercado Pago ──
  if (!process.env.MP_ACCESS_TOKEN) {
    console.error('PAYMENTS_ENABLED=true pero falta MP_ACCESS_TOKEN');
    return res.status(500).json({ error: 'Pagos no configurados correctamente' });
  }

  try {
    const { MercadoPagoConfig, Preference, PreApproval } = await import('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

    if (type === 'informe') {
      const preference = new Preference(client);
      const result = await preference.create({
        body: {
          items: [
            {
              title: `Informe ALSINA — ${resource || 'informe'}`,
              quantity: 1,
              unit_price: PRICES.informe,
              currency_id: 'ARS',
            },
          ],
          payer: { email: clean },
          external_reference: `informe:${resource}:${clean}`,
          back_urls: {
            success: `${SITE_URL}/informes.html?compra=ok`,
            failure: `${SITE_URL}/informes.html?compra=error`,
            pending: `${SITE_URL}/informes.html?compra=pendiente`,
          },
          auto_return: 'approved',
          notification_url: `${SITE_URL}/api/mercadopago-webhook`,
        },
      });
      return res.status(200).json({ status: 'ok', checkoutUrl: result.init_point });
    }

    // type === 'pro' — suscripción mensual vía Preapproval
    const preapproval = new PreApproval(client);
    const result = await preapproval.create({
      body: {
        reason: 'Alsina Pro — suscripción mensual',
        external_reference: `pro:${clean}`,
        payer_email: clean,
        back_url: `${SITE_URL}/index.html?pro=ok`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRICES.pro,
          currency_id: 'ARS',
        },
      },
    });
    return res.status(200).json({ status: 'ok', checkoutUrl: result.init_point });
  } catch (err) {
    console.error('Mercado Pago checkout error:', err);
    return res.status(500).json({ error: 'Error al iniciar el pago. Intentá de nuevo.' });
  }
}
