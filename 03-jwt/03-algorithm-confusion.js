// node 03-jwt/03-algorithm-confusion.js
//
// PREDECÍ ANTES DE EJECUTAR
// RS256: se firma con la privada y se verifica con la pública.
// HS256: se firma y se verifica con EL MISMO secreto.
// La clave pública es pública. ¿Qué pasa si le decís al verificador que el token es HS256?
const { verificarIngenuo } = require("./verificador-ingenuo");
const { clavePublica, payloadAtacante } = require("./escenario");
const { firmarHS256 } = require("../comun/jwt");

console.log("Lo único que tiene el atacante, la clave pública:\n" + clavePublica);
const falso = firmarHS256(payloadAtacante(), clavePublica);
console.log("El verificador responde:", verificarIngenuo(falso, { clavePublica }));
console.log("\nNo se rompió la criptografía. El código usó una clave pública como secreto compartido.");

// PARA PROBAR VOS
// 1. Agregale un espacio a la clave pública al firmar. ¿Sigue funcionando? ¿Por qué un HMAC es tan sensible?
// 2. Escribí el arreglo de una línea. ¿Quién tiene que decidir el algoritmo?
