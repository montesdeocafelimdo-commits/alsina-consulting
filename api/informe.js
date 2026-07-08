import { createHash, timingSafeEqual } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

// Un informe = un slug = un hash de clave en variable de entorno.
// Agregar un cliente nuevo: sumar una fila acá + la env var correspondiente.
const INFORMES = {
  olavarria: {
    file: 'private/informes/olavarria.html',
    hashEnv: 'INFORME_KEY_HASH_OLAVARRIA',
  },
  'exaltacion-de-la-cruz': {
    file: 'private/informes/exaltacion-de-la-cruz.html',
    hashEnv: 'INFORME_KEY_HASH_EXALTACION',
  },
};

function sha256(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function denied(res, status) {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(status).send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Acceso denegado</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;background:#071114;color:#94a3b8;margin:0;">
  <div style="font-size:1.2rem">Clave incorrecta o vencida.</div>
  <a href="javascript:history.back()" style="color:#00D5D8;font-size:.9rem">← Volver a intentar</a>
</body></html>`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { slug, key } = req.body || {};
  const informe = typeof slug === 'string' ? INFORMES[slug] : null;

  if (!informe || !key) return denied(res, 401);

  const expectedHash = process.env[informe.hashEnv];
  if (!expectedHash) {
    // Sin hash configurado en el entorno: no hay forma de validar, denegar.
    console.error(`Falta la env var ${informe.hashEnv}`);
    return denied(res, 401);
  }

  const providedHash = sha256(key.trim());
  if (!safeEqual(providedHash, expectedHash)) return denied(res, 401);

  try {
    const filePath = path.join(process.cwd(), informe.file);
    const html = await readFile(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (err) {
    console.error('Error leyendo informe privado:', err);
    return res.status(500).send('Error interno al cargar el informe.');
  }
}
