// node 02-identidad/02-verificar-id-token.js
//
// El backend NO autentica: no ve contraseñas. El proveedor autentica; el backend VERIFICA.
//
// PREDECÍ ANTES DE EJECUTAR
// El proveedor firma los tokens de TODOS sus proyectos con las mismas claves.
// Un verificador que solo mira la firma, ¿acepta un token emitido para OTRO proyecto?
const { crearProveedor } = require("../comun/proveedor-local");
const { abrir, firmaRS256Valida, firmarRS256, firmarHS256, sinFirma, ahora } = require("../comun/jwt");
const { verificarIdToken } = require("./verificador");
const crypto = require("node:crypto");

const MI_PROYECTO = "telemetria-utn";
const idp = crearProveedor();
idp.registrar("ana@utn.edu", "clave-ana");

const token = idp.iniciarSesion("ana@utn.edu", "clave-ana", MI_PROYECTO);
console.log("TOKEN QUE RECIBE EL BACKEND\n", token.slice(0, 70) + "...\n");
console.log(abrir(token).header);
console.log(abrir(token).payload, "\n");

const claves = idp.clavesPublicas();
const opciones = { proyecto: MI_PROYECTO, clavesPublicas: claves };

// Un verificador "que funciona" en todas las pruebas felices:
const soloFirma = (t) => firmaRS256Valida(t, claves[abrir(t).header.kid]);

// Tokens falsos. Ninguno necesita romper RSA.
const otroProyecto = idp.iniciarSesion("ana@utn.edu", "clave-ana", "jueguito-del-atacante");
const vencido = idp.iniciarSesion("ana@utn.edu", "clave-ana", MI_PROYECTO, { duracion: -3600 });
const [h, , f] = token.split(".");
const payloadEditado = Buffer.from(JSON.stringify({ ...abrir(token).payload, sub: "uid_admin" })).toString("base64url");
const adulterado = `${h}.${payloadEditado}.${f}`;
const { privateKey: claveAjena } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const claveDesconocida = firmarRS256(abrir(token).payload, claveAjena, "kid-inventado");
const sinFirmar = sinFirma(abrir(token).payload);

const casos = [
  ["token legítimo", token],
  ["para otro proyecto", otroProyecto],
  ["vencido hace 1 hora", vencido],
  ["payload editado a mano", adulterado],
  ["firmado con otra clave", claveDesconocida],
  ["alg: none", sinFirmar],
];

console.log("caso".padEnd(26), "solo firma".padEnd(14), "verificación completa");
for (const [nombre, t] of casos) {
  let a; try { a = soloFirma(t) ? "ACEPTA" : "rechaza"; } catch { a = "rechaza"; }
  let b; try { b = `ACEPTA uid=${verificarIdToken(t, opciones).uid}`; } catch (e) { b = `rechaza: ${e.message}`; }
  console.log(nombre.padEnd(26), a.padEnd(14), b);
}

// PARA PROBAR VOS
// 1. En 02-identidad/verificador.js comentá la línea de aud y volvé a correr. Sigue rechazando: ¿quién lo frenó?
//    Comentá también la de iss. Ahora contá el ataque en una frase: ¿qué tiene que hacer el atacante para entrar?
// 2. Comentá la de exp. ¿Cuánto vale ahora un token robado hace un año?
// 3. En Firebase real esto lo hace una línea: getAuth().verifyIdToken(idToken).
//    Mirá la documentación y comprobá que chequea lo mismo que este archivo.
