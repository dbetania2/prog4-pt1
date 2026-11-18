// node 03-jwt/07-no-se-puede-revocar.js
//
// PREDECÍ ANTES DE EJECUTAR
// Ana cierra sesión. El frontend borra el token. Pero alguien había copiado ese token.
// ¿Sigue funcionando? ¿Qué tendría que pasar para que deje de funcionar antes de vencer?
const express = require("express");
const { levantar, pedir } = require("../comun/red");
const { firmarHS256, firmaHS256Valida, abrir, ahora } = require("../comun/jwt");

const SECRETO = require("node:crypto").randomBytes(32);
const revocados = new Set();
let consultasAlStore = 0;

const emitir = (sub) => firmarHS256({ sub, jti: crypto.randomUUID(), iat: ahora(), exp: ahora() + 900 }, SECRETO);
function sinEstado(req, res, next) {
  const t = (req.get("Authorization") ?? "").replace("Bearer ", "");
  if (!firmaHS256Valida(t, SECRETO) || abrir(t).payload.exp <= ahora()) return res.sendStatus(401);
  req.token = abrir(t).payload;
  next();
}
function conLista(req, res, next) {
  consultasAlStore++;
  if (revocados.has(req.token.jti)) return res.sendStatus(401);
  next();
}

const app = express();
app.post("/logout", sinEstado, (req, res) => { revocados.add(req.token.jti); res.sendStatus(204); });
app.get("/sin-estado", sinEstado, (req, res) => res.json({ hola: req.token.sub }));
app.get("/con-lista", sinEstado, conLista, (req, res) => res.json({ hola: req.token.sub }));

(async () => {
  const s = await levantar(app);
  const tokenAna = emitir("ana");
  const robado = tokenAna; // copia
  const headers = { Authorization: `Bearer ${robado}` };
  const pedidoSinEstado = () => pedir(`${s.url}/sin-estado`, { headers });
  const pedidoConLista = () => pedir(`${s.url}/con-lista`, { headers });

  console.log("Antes del logout: sin estado", (await pedidoSinEstado()).status, "· con lista", (await pedidoConLista()).status);
  console.log("Ana hace logout:", (await pedir(`${s.url}/logout`, { metodo: "POST", headers: { Authorization: `Bearer ${tokenAna}` } })).status);
  console.log("Después, con la copia: sin estado", (await pedidoSinEstado()).status, "· con lista", (await pedidoConLista()).status);
  console.log(`\nEl token sigue valiendo ${abrir(robado).payload.exp - ahora()} segundos más en la ruta sin estado.`);
  console.log(`Y la ruta con lista consulta un almacén en cada pedido: ${consultasAlStore} consultas.`);
  console.log("Si para cada pedido vas a consultar un almacén, ¿qué te queda de la ventaja de no tener estado?");
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. ¿Cuánto ocupa la lista si guardás jti solo hasta su exp? ¿Y si los tokens viven 15 minutos o 30 días?
// 2. Discutí con el de al lado: para una API con una sola base, ¿JWT o sesión opaca en esa base?
