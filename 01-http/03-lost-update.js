// node 01-http/03-lost-update.js
//
// PREDECÍ ANTES DE EJECUTAR
// Ana y Beto leen el mismo sensor. Ana cambia el umbral. Beto cambia el nombre.
// Los dos hacen PUT y los dos reciben 200. ¿Qué queda guardado?
const express = require("express");
const { levantar, pedir } = require("../comun/red");

let sensor = { id: "S-01", nombre: "Cámara fría", umbral: 8 };
const app = express();
app.use(express.json());
app.get("/sensores/S-01", (req, res) => res.json(sensor));
app.put("/sensores/S-01", (req, res) => { sensor = { ...req.body, id: "S-01" }; res.json(sensor); });

(async () => {
  const s = await levantar(app);
  const url = `${s.url}/sensores/S-01`;

  const deAna = (await pedir(url)).datos;
  const deBeto = (await pedir(url)).datos;

  const a = await pedir(url, { metodo: "PUT", cuerpo: { ...deAna, umbral: 4 } });
  console.log("Ana sube umbral a 4:     ", a.status, a.datos);
  const b = await pedir(url, { metodo: "PUT", cuerpo: { ...deBeto, nombre: "Cámara 1" } });
  console.log("Beto renombra:           ", b.status, b.datos);

  console.log("\nEn la base:", (await pedir(url)).datos);
  console.log("Dos 200, ningún error, y el cambio de Ana desapareció. Eso es un lost update.");
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. ¿Lo arregla pasar a PATCH con solo el campo que cambió? Probalo con dos personas cambiando
//    el MISMO campo a partir de una lectura vieja: "si el umbral es 8, bajalo a la mitad".
// 2. ¿Lo arregla un await menos, o una base más rápida? ¿Por qué no depende de la velocidad?
