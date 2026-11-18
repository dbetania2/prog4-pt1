# 01-reintento-post.js: El Problema del Timeout y los Reintentos

Demuestra qué ocurre cuando un cliente sufre un **Timeout** al hacer un `POST` y reintenta a ciegas en una red no confiable.

---

## 1. Variables y Entorno (Líneas 7 a 13)

```javascript
const express = require("express");
const { levantar, pedir, esperar } = require("../comun/red");

const alertas = [];
let pedidos = 0;
const app = express();
app.use(express.json());
```

- `const express = require("express");`  
  Importa Express para crear el servidor web HTTP.
- `const { levantar, pedir, esperar } = require("../comun/red");`  
  Utilidades provistas por la cátedra: `levantar` (inicia el server en un puerto libre), `pedir` (hace peticiones HTTP con soporte de timeout), `esperar` (pausa asíncrona en ms).
- `const alertas = [];`  
  Arreglo en memoria RAM que actúa como **base de datos simulada**.
- `let pedidos = 0;`  
  Contador mutable para saber cuántas peticiones recibió el endpoint.
- `const app = express();`  
  Instancia de la aplicación de Express.
- `app.use(express.json());`  
  Middleware global que parsea el cuerpo de las peticiones entrantes con formato JSON y lo deja disponible como objeto en `req.body`.

---

## 2. Controlador de la Ruta POST (Líneas 14 a 20)

```javascript
app.post("/alertas", async (req, res) => {
  pedidos++;
  const alerta = { id: alertas.length + 1, ...req.body };
  alertas.push(alerta); // 1. ya quedó guardada
  if (pedidos < 3) await esperar(300); // 2. la red o la base se ponen lentas
  if (!res.destroyed) res.status(201).json(alerta);
});
```

- `app.post("/alertas", async (req, res) => { ... })`  
  Define la ruta `POST /alertas`. Es asíncrona (`async`) porque espera pausas con `await`.
- `pedidos++;`  
  Suma 1 al contador por cada intento que llega al servidor.
- `const alerta = { id: alertas.length + 1, ...req.body };`  
  Crea el objeto asignándole un ID autoincremental y copiando los campos recibidos en el JSON con el operador spread (`...req.body`).
- `alertas.push(alerta);`  
  **Punto crítico:** Guarda la alerta en la base de datos simulada. Ya impactó en el sistema; no se revierte solo si la red falla después.
- `if (pedidos < 3) await esperar(300);`  
  Simulación de demora de red o base de datos: en los dos primeros intentos, frena 300 ms antes de responder.
- `if (!res.destroyed) res.status(201).json(alerta);`  
  Si el cliente no abortó la conexión (`!res.destroyed`), responde con código `201 Created` y devuelve el JSON creado.

---

## 3. El Cliente y el Bucle de Reintentos (Líneas 22 a 40)

```javascript
(async () => {
  const s = await levantar(app);
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const r = await pedir(`${s.url}/alertas`, {
        metodo: "POST",
        cuerpo: { sensor: "S-01", temperatura: 12.5 },
        timeoutMs: 100,
      });
      console.log(`intento ${intento}: ${r.status}`, r.datos);
      break;
    } catch (e) {
      console.log(
        `intento ${intento}: el cliente cortó (${e.name}). ¿Se guardó o no? El cliente NO lo sabe.`,
      );
    }
  }
  await esperar(400);
  console.log(
    `\nEl cliente cree que creó 1 alerta. En la base hay: ${alertas.length}`,
  );
  console.log(alertas);
  await s.cerrar();
})();
```

- `const s = await levantar(app);`  
  Inicia el servidor temporalmente para la prueba.
- `for (let intento = 1; intento <= 3; intento++)`  
  Bucle que simula un cliente reintentando hasta 3 veces si experimenta errores de red.
- `timeoutMs: 100`  
  El cliente fija su límite de espera en 100 ms.
- `try { ... break; } catch (e) { ... }`  
  En los intentos 1 y 2, el servidor tarda 300 ms. Como 300 ms > 100 ms, el cliente dispara un `TimeoutError` antes de recibir respuesta, entra al `catch` y vuelve a reintentar.
- `alertas.length: 3`  
  Al final, el cliente cree que creó una sola alerta (la del intento 3 que devolvió 201), pero en la base de datos quedaron 3 alertas duplicadas creadas.

---

## 4. Teoría que hay que llevarse aprendida (Preguntas y Respuestas)

### Pregunta 1: ¿Qué significa realmente un error de Timeout en el cliente HTTP?
* **Respuesta:**  
  Un Timeout **no** significa que la operación falló en el servidor; significa que **el cliente no sabe qué ocurrió**. Representa un estado de incertidumbre total: el servidor pudo haber recibido la petición y guardado los datos exitosamente, pero la respuesta de confirmación tardó más tiempo del que el cliente estaba dispuesto a esperar.

### Pregunta 2: ¿Cuáles son los tres escenarios físicamente indistinguibles para un cliente que sufre un Timeout?
* **Respuesta:**  
  1. **La petición no llegó:** La comunicación se cortó en la red antes de alcanzar el servidor (la operación no se ejecutó).
  2. **La petición llegó y falló:** El servidor recibió los datos, pero ocurrió un error antes de completar la operación.
  3. **La petición llegó y funcionó, pero se perdió la respuesta:** El servidor procesó y guardó los datos con éxito, pero la respuesta tardó o se perdió en el regreso.  
  *El cliente no tiene forma física de saber cuál de los tres escenarios ocurrió.*

### Pregunta 3: ¿Por qué reintentar a ciegas un método `POST` genera duplicación de datos?
* **Respuesta:**  
  Porque por especificación HTTP (RFC 9110), el método `POST` **no es idempotente**. Cada vez que el servidor recibe un `POST`, asume que se le está pidiendo crear un recurso nuevo o procesar una nueva transacción. Si ocurrió el escenario 3 (los datos ya se habían guardado), el reintento inserta un segundo registro duplicado en la base de datos.

---

## 5. Ejercicios "Para Probar Vos" Resueltos

### 1. ¿Se arregló o cambió el problema si primero esperamos y después guardamos?
* **Respuesta:** **Cambió el problema, no se arregló.**  
  Si el servidor espera primero y el proceso muere (se reinicia o cae el servidor) durante esa espera, la operación **nunca se guardó**, pero el cliente se quedó sin saberlo. Además, si el cliente da timeout antes de la espera y reintenta, cuando ambas peticiones terminen de esperar **se guardarán las dos igual**, duplicando el registro. Cambiar el orden de las líneas no evita la falta de idempotencia.

### 2. ¿Hay alguna forma de distinguir los tres finales de un timeout desde el cliente?
* **Respuesta:** **No, físicamente ninguna.**  
  A nivel de red, para el cliente un timeout es solo un cronómetro que llegó a cero sin recibir bytes de respuesta. El cliente no puede distinguir si el paquete se perdió en la ida, si explotó en el servidor, o si se guardó y se perdió en la vuelta. Por eso la única solución real es que el servidor implemente **idempotencia** (`Idempotency-Key`).
