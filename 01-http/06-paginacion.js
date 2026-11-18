// node 01-http/06-paginacion.js
//
// PREDECÍ ANTES DE EJECUTAR
// Traés la página 1 de alertas (de a 3, las más nuevas primero). Mientras leés, entra una alerta.
// Traés la página 2. ¿Qué ves con offset? ¿Y con cursor?
// Después se BORRA una alerta entre página y página. ¿Qué pasa ahora?
const express = require("express");
const { levantar, pedir } = require("../comun/red");

let alertas;
const reiniciar = () => { alertas = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })); };
const nuevasPrimero = () => [...alertas].sort((a, b) => b.id - a.id);
let siguienteId = 11;
const entra = () => alertas.push({ id: siguienteId++ });
const borra = (id) => { alertas = alertas.filter((a) => a.id !== id); };

const cifrar = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const descifrar = (c) => JSON.parse(Buffer.from(c, "base64url").toString());

const app = express();
app.get("/offset", (req, res) => {
  const pagina = Number(req.query.pagina), limite = 3;
  res.json({ items: nuevasPrimero().slice((pagina - 1) * limite, pagina * limite).map((a) => a.id) });
});
app.get("/cursor", (req, res) => {
  const limite = 3;
  const desde = req.query.cursor ? descifrar(req.query.cursor).id : Infinity;
  const items = nuevasPrimero().filter((a) => a.id < desde).slice(0, limite);
  const ultimo = items.at(-1);
  res.json({ items: items.map((a) => a.id), siguiente: ultimo ? cifrar({ id: ultimo.id }) : null });
});

(async () => {
  const s = await levantar(app);
  const offset = async (p) => (await pedir(`${s.url}/offset?pagina=${p}`)).datos.items;
  const cursor = async (c) => (await pedir(`${s.url}/cursor${c ? "?cursor=" + c : ""}`)).datos;

  console.log("=== ENTRA UNA ALERTA ENTRE PÁGINAS ===");
  reiniciar();
  const o1 = await offset(1); entra(); const o2 = await offset(2);
  console.log("offset:", o1, o2, "<-- mirá el 8");

  reiniciar(); siguienteId = 11;
  const c1 = await cursor(); entra(); const c2 = await cursor(c1.siguiente);
  console.log("cursor:", c1.items, c2.items);

  console.log("\n=== SE BORRA UNA ALERTA ENTRE PÁGINAS ===");
  reiniciar();
  const o3 = await offset(1); borra(9); const o4 = await offset(2);
  console.log("offset:", o3, o4, "<-- ¿dónde está el 7?");

  reiniciar();
  const c3 = await cursor(); borra(9); const c4 = await cursor(c3.siguiente);
  console.log("cursor:", c3.items, c4.items);

  console.log("\nCursor que recibe el cliente:", c3.siguiente, "=", descifrar(c3.siguiente));
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. El cursor no deja "saltar a la página 7". ¿Para qué pantallas es aceptable y para cuáles no?
// 2. Ordená por temperatura en vez de por id. Hay diez alertas con 12.5 °C. ¿Qué se rompe del cursor?
//    Pista: el cursor necesita un desempate: (temperatura, id).
// 3. Un cliente manda ?cursor=basura. Hoy explota con 500. Devolvé un 400 con Problem Details.
// 4. Para el TP: en PostgreSQL corré EXPLAIN ANALYZE con OFFSET 100000 y con WHERE id < x. Compará filas leídas.
