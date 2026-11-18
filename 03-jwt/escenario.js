// La API y sus claves. El atacante conoce SOLO la clave pública: es pública, se publica a propósito.
const crypto = require("node:crypto");
const { firmarRS256, ahora } = require("../comun/jwt");
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const clavePublica = publicKey.export({ type: "spki", format: "pem" });
const ISS = "https://auth.telemetria.utn";
const AUD = "api-telemetria";
const normal = () => ({ iss: ISS, aud: AUD, sub: "uid_beto", rol: "operador", iat: ahora(), exp: ahora() + 900 });
const tokenLegitimo = () => firmarRS256(normal(), privateKey, "clave-2026");
const payloadAtacante = () => ({ ...normal(), sub: "uid_admin", rol: "admin" });
module.exports = { clavePublica, privateKey, ISS, AUD, tokenLegitimo, payloadAtacante, normal };
