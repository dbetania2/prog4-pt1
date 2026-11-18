// node 03-jwt/06-endurecido.js
//
// PREDECÍ ANTES DE EJECUTAR
// Pocas líneas de diferencia con el ingenuo. ¿Cuántos de los ataques siguen pasando?
const fs = require("node:fs");
const path = require("node:path");
const { verificarIngenuo } = require("./verificador-ingenuo");
const { crearVerificador } = require("./verificador-duro");
const { clavePublica, ISS, AUD, tokenLegitimo, payloadAtacante, privateKey, normal } = require("./escenario");
const { sinFirma, firmarHS256, firmarRS256, ahora } = require("../comun/jwt");

const duro = crearVerificador({ claves: new Map([["clave-2026", { alg: "RS256", publica: clavePublica }]]), iss: ISS, aud: AUD });
const publico = fs.readFileSync(path.join(__dirname, "publico", "terminos.txt"));

const casos = [
  ["token legítimo", tokenLegitimo()],
  ["alg none", sinFirma(payloadAtacante())],
  ["RS256 -> HS256", firmarHS256(payloadAtacante(), clavePublica)],
  ["confusión con kid real", firmarHS256(payloadAtacante(), clavePublica, { kid: "clave-2026" })],
  ["kid con ruta a archivo", firmarHS256(payloadAtacante(), publico, { kid: "../publico/terminos.txt" })],
  ["kid __proto__", firmarHS256(payloadAtacante(), clavePublica, { kid: "__proto__" })],
  ["vencido, bien firmado", firmarRS256({ ...normal(), exp: ahora() - 3600 }, privateKey, "clave-2026")],
  ["para otra API", firmarRS256({ ...normal(), aud: "otra-api" }, privateKey, "clave-2026")],
];
const probar = (fn, t) => { try { const p = fn(t); return `ACEPTA rol=${p.rol}`; } catch (e) { return `rechaza: ${e.message.slice(0, 34)}`; } };

console.log("caso".padEnd(26), "ingenuo".padEnd(46), "endurecido");
for (const [nombre, t] of casos) {
  console.log(nombre.padEnd(26), probar((x) => verificarIngenuo(x, { clavePublica }), t).padEnd(46), probar(duro, t));
}

// PARA PROBAR VOS
// 1. Hacé fallar a propósito el endurecido: sacá la línea del alg. ¿Vuelve a pasar la confusión? ¿Por qué no?
//    Mirá qué función de firma se llama. Después pensá qué pasaría si el servidor tuviera las dos ramas.
// 2. En un proyecto real, con la librería jose, esto se escribe:
//    jwtVerify(token, clave, { algorithms: ["RS256"], issuer: ISS, audience: AUD })
