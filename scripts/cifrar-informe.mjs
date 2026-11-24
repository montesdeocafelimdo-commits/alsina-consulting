// ALSINA — cifra un informe privado con su clave de acceso, para poder commitearlo
// en un repo público. api/informe.js lo descifra con la clave que escribe el cliente.
// AES-256-GCM con clave derivada por scrypt (mismos parámetros que la API).
//
//   node scripts/cifrar-informe.mjs <entrada.html> <salida.enc.json> <clave>
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, scryptSync, createCipheriv } from 'node:crypto';

const [entrada, salida, clave] = process.argv.slice(2);
if (!entrada || !salida || !clave) {
  console.error('Uso: node scripts/cifrar-informe.mjs <entrada.html> <salida.enc.json> <clave>');
  process.exit(1);
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const salt = randomBytes(16);
const iv = randomBytes(12);
const key = scryptSync(clave.trim(), salt, 32, SCRYPT);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const data = Buffer.concat([cipher.update(readFileSync(entrada)), cipher.final()]);

writeFileSync(salida, JSON.stringify({
  v: 1,
  kdf: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  tag: cipher.getAuthTag().toString('base64'),
  data: data.toString('base64'),
}));
console.log(`Cifrado: ${salida}`);
