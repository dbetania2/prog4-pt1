// Parece razonable y pasa todas las pruebas felices. Tiene TRES agujeros.
// Es a propósito: los archivos 02, 03 y 05 entran por cada uno.
const fs = require("node:fs");
const path = require("node:path");
const { abrir, firmaHS256Valida, firmaRS256Valida } = require("../comun/jwt");

function verificarIngenuo(token, { clavePublica }) {
  const { header, payload } = abrir(token);
  let valida = false;
  if (header.alg === "none") valida = true;                                   // agujero 1
  if (header.alg === "RS256") valida = firmaRS256Valida(token, clavePublica);
  if (header.alg === "HS256") {
    // Soportamos HS256 para los servicios internos. Sus claves están en archivos, por kid.
    // Y si no viene kid, usamos "la clave" que tenemos a mano.
    const secreto = header.kid
      ? fs.readFileSync(path.join(__dirname, "claves", header.kid))           // agujero 3
      : clavePublica;                                                         // agujero 2
    valida = firmaHS256Valida(token, secreto);
  }
  if (!valida) throw new Error("firma inválida");
  return payload;
}
module.exports = { verificarIngenuo };
