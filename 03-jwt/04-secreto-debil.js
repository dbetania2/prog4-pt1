// node 03-jwt/04-secreto-debil.js
//
// PREDECÍ ANTES DE EJECUTAR
// Un token HS256 con secreto "sensor2024". El atacante tiene el token: lo vio en un log.
// ¿Necesita pegarle a tu servidor para probar contraseñas? ¿Cuántas prueba por segundo tu máquina?
const crypto = require("node:crypto");
const { firmarHS256, firmaHS256Valida, ahora } = require("../comun/jwt");

const token = firmarHS256({ sub: "uid_beto", rol: "operador", exp: ahora() + 900 }, "sensor2024");

const palabras = ["admin", "secret", "clave", "password", "token", "jwt", "api", "sensor", "telemetria", "utn", "node", "express", "test", "prod", "dev"];
const sufijos = ["", "1", "12", "123", "1234", "!", ...Array.from({ length: 30 }, (_, i) => String(2000 + i))];
const candidatos = palabras.flatMap((p) => sufijos.map((s) => p + s));

const inicio = process.hrtime.bigint();
let hallado = null, probados = 0;
for (const c of candidatos) { probados++; if (firmaHS256Valida(token, c)) { hallado = c; break; } }
let ciclos = 0;
const t0 = Date.now();
while (Date.now() - t0 < 500) { firmaHS256Valida(token, "x" + ciclos); ciclos++; }
const porSegundo = ciclos * 2;
const ms = Number(process.hrtime.bigint() - inicio) / 1e6;

console.log(`Candidatos probados: ${probados} de ${candidatos.length}. Sin un solo pedido al servidor.`);
console.log(`Secreto encontrado: "${hallado}"`);
console.log(`Tu máquina, con un núcleo: ${porSegundo.toLocaleString("es-AR")} intentos por segundo (medición total: ${ms.toFixed(0)} ms)`);

const anios = (bits) => (2 ** bits / porSegundo) / (3600 * 24 * 365);
console.log("\nA esa velocidad, probar todos los secretos posibles:");
console.log(`  8 letras minúsculas: ${(26 ** 8 / porSegundo / 3600).toFixed(1)} horas`);
console.log(`  32 bytes aleatorios: ${anios(256).toExponential(1)} años`);
console.log(`\nGenerá el secreto así: ${crypto.randomBytes(32).toString("base64url")}`);

// PARA PROBAR VOS
// 1. Cambiá el secreto por uno que uses "de ejemplo" en tus proyectos. ¿Lo encuentra?
// 2. ¿Por qué acá no sirve un rate limit? ¿Dónde ocurre el ataque?
// 3. Si encontró el secreto, ¿qué puede fabricar el atacante? ¿Cuánto tiempo le sirve?
