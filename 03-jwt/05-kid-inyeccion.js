// node 03-jwt/05-kid-inyeccion.js
//
// PREDECÍ ANTES DE EJECUTAR
// El verificador usa el "kid" del header para abrir un archivo de la carpeta claves/.
// El kid lo escribe el atacante. Y hay un archivo público que cualquiera puede descargar...
const fs = require("node:fs");
const path = require("node:path");
const { verificarIngenuo } = require("./verificador-ingenuo");
const { clavePublica, payloadAtacante } = require("./escenario");
const { firmarHS256 } = require("../comun/jwt");

const publico = fs.readFileSync(path.join(__dirname, "publico", "terminos.txt"));
console.log("Lo que descargó el atacante:", publico.toString());
const falso = firmarHS256(payloadAtacante(), publico, { kid: "../publico/terminos.txt" });
console.log("Header del token falso:", Buffer.from(falso.split(".")[0], "base64url").toString());
console.log("\nEl verificador responde:", verificarIngenuo(falso, { clavePublica }));
console.log("\nEl campo que elige la clave vino en el mismo token que esa clave tenía que verificar.");

// PARA PROBAR VOS
// 1. Si el kid fuera a una consulta SQL armada concatenando, ¿qué sería este ataque?
// 2. ¿Lo arregla filtrar los "../"? Mejor: ¿por qué el kid debería ser una BÚSQUEDA en un mapa?
// 3. Si usás un objeto común como mapa, probá kid = "__proto__" o "constructor". ¿Qué devuelve?
