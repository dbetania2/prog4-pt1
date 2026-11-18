// Proveedor de identidad LOCAL. Emite tokens con la MISMA forma que Firebase Auth:
//   header: alg RS256 + kid
//   payload: iss https://securetoken.google.com/<proyecto>, aud <proyecto>, sub, auth_time, iat, exp
// Sirve para que la clase no dependa de cuentas, internet ni consolas.
// Igual que el real, firma los tokens de TODOS los proyectos con las mismas claves.
const crypto = require("node:crypto");
const { firmarRS256, ahora } = require("./jwt");

function crearProveedor() {
  const claves = new Map();
  const usuarios = new Map();
  let vigente;

  function rotar() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const kid = crypto.randomBytes(6).toString("hex");
    claves.set(kid, { publica: publicKey.export({ type: "spki", format: "pem" }), privada: privateKey });
    vigente = kid;
    return kid;
  }
  rotar();

  function registrar(email, contrasenia, claims = {}) {
    const uid = "uid_" + crypto.createHash("sha256").update(email).digest("hex").slice(0, 10);
    usuarios.set(email, { uid, email, contrasenia, claims });
    return uid;
  }

  function emitir(usuario, proyecto, { duracion = 3600, extra = {} } = {}) {
    const t = ahora();
    return firmarRS256({
      iss: `https://securetoken.google.com/${proyecto}`, aud: proyecto,
      auth_time: t, user_id: usuario.uid, sub: usuario.uid, iat: t, exp: t + duracion,
      email: usuario.email, ...usuario.claims, ...extra,
    }, claves.get(vigente).privada, vigente);
  }

  function iniciarSesion(email, contrasenia, proyecto, opciones) {
    const u = usuarios.get(email);
    if (!u || u.contrasenia !== contrasenia) throw new Error("credenciales inválidas");
    return emitir(u, proyecto, opciones);
  }

  return {
    rotar, registrar, iniciarSesion,
    // Lo mismo que publica Google: un mapa kid -> clave pública.
    clavesPublicas: () => Object.fromEntries([...claves].map(([kid, c]) => [kid, c.publica])),
    retirar: (kid) => claves.delete(kid),
    cambiarClaims: (email, claims) => { usuarios.get(email).claims = claims; },
    get kidVigente() { return vigente; },
  };
}
module.exports = { crearProveedor };
