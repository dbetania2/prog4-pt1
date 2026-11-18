// node 02-identidad/01-uid-en-el-body.js
//
// PREDECÍ ANTES DE EJECUTAR
// El frontend ya hizo login con Firebase y le manda al backend quién es el usuario.
// ¿Hace falta romper algo para ver los datos de otro?
const express = require("express");
const { levantar, pedir } = require("../comun/red");

const empresas = {
  uid_ana: { nombre: "Frigorífico Ana", contrato: "USD 40.000" },
  uid_beto: { nombre: "Lácteos Beto", contrato: "USD 12.000" },
};
const app = express();
app.use(express.json());
app.post("/mi-empresa", (req, res) => res.json(empresas[req.body.uid]));

(async () => {
  const s = await levantar(app);
  console.log("Beto, usando la app normalmente:");
  console.log(" ", (await pedir(`${s.url}/mi-empresa`, { metodo: "POST", cuerpo: { uid: "uid_beto" } })).datos);
  console.log("Beto, cambiando un texto del pedido en las herramientas del navegador:");
  console.log(" ", (await pedir(`${s.url}/mi-empresa`, { metodo: "POST", cuerpo: { uid: "uid_ana" } })).datos);
  console.log("\nEl login estuvo perfecto y no sirvió de nada: el backend le creyó al cliente.");
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. Si el uid viaja en un header en vez del body, ¿cambia algo? ¿Y si es un UUID difícil de adivinar?
// 2. Regla para anotar: lo único que identifica al usuario es lo que sale de un token VERIFICADO.
