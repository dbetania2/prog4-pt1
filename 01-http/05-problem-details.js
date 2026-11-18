// node 01-http/05-problem-details.js
//
// RFC 9457: un formato estándar para el cuerpo de un error. Content-Type: application/problem+json.
//
// PREDECÍ ANTES DE EJECUTAR, para cada pedido de abajo: ¿qué código le corresponde?
//   JSON roto · temperatura "caliente" · sin token · con token pero sin permiso ·
//   sensor inexistente · crear un sensor que ya existe · bug en el servidor
const express = require("express");
const { levantar, pedir } = require("../comun/red");

class Problema extends Error {
  constructor(status, tipo, titulo, detalle, extra = {}) {
    super(titulo);
    Object.assign(this, { status, tipo, titulo, detalle, extra });
  }
}

const app = express();
app.use(express.json());

function autenticar(req, res, next) {
  const token = req.get("Authorization");
  if (!token) throw new Problema(401, "sin-credenciales", "No sabemos quién sos", "Mandá un token válido.");
  req.rol = token.endsWith("admin") ? "admin" : "operador";
  next();
}

app.post("/lecturas", (req, res) => {
  if (typeof req.body.temperatura !== "number") {
    throw new Problema(422, "validacion", "La lectura no es válida", "Revisá los campos marcados.", {
      errores: [{ campo: "temperatura", motivo: "tiene que ser un número" }],
    });
  }
  res.status(201).json(req.body);
});
app.delete("/sensores/:id", autenticar, (req, res) => {
  if (req.rol !== "admin") throw new Problema(403, "sin-permiso", "Sabemos quién sos y no podés", "Hace falta rol admin.");
  res.status(204).end();
});
app.get("/sensores/:id", (req, res) => {
  throw new Problema(404, "no-encontrado", "No existe ese sensor", `No hay sensor ${req.params.id}.`);
});
app.post("/sensores", () => {
  throw new Problema(409, "ya-existe", "Ya existe", "S-01 ya está registrado.");
});
app.get("/bug", () => {
  const clave = "postgres://admin:secreto@db:5432/prod";
  throw new Error(`no pude conectar a ${clave}`); // error real, con datos que no deben salir
});

// Único lugar donde un error se convierte en respuesta.
app.use((err, req, res, next) => {
  let p = err;
  if (err.type === "entity.parse.failed") p = new Problema(400, "json-invalido", "El cuerpo no es JSON válido", "No se pudo parsear.");
  if (!(p instanceof Problema)) {
    console.log("   [log interno, el cliente no lo ve]:", err.message);
    p = new Problema(500, "interno", "Error interno", "Avisanos con este id de error: e-1234.");
  }
  res.status(p.status).type("application/problem+json").send(JSON.stringify({
    type: `https://api.ejemplo.edu/problemas/${p.tipo}`,
    title: p.titulo, status: p.status, detail: p.detalle, instance: req.originalUrl, ...p.extra,
  }));
});

(async () => {
  const s = await levantar(app);
  const casos = [
    ["JSON roto", "/lecturas", { metodo: "POST", cuerpo: "{temperatura:" }],
    ["temperatura inválida", "/lecturas", { metodo: "POST", cuerpo: { temperatura: "caliente" } }],
    ["sin token", "/sensores/S-01", { metodo: "DELETE" }],
    ["con token, sin permiso", "/sensores/S-01", { metodo: "DELETE", headers: { Authorization: "Bearer operador" } }],
    ["sensor inexistente", "/sensores/S-99", {}],
    ["ya existe", "/sensores", { metodo: "POST", cuerpo: { id: "S-01" } }],
    ["bug", "/bug", {}],
  ];
  for (const [nombre, ruta, op] of casos) {
    const r = await pedir(s.url + ruta, op);
    console.log(`\n${nombre} -> ${r.status} ${r.headers.get("content-type")}`);
    console.log(" ", JSON.stringify(r.datos));
  }
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. Sacá el middleware de error y volvé a correr "bug" y "JSON roto". ¿Qué le llega al cliente?
//    Corré con NODE_ENV=production y compará.
// 2. Agregá el caso 429 con un header Retry-After.
// 3. 400 contra 422: ¿cómo explicarías la diferencia en una frase?
