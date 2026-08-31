// Expone al frontend flags/config que viven en variables de entorno del
// servidor. Así activar pagos es SOLO cambiar PAYMENTS_ENABLED en
// Vercel — ninguna página estática necesita tocarse.
//
// supabaseUrl/supabaseAnonKey son seguros de exponer: la key "publishable"
// (o "anon" legacy) está diseñada para vivir en el navegador — la
// protección real de los datos es RLS del lado de Supabase, no ocultar
// esta key. mpPublicKey (MP_PUBLIC_KEY) es igual de segura de exponer —
// es la "public key" de Mercado Pago, pensada específicamente para
// inicializar su SDK de JS en el navegador (Card Form, ver planes.html);
// el cobro real siempre pasa por el access token en el servidor. Nunca
// exponer acá SUPABASE_SECRET_KEY ni MP_ACCESS_TOKEN.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true',
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    mpPublicKey: process.env.MP_PUBLIC_KEY || null,
  });
}
