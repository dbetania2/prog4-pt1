// node 01-http/01-reintento-post.js
//
// PREDECÍ ANTES DE EJECUTAR
// El cliente manda un POST y corta a los 100 ms si no le contestaron. Reintenta hasta lograrlo.
// El servidor guarda la alerta y RECIÉN DESPUÉS tarda en contestar.
// El cliente ve dos timeouts y un 201. ¿Cuántas alertas hay en la base?
const express = require("express");
const { levantar, pedir, esperar } = require("../comun/red");

const alertas = [];
let pedidos = 0;
const app = express();
app.use(express.json());
app.post("/alertas", async (req, res) => {
  pedidos++;
  const alerta = { id: alertas.length + 1, ...req.body };
  alertas.push(alerta);                     // 1. ya quedó guardada
  if (pedidos < 3) await esperar(300);      // 2. la red o la base se ponen lentas
  if (!res.destroyed) res.status(201).json(alerta);
});

(async () => {
  const s = await levantar(app);
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await pedir(`${s.url}/alertas`, {
        metodo: "POST", cuerpo: { sensor: "S-01", temperatura: 12.5 }, timeoutMs: 100,
      });
      console.log(`intento ${intento}: ${r.status}`, r.datos);
      break;
    } catch (e) {
      console.log(`intento ${intento}: el cliente cortó (${e.name}). ¿Se guardó o no? El cliente NO lo sabe.`);
    }
  }
  await esperar(400);
  console.log(`\nEl cliente cree que creó 1 alerta. En la base hay: ${alertas.length}`);
  console.log(alertas);
  await s.cerrar();
})();

// PARA PROBAR VOS
// 1. Cambiá el orden: primero esperar y después guardar. ¿Se arregló o cambió el problema?
//    Pista: ¿qué pasa ahora si el proceso muere durante la espera?
// 2. Un timeout tiene tres finales posibles: no llegó, llegó y falló, llegó y funcionó.
//    ¿Hay alguna forma de distinguirlos desde el cliente?
