// node 02-identidad/03-authn-vs-authz.js
//
// Autenticación: ¿quién sos? (401)   Autorización: ¿podés hacer esto? (403)
//
// PREDECÍ ANTES DE EJECUTAR
// Ana tiene el claim rol=admin en su token. Le sacamos el rol en el proveedor.
// Sigue usando el token que ya tenía. ¿Puede borrar? ¿Y si la autorización mira la base?
const express = require("express");
const { levantar, pedir } = require("../comun/red");
const { crearProveedor } = require("../comun/proveedor-local");
const { verificarIdToken } = require("./verificador");

const PROYECTO = "telemetria-utn";
const idp = crearProveedor();
const uidAna = idp.registrar("ana@utn.edu", "a", { rol: "admin" });
idp.registrar("beto@utn.edu", "b", { rol: "operador" });
const rolesEnBase = new Map([[uidAna, "admin"]]);

function autenticar(req, res, next) {
  const [esquema, token] = (req.get("Authorization") ?? "").split(" ");
  if (esquema !== "Bearer" || !token) return res.status(401).set("WWW-Authenticate", "Bearer").json({ error: "sin token" });
  try { req.usuario = verificarIdToken(token, { proyecto: PROYECTO, clavesPublicas: idp.clavesPublicas() }); }
  catch (e) { return res.status(401).set("WWW-Authenticate", "Bearer").json({ error: e.message }); }
  next();
}
const exigirClaim = (rol) => (req, res, next) =>
  req.usuario.rol === rol ? next() : res.status(403).json({ error: `hace falta ${rol}` });
const exigirEnBase = (rol) => (req, res, next) =>
  rolesEnBase.get(req.usuario.uid) === rol ? next() : res.status(403).json({ error: `hace falta ${rol}` });

const app = express();
app.delete("/con-claim", autenticar, exigirClaim("admin"), (req, res) => res.json({ borrado: true, por: req.usuario.email }));
app.delete("/con-base", autenticar, exigirEnBase("admin"), (req, res) => res.json({ borrado: true, por: req.usuario.email }));

(async () => {
  const s = await levantar(app);
  const borrar = (ruta, token) => pedir(s.url + ruta, { metodo: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const tokenAna = idp.iniciarSesion("ana@utn.edu", "a", PROYECTO);
  const tokenBeto = idp.iniciarSesion("beto@utn.edu", "b", PROYECTO);

  console.log("sin token:          ", (await borrar("/con-claim")).status);
  console.log("token basura:       ", (await borrar("/con-claim", "abc.def.ghi")).status);
  console.log("Beto, operador:     ", (await borrar("/con-claim", tokenBeto)).status);
  console.log("Ana, admin:         ", (await borrar("/con-claim", tokenAna)).status);

  console.log("\n--- Le sacamos el rol a Ana ---");
  idp.cambiarClaims("ana@utn.edu", { rol: "operador" });
  rolesEnBase.set(uidAna, "operador");
  console.log("Ana, token viejo, autorizando con el claim:", (await borrar("/con-claim", tokenAna)).status, "<-- sigue siendo admin hasta que venza");
  console.log("Ana, token viejo, autorizando con la base: ", (await borrar("/con-base", tokenAna)).status);
  const tokenNuevo = idp.iniciarSesion("ana@utn.edu", "a", PROYECTO);
  console.log("Ana, token nuevo, autorizando con el claim:", (await borrar("/con-claim", tokenNuevo)).status);
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. El token vive 1 hora. ¿Cuánto dura como máximo un admin "fantasma" con cada estrategia?
// 2. Mirar la base en cada pedido cuesta una consulta. ¿Para qué rutas lo pagarías y para cuáles no?
// 3. Firebase limita los custom claims a 1000 bytes. ¿Por qué tiene sentido que los permisos
//    finos ("puede editar el sensor S-01 y el S-07") no vayan en el token?
