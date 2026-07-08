// Expone al frontend flags que viven en variables de entorno del
// servidor. Así activar pagos es SOLO cambiar PAYMENTS_ENABLED en
// Vercel — ninguna página estática necesita tocarse.
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).json({
    paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true',
  });
}
