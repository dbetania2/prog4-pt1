# 04-etag-if-match.js: Concurrencia Optimista con ETag e If-Match

Muestra la solución estándar de HTTP para el problema del *Lost Update* utilizando cabeceras condicionales.

---

## 1. El Identificador de Versión (ETag) (Líneas 12 a 15)

```javascript
let sensor = { id: "S-01", nombre: "Cámara fría", umbral: 8 };
let version = 1;
const etag = () => `"v${version}"`; // ETag fuerte: entre comillas y sin el W/ adelante
```

* `let version = 1;`  
  Contador de versión que se incrementa con cada modificación exitosa.
* `const etag = () => `"v${version}"`;`  
  Genera la cabecera `ETag` (Entity Tag). Debe ser un **ETag fuerte** (con comillas y sin el prefijo `W/`) para que el estándar permita usarlo en comparaciones de modificación (`If-Match`).

---

## 2. Lectura y Caché con `GET` (Líneas 19 a 23)

```javascript
app.get("/sensores/S-01", (req, res) => {
  res.set("ETag", etag());
  if (req.get("If-None-Match") === etag()) return res.status(304).end();
  res.json(sensor);
});
```

* `res.set("ETag", etag());`  
  Adjunta la versión actual del recurso en los encabezados de respuesta.
* `if (req.get("If-None-Match") === etag())`  
  El cliente envía la cabecera `If-None-Match` preguntando: *"¿El recurso sigue teniendo esta versión?"*.
* `return res.status(304).end();`  
  Si la versión no cambió, responde con código **`304 Not Modified`** y termina la petición sin enviar cuerpo, ahorrando ancho de banda y procesamiento.

---

## 3. Escritura Protegida con `PUT` (Líneas 25 a 34)

```javascript
app.put("/sensores/S-01", (req, res) => {
  const condicion = req.get("If-Match");
  if (!condicion) return res.status(428).json({ error: "mandá If-Match con el ETag que leíste" });
  if (condicion !== etag()) return res.status(412).json({ error: "cambió desde que lo leíste", vigente: etag() });

  sensor = { ...req.body, id: "S-01" };
  version++;
  res.set("ETag", etag()).json(sensor);
});
```

* `const condicion = req.get("If-Match");`  
  Lee la cabecera `If-Match`, donde el cliente declara qué versión leyó antes de editar.
* `if (!condicion) return res.status(428)...` $\rightarrow$ **`428 Precondition Required`:**  
  Si el cliente no envió la cabecera obligatoria, se rechaza la escritura.
* `if (condicion !== etag()) return res.status(412)...` $\rightarrow$ **`412 Precondition Failed`:**  
  Si el `ETag` enviado por el cliente es distinto al actual en el servidor (porque otro cliente modificó el recurso mientras tanto), se rechaza la petición. **No se sobrescribe nada y se evita el Lost Update.**
* `sensor = ...; version++;`  
  Si el `If-Match` coincide, se actualiza el recurso, se incrementa la versión para cambiar el `ETag` futuro, y se responde `200 OK` con el nuevo `ETag` en cabecera.



---

## 4. Teoría que hay que llevarse aprendida (Preguntas y Respuestas)

### Pregunta 1: ¿Cómo resuelve HTTP el problema de la concurrencia mediante "bloqueo optimista"?
* **Respuesta:**  
  No utiliza bloqueos (*locks*) en el servidor que congelen el sistema. En su lugar, el servidor entrega una etiqueta de versión (`ETag`) a cada cliente que consulta el recurso. Al momento de modificar (`PUT`), el cliente debe enviar la cabecera `If-Match` con el `ETag` que leyó. Si el recurso fue modificado por otro proceso mientras tanto, el `ETag` del servidor ya no coincidirá y la petición será abortada de forma segura.

### Pregunta 2: ¿Qué es un `ETag` fuerte y por qué no debe tener el prefijo `W/`?
* **Respuesta:**  
  Un `ETag` es un identificador de versión entre comillas (por ejemplo, `"v1"` o `""a1b2c3...""`). Se denomina **fuerte** (*strong*) cuando garantiza que el contenido byte a byte no ha cambiado en absoluto. Si lleva el prefijo `W/` (ej. `W/"v1"`), es un ETag **débil** (*weak*), que solo garantiza equivalencia semántica pero no exacta. Para operaciones de escritura con `If-Match`, el estándar RFC 9110 exige obligatoriamente un **ETag fuerte**.

### Pregunta 3: ¿Qué significan y cuándo se usan los códigos `428`, `412` y `304`?
* **Respuesta:**  
  * **`428 Precondition Required`:** El servidor exige una condición previa obligatoria para modificar el recurso y el cliente no envió la cabecera `If-Match`.
  * **`412 Precondition Failed`:** El cliente envió `If-Match`, pero la versión indicada ya no coincide con la versión actual del servidor (el recurso cambió; conflicto de concurrencia).
  * **`304 Not Modified`:** En una consulta `GET` con `If-None-Match`, indica que el cliente ya tiene la última versión en su caché local y el servidor no envía cuerpo de respuesta.

### Pregunta 4: ¿Cómo se implementa esta lógica en una base de datos real (ej. PostgreSQL)?
* **Respuesta:**  
  Se implementa en **una sola sentencia SQL atómica** utilizando el número de versión o el hash:  
  `UPDATE sensores SET umbral = $1, version = version + 1 WHERE id = $2 AND version = $3;`  
  Si la consulta afecta **0 filas**, significa que la versión cambió entre la lectura y la escritura, por lo que el backend responde inmediatamente con código **`412 Precondition Failed`**.
