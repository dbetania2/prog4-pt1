// API de alertas con seis defectos. Arreglala hasta que pasen las pruebas: npm run lab
const crypto = require("node:crypto");
const express = require("express");
const { abrir } = require("../comun/jwt");

function crearApp({ proyecto, clavesPublicas }) {
  const alertas = [];
  const sensores = new Map([["S-01", { id: "S-01", nombre: "Cámara fría", umbral: 8 }]]);
  const refreshes = new Map(); // token -> uid

  const app = express();
  app.use(express.json());

  // Se la usa desde las pruebas para empezar una sesión.
  app.locals.iniciarSesion = (uid) => {
    const token = crypto.randomBytes(32).toString("base64url");
    refreshes.set(token, uid);
    return token;
  };
  app.locals.cantidadDeAlertas = () => alertas.length;

  // DEFECTO 1: abre el token y le cree. No verifica nada.
  function autenticar(req, res, next) {
    try {
      const token = (req.get("Authorization") ?? "").replace("Bearer ", "");
      req.uid = abrir(token).payload.sub;
      next();
    } catch {
      res.status(401).json({ error: "sin token" });
    }
  }

  // DEFECTO 2: cada reintento crea otra alerta.
  // DEFECTO 5: paginación por offset.
  app.post("/alertas", autenticar, (req, res) => {
    const alerta = { id: alertas.length + 1, creadaPor: req.uid, ...req.body };
    alertas.push(alerta);
    res.status(201).json(alerta);
  });
  app.get("/alertas", autenticar, (req, res) => {
    const limite = Number(req.query.limite ?? 10);
    const pagina = Number(req.query.pagina ?? 1);
    const items = [...alertas].sort((a, b) => b.id - a.id).slice((pagina - 1) * limite, pagina * limite);
    res.json({ items });
  });

  // DEFECTO 3: el último que escribe pisa al otro.
  app.get("/sensores/:id", autenticar, (req, res) => {
    const sensor = sensores.get(req.params.id);
    if (!sensor) return res.status(404).json({ error: "no existe" });
    res.json(sensor);
  });
  app.put("/sensores/:id", autenticar, (req, res) => {
    if (!sensores.has(req.params.id)) return res.status(404).json({ error: "no existe" });
    const sensor = { ...req.body, id: req.params.id };
    sensores.set(req.params.id, sensor);
    res.json(sensor);
  });

  // DEFECTO 6: el refresh se puede usar para siempre.
  app.post("/refresh", (req, res) => {
    const uid = refreshes.get(req.body.token);
    if (!uid) return res.status(401).json({ error: "refresh inválido" });
    res.json({ refresh: req.body.token, uid });
  });

  app.get("/roto", () => { throw new Error("conexión a postgres://admin:secreto@db falló"); });

  // DEFECTO 4: los errores no siguen RFC 9457 y filtran datos internos.
  app.use((err, req, res, next) => res.status(err.status ?? 500).json({ error: err.message }));

  return app;
}
module.exports = { crearApp };
