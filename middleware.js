// Bloquea el acceso estático directo a /private/*. El contenido de esa
// carpeta (informes de clientes) solo se sirve a través de
// /api/informe.js, que valida la clave antes de devolverlo.
export const config = {
  matcher: '/private/:path*',
};

export default function middleware() {
  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' },
  });
}
