// node 03-jwt/01-abrir-token.js
//
// PREDECÍ ANTES DE EJECUTAR
// ¿Hace falta alguna clave para leer lo que hay adentro de un JWT?
const { tokenLegitimo } = require("./escenario");

const token = tokenLegitimo();
console.log("El token:\n", token, "\n");
const [h, p, f] = token.split(".");
console.log("Parte 1, header :", Buffer.from(h, "base64url").toString());
console.log("Parte 2, payload:", Buffer.from(p, "base64url").toString());
console.log("Parte 3, firma  :", f.slice(0, 40) + "... (", Buffer.from(f, "base64url").length, "bytes )");
console.log("\nSin ninguna clave. base64url es una forma de escribir, no un cifrado.");
console.log("La firma no oculta: prueba quién lo emitió y que nadie lo cambió.");

// PARA PROBAR VOS
// 1. Pegá el token en una consola de Node y decodificá el payload en una sola línea.
// 2. ¿Qué datos NO deberían ir en un token? Mirá también dónde queda: logs, historial, herramientas.
