// Verifica un ID token con las reglas que publica Firebase para librerías de terceros.
// Se comprueban TODAS. Si falta una, hay un token falso que pasa.
const { abrir, firmaRS256Valida, ahora } = require("../comun/jwt");

const TOLERANCIA_RELOJ = 5; // segundos: dos relojes nunca coinciden exacto

class TokenInvalido extends Error {}

function verificarIdToken(token, { proyecto, clavesPublicas }) {
  let partes;
  try { partes = abrir(token); } catch { throw new TokenInvalido("no tiene forma de JWT"); }
  const { header, payload: p } = partes;
  const t = ahora();
  const emisor = `https://securetoken.google.com/${proyecto}`;

  // Primero el header, y la decisión la toma ESTE código, no el token.
  if (header.alg !== "RS256") throw new TokenInvalido(`alg no permitido: ${header.alg}`);
  if (!Object.hasOwn(clavesPublicas, header.kid ?? "")) throw new TokenInvalido(`kid desconocido: ${header.kid}`);

  // Sin firma válida, nada de lo que dice el payload es un dato: es texto de un desconocido.
  if (!firmaRS256Valida(token, clavesPublicas[header.kid])) throw new TokenInvalido("firma inválida");

  if (p.aud !== proyecto) throw new TokenInvalido(`aud incorrecto: ${p.aud}`);
  if (p.iss !== emisor) throw new TokenInvalido(`iss incorrecto: ${p.iss}`);
  if (typeof p.sub !== "string" || !p.sub) throw new TokenInvalido("sub vacío");
  if (!(p.exp > t - TOLERANCIA_RELOJ)) throw new TokenInvalido("vencido");
  if (!(p.iat <= t + TOLERANCIA_RELOJ)) throw new TokenInvalido("emitido en el futuro");
  if (!(p.auth_time <= t + TOLERANCIA_RELOJ)) throw new TokenInvalido("auth_time en el futuro");
  return { uid: p.sub, ...p };
}
module.exports = { verificarIdToken, TokenInvalido };
