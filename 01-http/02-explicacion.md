# 02-idempotency-key.js: La Solución con Idempotency-Key

Muestra cómo hacer que un `POST` sea seguro ante reintentos usando la cabecera `Idempotency-Key`.

---

## 1. Variables y Almacén de Operaciones (Líneas 9 a 15)

```javascript
const crypto = require("node:crypto");
const express = require("express");
const { levantar, pedir, esperar } = require("../comun/red");

const alertas = [];
const operaciones = new Map(); // clave -> { huella, estado, status, cuerpo }
```

- `const crypto = require("node:crypto");`  
  Módulo nativo de criptografía de Node.js para generar hashes (SHA-256) y UUIDs.
- `const alertas = [];`  
  Base de datos simulada de alertas.
- `const operaciones = new Map();`  
  **Libreta de memoria (caché de idempotencia):** Almacena cada clave procesada asociada a su huella digital, estado actual (`en-curso` o `listo`), código HTTP y respuesta guardada.

---

## 2. Middleware `idempotente` (Líneas 16 a 39)

```javascript
function idempotente(req, res, next) {
  const clave = req.get("Idempotency-Key");
  if (!clave) return res.status(400).json({ error: "falta Idempotency-Key" });

  const huella = crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
  const previa = operaciones.get(clave);
```

- `const clave = req.get("Idempotency-Key");`  
  Lee la cabecera enviada por el cliente.
- `if (!clave) return res.status(400)...`  
  Si la petición no incluye la cabecera, rechaza inmediatamente con `400 Bad Request`.
- `const huella = crypto.createHash("sha256")...`  
  Calcula un hash SHA-256 del cuerpo recibido (`req.body`). Sirve para saber si el cliente reintentó exactamente el mismo contenido o si cambió los datos.
- `const previa = operaciones.get(clave);`  
  Busca si esa clave ya fue registrada anteriormente.

### Casos cuando la clave ya existe (`if (previa)`):

```javascript
if (previa) {
  if (previa.huella !== huella)
    return res
      .status(422)
      .json({ error: "esa clave ya se usó con otro cuerpo" });
  if (previa.estado === "en-curso")
    return res.status(409).json({ error: "esa operación se está procesando" });
  return res
    .status(previa.status)
    .set("Idempotent-Replayed", "true")
    .json(previa.cuerpo);
}
```

- `previa.huella !== huella` $\rightarrow$ **`422 Unprocessable Content`:**  
  El cliente mandó la misma clave pero con un cuerpo diferente (conflicto de semántica).
- `previa.estado === "en-curso"` $\rightarrow$ **`409 Conflict`:**  
  El primer intento todavía está ejecutándose en el servidor y llegó un reintento antes de terminar.
- `return res.status(previa.status)...` $\rightarrow$ **Replay exitoso (`201` en caché):**  
  Corta la ejecución con `return` y devuelve la respuesta original guardada con la cabecera `Idempotent-Replayed: true`. **No llama a `next()` y no crea alertas duplicadas.**

### Registro cuando la clave es nueva:

```javascript
  const registro = { huella, estado: "en-curso" };
  operaciones.set(clave, registro);

  const json = res.json.bind(res);
  res.json = (cuerpo) => {
    Object.assign(registro, { estado: "listo", status: res.statusCode, cuerpo });
    return json(cuerpo);
  };
  next();
}
```

- `operaciones.set(clave, registro);`  
  Registra la operación en estado `en-curso`.
- `res.json = (cuerpo) => { ... }`  
  Sobrescribe temporalmente el método `res.json` para interceptar la respuesta final del endpoint, guardarla en el registro con estado `listo` y enviarla al cliente.
- `next();`  
  Pasa el control a la ruta `app.post("/alertas", ...)` para que procese la creación.

---

## 3. Teoría que hay que llevarse aprendida (Preguntas y Respuestas)

### Pregunta 1: ¿Cómo se soluciona la duplicación en `POST` sin cambiar el protocolo HTTP?
* **Respuesta:**  
  Implementando el patrón de la cabecera **`Idempotency-Key`**. El cliente genera un identificador único (UUID) **por operación de negocio** (no por intento de red) y lo envía en el encabezado de la petición, repitiendo exactamente la misma clave en cada reintento.

### Pregunta 2: ¿Cómo actúa el middleware de idempotencia en el servidor ante los distintos casos?
* **Respuesta:**  
  * **Si la clave es nueva:** Registra la clave en memoria como `"en-curso"`, deja pasar la petición al controlador con `next()`, intercepta la respuesta al terminar y la guarda como `"listo"`.
  * **Si la clave ya existe y el cuerpo es idéntico:** **No llama a `next()`**. Corta la ejecución inmediatamente y devuelve la respuesta que tenía guardada en caché con código **`201 Created`** y la cabecera `Idempotent-Replayed: true`.
  * **Si la clave ya existe pero el cuerpo es diferente:** Responde con código **`422 Unprocessable Content`** (conflicto de semántica: se intentó usar la misma clave para dos cosas distintas).
  * **Si la clave ya existe pero sigue en estado `"en-curso"`:** Responde con código **`409 Conflict`** (la operación anterior todavía se está procesando).
  * **Si la petición no incluye la cabecera:** Responde con código **`400 Bad Request`** (falta cabecera obligatoria).

### Pregunta 3: ¿Para qué se calcula un hash (SHA-256) del cuerpo (`req.body`) en el middleware?
* **Respuesta:**  
  Para generar una **huella digital** del contenido enviado. Esto permite comparar matemáticamente si un reintento trae exactamente los mismos datos originales o si el cliente está intentando reutilizar fraudulentamente o por error la misma clave para enviar otra información diferente.

### Pregunta 4 (Pregunta típica de defensa/examen): ¿Por qué este código con `new Map()` no escala a producción si tenemos múltiples instancias de la API?
* **Respuesta:**  
  Porque `new Map()` vive en la memoria RAM de un solo proceso de Node.js. Si ponemos dos o más servidores detrás de un balanceador de carga, el intento 1 puede caer en el Servidor A y el intento 2 en el Servidor B (que tiene su memoria vacía). En producción, la tabla de idempotencia debe residir en un almacenamiento compartido como **PostgreSQL o Redis**, con una restricción de clave única (**`UNIQUE`**) sobre la columna de la clave de idempotencia.

---

## 4. Ejercicios "Para Probar Vos" Resueltos

### 1. ¿Qué recibe el cliente si sacás la comparación de huellas y mandás otro cuerpo? ¿Por qué es peor que un error?
* **Qué recibe:** Recibe un `201 Created` con los datos de la **primera alerta**, ignorando por completo el nuevo cuerpo que mandó.
* **Por qué es peor que un error:** Porque es una **mentira silenciosa** (falso positivo). El cliente cree que guardó su nueva alerta (por ejemplo: *"Sensor S-99 a 80°C"*), pero en el servidor sigue guardada la vieja (*"Sensor S-01 a 12.5°C"*). Un error `422` te avisa que algo falló; una respuesta falsa de éxito te corrompe el sistema sin que nadie se dé cuenta.

### 2. Si el handler explota después de guardar, ¿qué hacés con el registro "en-curso"? ¿Qué le pasa a los reintentos si queda así?
* **Qué le pasa si queda así:** Si queda trabado en `"en-curso"`, **todos los reintentos futuros serán rechazados con `409 Conflict` para siempre**, dejando la operación bloqueada eternamente.
* **Qué tenés que hacer:** Envolver el handler en un bloque `try/catch`. Si explota, en el `catch` debes **eliminar la clave** (`operaciones.delete(clave)`) o marcarla como fallida para permitir que un nuevo reintento pueda ejecutarse.

### 3. ¿Cuánto tiempo guardás las claves? (Stripe las borra a las 24 hs). ¿Qué gana y qué arriesga?
* **Qué gana:** Gana **espacio en memoria/disco**. No almacena millones de claves viejas de hace meses o años que ya no sirven.
* **Qué arriesga:** Arriesga que si un cliente extremadamente lento o un proceso descolgado reintenta la petición después de 24 horas, el servidor ya no recordará la clave y **volverá a procesar la operación como si fuera nueva**, provocando un cobro o alerta duplicada.
