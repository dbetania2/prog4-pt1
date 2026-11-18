// node 03-jwt/02-alg-none.js
//
// PREDECÍ ANTES DE EJECUTAR
// El header dice qué algoritmo usar, y el header lo escribe quien manda el token.
// ¿Qué pasa si dice "ningún algoritmo"?
const { verificarIngenuo } = require("./verificador-ingenuo");
const { clavePublica, tokenLegitimo, payloadAtacante } = require("./escenario");
const { sinFirma } = require("../comun/jwt");

console.log("Token normal de Beto:", verificarIngenuo(tokenLegitimo(), { clavePublica }).rol);
const falso = sinFirma(payloadAtacante());
console.log("\nToken armado sin ninguna clave:\n", falso);
console.log("\nEl verificador responde:", verificarIngenuo(falso, { clavePublica }));

// PARA PROBAR VOS
// 1. Buscá tu línea "if (header.alg === 'none')" en verificador-ingenuo.js. Nadie la escribiría así.
//    Pero la especificación incluye "none", y varias librerías lo aceptaron por defecto. Leé RFC 8725 §2.1 y §3.1.
// 2. Probá poner "None" en el header. Acá se rechaza porque la comparación es exacta.
//    Pero si una librería ignora mayúsculas, ¿le alcanza a tu filtro con buscar "none"? ¿Qué pasa con una lista blanca?
