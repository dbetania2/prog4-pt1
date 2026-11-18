// node 00-arranque/verificar.js
// Si esto imprime TODO OK, tu máquina está lista para la clase.
const { levantar, pedir } = require("../comun/red");
const express = require("express");

(async () => {
  const mayor = Number(process.versions.node.split(".")[0]);
  console.log(`Node ${process.versions.node}`, mayor >= 22 ? "OK" : "<-- necesitás Node 22 o más");
  const app = express();
  app.get("/hola", (req, res) => res.json({ mensaje: "hola" }));
  const s = await levantar(app);
  const r = await pedir(`${s.url}/hola`);
  console.log(`Express ${require("express/package.json").version} respondió ${r.status}`);
  await s.cerrar();
  console.log(mayor >= 22 && r.status === 200 ? "TODO OK" : "Algo falta: avisá.");
})();
