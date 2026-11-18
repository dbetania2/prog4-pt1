// node 01-http/04-etag-if-match.js
//
// Concurrencia optimista, usando lo que HTTP ya trae: ETag + If-Match.
//
// PREDECÍ ANTES DE EJECUTAR
// a) Beto hace PUT con un ETag viejo. ¿Qué código?
// b) Alguien hace PUT sin If-Match. ¿Qué código?
// c) GET con If-None-Match y el ETag vigente. ¿Viene cuerpo?
const express = require("express");
const { levantar, pedir } = require("../comun/red");

let sensor = { id: "S-01", nombre: "Cámara fría", umbral: 8 };
let version = 1;
const etag = () => `"v${version}"`; // ETag fuerte: sin el W/ adelante

const app = express();
app.use(express.json());

app.get("/sensores/S-01", (req, res) => {
  res.set("ETag", etag());
  if (req.get("If-None-Match") === etag()) return res.status(304).end();
  res.json(sensor);
});

app.put("/sensores/S-01", (req, res) => {
  const condicion = req.get("If-Match");
  if (!condicion) return res.status(428).json({ error: "mandá If-Match con el ETag que leíste" });
  if (condicion !== etag()) return res.status(412).json({ error: "cambió desde que lo leíste", vigente: etag() });
  // Con una base, esto es UN solo UPDATE ... WHERE id = $1 AND version = $2.
  // Si afecta 0 filas, es 412. Comparar en una línea y escribir en otra deja una carrera.
  sensor = { ...req.body, id: "S-01" };
  version++;
  res.set("ETag", etag()).json(sensor);
});

(async () => {
  const s = await levantar(app);
  const url = `${s.url}/sensores/S-01`;

  const ana = await pedir(url);
  const beto = await pedir(url);
  console.log("Ana y Beto leen, ETag:", ana.headers.get("etag"), "\n");

  const a = await pedir(url, { metodo: "PUT", cuerpo: { ...ana.datos, umbral: 4 }, headers: { "If-Match": ana.headers.get("etag") } });
  console.log("Ana PUT:", a.status, a.datos);

  const b = await pedir(url, { metodo: "PUT", cuerpo: { ...beto.datos, nombre: "Cámara 1" }, headers: { "If-Match": beto.headers.get("etag") } });
  console.log("Beto PUT con ETag viejo:", b.status, b.datos);

  const relectura = await pedir(url);
  const b2 = await pedir(url, { metodo: "PUT", cuerpo: { ...relectura.datos, nombre: "Cámara 1" }, headers: { "If-Match": relectura.headers.get("etag") } });
  console.log("Beto relee y reintenta:", b2.status, b2.datos);

  const sinCond = await pedir(url, { metodo: "PUT", cuerpo: { nombre: "x" } });
  console.log("PUT sin If-Match:", sinCond.status, sinCond.datos);

  const cache = await pedir(url, { headers: { "If-None-Match": b2.headers.get("etag") } });
  console.log("GET con If-None-Match:", cache.status, "cuerpo:", cache.datos);
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. Sacá res.set("ETag", ...) del GET y mirá qué manda Express solo. ¿Empieza con W/?
//    RFC 9110 dice que If-Match usa comparación fuerte: ¿te serviría ese ETag?
// 2. Devolver 412 no resuelve el conflicto: lo hace visible. ¿Quién lo resuelve? ¿Y si no hay humano?
