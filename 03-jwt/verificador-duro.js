// El verificador corregido. Todo lo que decide lo decide el servidor.
const { abrir, firmaRS256Valida, ahora } = require("../comun/jwt");

const TOLERANCIA = 5;

function crearVerificador({ claves, iss, aud }) {
  // claves es un Map: kid -> { alg, publica }. El algoritmo está atado a la clave, no al token.
  return function verificar(token) {
    if (typeof token !== "string" || token.split(".").length !== 3) throw new Error("no tiene forma de JWT");
    const { header, payload: p } = abrir(token);
    const clave = claves.get(header.kid);            // búsqueda: nunca archivo, nunca SQL
    if (!clave) throw new Error("kid desconocido");
    if (header.alg !== clave.alg) throw new Error(`alg ${header.alg} no corresponde a esa clave`);
    if (!firmaRS256Valida(token, clave.publica)) throw new Error("firma inválida");
    if (p.iss !== iss) throw new Error("iss incorrecto");
    if (p.aud !== aud) throw new Error("aud incorrecto");
    if (!(p.exp > ahora() - TOLERANCIA)) throw new Error("vencido");
    return p;
  };
}
module.exports = { crearVerificador };
