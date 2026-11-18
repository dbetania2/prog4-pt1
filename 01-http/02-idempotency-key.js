// node 01-http/02-idempotency-key.js
//
// El arreglo: el CLIENTE genera una clave por OPERACIÓN (no por intento) y la reenvía en cada reintento.
//
// PREDECÍ ANTES DE EJECUTAR
// a) Reintento mientras el primero todavía se está procesando: ¿qué código?
// b) Reintento cuando el primero ya terminó: ¿qué código? ¿crea otra alerta?
// c) Misma clave, cuerpo distinto: ¿qué debería pasar?
const crypto = require("node:crypto");
const express = require("express");
const { levantar, pedir, esperar } = require("../comun/red");

const alertas = [];
const operaciones = new Map(); // clave -> { huella, estado, status, cuerpo }

function idempotente(req, res, next) {
  const clave = req.get("Idempotency-Key");
  if (!clave) return res.status(400).json({ error: "falta Idempotency-Key" });

  const huella = crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
  const previa = operaciones.get(clave);
  if (previa) {
    if (previa.huella !== huella) return res.status(422).json({ error: "esa clave ya se usó con otro cuerpo" });
    if (previa.estado === "en-curso") return res.status(409).json({ error: "esa operación se está procesando" });
    return res.status(previa.status).set("Idempotent-Replayed", "true").json(previa.cuerpo);
  }

  // Sin await entre el get y el set: en Node nada se puede meter en el medio.
  // Con dos instancias esto no alcanza: va en la base, con un UNIQUE sobre la clave.
  const registro = { huella, estado: "en-curso" };
  operaciones.set(clave, registro);

  const json = res.json.bind(res);
  res.json = (cuerpo) => {
    Object.assign(registro, { estado: "listo", status: res.statusCode, cuerpo });
    return json(cuerpo);
  };
  next();
}

const app = express();
app.use(express.json());
app.post("/alertas", idempotente, async (req, res) => {
  const alerta = { id: alertas.length + 1, ...req.body };
  alertas.push(alerta);
  await esperar(300);
  res.status(201).json(alerta);
});

(async () => {
  const s = await levantar(app);
  const clave = crypto.randomUUID();
  const cuerpo = { sensor: "S-01", temperatura: 12.5 };
  const opciones = { metodo: "POST", cuerpo, headers: { "Idempotency-Key": clave } };
  console.log("Idempotency-Key:", clave, "\n");

  try { await pedir(`${s.url}/alertas`, { ...opciones, timeoutMs: 100 }); }
  catch (e) { console.log(`intento 1: el cliente cortó (${e.name})`); }

  const r2 = await pedir(`${s.url}/alertas`, opciones);
  console.log(`intento 2, todavía procesando: ${r2.status}`, r2.datos);

  await esperar(400);
  const r3 = await pedir(`${s.url}/alertas`, opciones);
  console.log(`intento 3, ya terminó:         ${r3.status}`, r3.datos, "replayed:", r3.headers.get("idempotent-replayed"));

  const r4 = await pedir(`${s.url}/alertas`, { ...opciones, cuerpo: { sensor: "S-99", temperatura: 80 } });
  console.log(`misma clave, otro cuerpo:      ${r4.status}`, r4.datos);

  console.log(`\nAlertas en la base: ${alertas.length}`);
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. Sacá la comparación de huellas. Mandá la misma clave con otro cuerpo. ¿Qué recibe el cliente?
//    ¿Por qué es peor que un error?
// 2. El handler explota después de guardar. ¿Qué hacés con el registro "en-curso"?
//    Si queda así, ¿qué le pasa a todos los reintentos?
// 3. ¿Cuánto tiempo guardás las claves? Stripe las puede borrar después de 24 horas. ¿Qué gana y qué arriesga?
