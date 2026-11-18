// node 03-jwt/08-refresh-rotacion.js
//
// Access token: corto, sin estado (15 min). Refresh token: largo, opaco, EN LA BASE, de un solo uso.
// Cada refresh entrega uno nuevo. Si reaparece uno ya usado, alguien lo robó.
//
// PREDECÍ ANTES DE EJECUTAR
// a) El ladrón usa el refresh robado antes que la víctima. ¿Quién queda afuera cuando la víctima vuelve?
// b) La respuesta del refresh se pierde en la red y el celular reintenta. ¿Qué pasa? Es un cliente honesto.
const crypto = require("node:crypto");

const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

function crearSesiones() {
  const tokens = new Map();   // hash -> { familia, usado }
  const familias = new Map(); // familia -> { uid, revocada }

  function nuevoRefresh(familia) {
    const token = crypto.randomBytes(32).toString("base64url");
    tokens.set(hash(token), { familia, usado: false }); // en la base va el hash, nunca el token
    return token;
  }
  return {
    familias,
    login(uid) {
      const familia = crypto.randomUUID();
      familias.set(familia, { uid, revocada: false });
      return nuevoRefresh(familia);
    },
    refrescar(token) {
      const r = tokens.get(hash(token));
      if (!r) return { error: "desconocido" };
      const f = familias.get(r.familia);
      if (f.revocada) return { error: "familia revocada: hay que volver a iniciar sesión" };
      if (r.usado) {
        f.revocada = true;
        return { error: "REUSO DETECTADO: se revoca toda la familia" };
      }
      r.usado = true;
      return { refresh: nuevoRefresh(r.familia), access: `access-de-${f.uid}` };
    },
  };
}
const mostrar = (quien, r) => console.log(`  ${quien.padEnd(30)}`, r.error ?? `ok, recibe ${r.access} y refresh nuevo`);

console.log("A. Uso normal");
let s = crearSesiones();
let t1 = s.login("ana");
let r = s.refrescar(t1); mostrar("Ana refresca", r);
r = s.refrescar(r.refresh); mostrar("Ana refresca otra vez", r);

console.log("\nB. El ladrón llega PRIMERO con un token robado");
s = crearSesiones();
const robado = s.login("ana");
const delLadron = s.refrescar(robado); mostrar("Ladrón usa el robado", delLadron);
mostrar("Ana vuelve con el mismo token", s.refrescar(robado));
mostrar("Ladrón usa el suyo nuevo", s.refrescar(delLadron.refresh));

console.log("\nC. Ana llega primero, el ladrón después");
s = crearSesiones();
const copia = s.login("ana");
const deAna = s.refrescar(copia); mostrar("Ana refresca", deAna);
mostrar("Ladrón usa la copia vieja", s.refrescar(copia));
mostrar("Ana sigue con el suyo", s.refrescar(deAna.refresh));

console.log("\nD. Nadie robó nada: la respuesta se perdió en la red");
s = crearSesiones();
const delCelular = s.login("ana");
s.refrescar(delCelular); console.log("  el servidor rotó, pero la respuesta nunca llegó");
mostrar("El celular reintenta", s.refrescar(delCelular));

// PARA PROBAR VOS
// 1. Agregá una ventana de gracia: si el reuso llega dentro de los 10 segundos, devolvé el mismo sucesor.
//    ¿El caso D se arregla? ¿Qué le regalaste al ladrón?
// 2. Esto es la idempotencia del principio de la clase, reapareciendo en el refresh. ¿Se te ocurre aplicarla?
// 3. En el caso B, el ladrón ya tenía un access token. ¿Cuánto tiempo más puede usarlo?
// 4. ¿Por qué se guarda el hash y no el token?
