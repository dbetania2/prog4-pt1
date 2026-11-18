// node 03-jwt/09-rotacion-de-claves.js
//
// PREDECÍ ANTES DE EJECUTAR
// El proveedor rota su clave de firma. Tu API tiene las públicas en caché.
// a) Llega un token con un kid que no conocés. ¿Rechazás o volvés a buscar claves?
// b) Un atacante manda mil tokens con kids inventados. ¿Cuántas veces le pegás al proveedor?
const { crearProveedor } = require("../comun/proveedor-local");
const { abrir, firmaRS256Valida } = require("../comun/jwt");

const idp = crearProveedor();
idp.registrar("ana@utn.edu", "a");
let descargas = 0;

function crearCache({ minimoEntreDescargasMs }) {
  let claves = {}, ultima = -Infinity;
  const descargar = () => { descargas++; claves = idp.clavesPublicas(); ultima = Date.now(); };
  descargar();
  return function buscar(kid) {
    if (Object.hasOwn(claves, kid)) return claves[kid];
    if (Date.now() - ultima >= minimoEntreDescargasMs) descargar();
    return Object.hasOwn(claves, kid) ? claves[kid] : null;
  };
}
const verificar = (buscar, t) => {
  const clave = buscar(abrir(t).header.kid);
  return clave && firmaRS256Valida(t, clave) ? "acepta" : "rechaza";
};
const inventado = (i) => `${Buffer.from(JSON.stringify({ alg: "RS256", kid: "falso-" + i })).toString("base64url")}.e30.AAAA`;

const buscar = crearCache({ minimoEntreDescargasMs: 0 });
const viejo = idp.iniciarSesion("ana@utn.edu", "a", "p");
const kidViejo = idp.kidVigente;
console.log("Clave vigente:", kidViejo, "· token firmado con ella:", verificar(buscar, viejo));

console.log("\n1. Rotación con solapamiento: entra una nueva, la vieja se sigue publicando");
idp.rotar();
const nuevo = idp.iniciarSesion("ana@utn.edu", "a", "p");
console.log("  token nuevo (kid desconocido, fuerza descarga):", verificar(buscar, nuevo));
console.log("  token viejo, todavía sin vencer:               ", verificar(buscar, viejo));

console.log("\n2. Se retira la vieja cuando vencieron todos sus tokens");
idp.retirar(kidViejo);
const buscar2 = crearCache({ minimoEntreDescargasMs: 0 });
console.log("  token viejo:", verificar(buscar2, viejo));

console.log("\n3. Mil kids inventados");
descargas = 0;
const ingenua = crearCache({ minimoEntreDescargasMs: 0 });
for (let i = 0; i < 1000; i++) verificar(ingenua, inventado(i));
console.log(`  sin límite:            ${descargas} descargas al proveedor`);
descargas = 0;
const limitada = crearCache({ minimoEntreDescargasMs: 60_000 });
for (let i = 0; i < 1000; i++) verificar(limitada, inventado(i));
console.log(`  máximo una por minuto: ${descargas} descarga`);

// PARA PROBAR VOS
// 1. Firebase publica el tiempo de caché en el header Cache-Control de la respuesta de claves. ¿Por qué lo decide el proveedor?
// 2. Si retirás la clave vieja antes de que venzan sus tokens, ¿qué ven los usuarios?
// 3. Si te roban la clave privada, ¿te alcanza con rotar normal? ¿Qué cambia en el solapamiento?
