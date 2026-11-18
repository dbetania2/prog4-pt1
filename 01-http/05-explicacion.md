# 05-problem-details.js: Formato Estándar de Errores (RFC 9457)

Enseña a estructurar las respuestas de error en un formato único y oficial (`application/problem+json`) y a prevenir la fuga de información confidencial en errores del servidor (`500`).

---

## 1. La Clase Base de Error (`Problema`) (Líneas 11 a 16)

```javascript
class Problema extends Error {
  constructor(status, tipo, titulo, detalle, extra = {}) {
    super(titulo);
    Object.assign(this, { status, tipo, titulo, detalle, extra });
  }
}
```

* Extiende la clase nativa `Error` de JavaScript para transportar atributos semánticos estandarizados:
  * `status`: Código numérico HTTP (ej. 400, 401, 404, 422).
  * `tipo`: Identificador corto o slug que clasifica el problema.
  * `titulo`: Descripción breve y fija del tipo de error.
  * `detalle`: Explicación humana puntual de qué falló en esta petición específica.
  * `extra`: Campos adicionales para depuración (por ejemplo, lista de errores de validación por campo).

---

## 2. Disparadores de Errores en Rutas (Líneas 21 a 49)

En lugar de responder manualmente con `res.status(...).json(...)` en cada ruta, las funciones simplemente lanzan excepciones (`throw new Problema(...)`):

* `401 Unauthorized` $\rightarrow$ Si falta el token: `"No sabemos quién sos"`.
* `403 Forbidden` $\rightarrow$ Si el token es válido pero no tiene rol admin: `"Sabemos quién sos y no podés"`.
* `404 Not Found` $\rightarrow$ Recurso inexistente.
* `409 Conflict` $\rightarrow$ Recurso duplicado (ej. sensor ya registrado).
* `422 Unprocessable Content` $\rightarrow$ Datos presentes pero con tipo inválido (ej. temperatura string en lugar de número).
* `500 Internal Error (Línea 46)`:  
  En `/bug`, se lanza un `Error` nativo crudo que contiene credenciales: `postgres://admin:secreto@db...`.

---

## 3. Middleware Centralizado de Manejo de Errores (Líneas 52 a 63)

```javascript
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
```

* **Único punto de salida para errores:** Express detecta que es un middleware de error porque tiene 4 parámetros `(err, req, res, next)`.
* `err.type === "entity.parse.failed"`: Atrapa errores de sintaxis si el cliente mandó un JSON roto (llaves sin cerrar) y lo convierte en un `400 Bad Request`.
* `!(p instanceof Problema)` $\rightarrow$ **Filtro de seguridad contra fuga de secretos (500):**  
  Si el error no fue creado explícitamente por nosotros (un bug imprevisto de base de datos), el mensaje real se imprime en el log interno (`console.log`) y **al cliente se le envía un título neutral sin filtrar contraseñas**.
* `res.type("application/problem+json")`: Setea la cabecera `Content-Type: application/problem+json` requerida por RFC 9457.



---

## 4. Teoría que hay que llevarse aprendida (Preguntas y Respuestas)

### Pregunta 1: ¿Qué es la especificación RFC 9457 (*Problem Details for HTTP APIs*) y qué resuelve?
* **Respuesta:**  
  Es el estándar oficial que define una estructura uniforme y predecible para informar errores en APIs HTTP. Elimina la mala práctica de que cada endpoint invente su propio formato (ej. `{ error: "..." }` o `{ message: "..." }`). Su tipo de contenido oficial es `Content-Type: application/problem+json`.

### Pregunta 2: ¿Cuáles son los miembros estándar de un objeto Problem Details?
* **Respuesta:**  
  * `type` (URI): Identificador único que categoriza el tipo de problema (ej. `https://api.ejemplo.edu/problemas/sin-permiso`).
  * `title`: Resumen corto y legible por humanos del tipo de error (no cambia entre ocurrencias).
  * `status`: Código de estado HTTP reflejado en el cuerpo JSON (ej. `404`, `422`).
  * `detail` (opcional): Explicación detallada y específica de qué falló en esta petición puntual.
  * `instance` (opcional): URI del recurso específico donde ocurrió el problema (ej. `/sensores/S-01`).

### Pregunta 3: ¿Por qué un error `500 Internal Server Error` jamás debe devolver el `err.message` original al cliente?
* **Respuesta:**  
  Por una vulnerabilidad crítica de seguridad (**Fuga de Información / CWE-209**). Los mensajes de excepciones no controladas frecuentemente contienen cadenas de conexión completas (con contraseñas de bases de datos), rutas internas de carpetas del servidor o nombres de tablas. El mensaje técnico debe imprimirse únicamente en los logs privados del servidor, mientras que al cliente se le envía un título genérico (ej. `"Error interno del servidor"`).

### Pregunta 4: ¿Cuál es la diferencia conceptual entre un código `400 Bad Request` y un `422 Unprocessable Content`?
* **Respuesta:**  
  * **`400 Bad Request`:** Error de sintaxis o formato a nivel de protocolo (el cliente mandó un JSON malformado con llaves sin cerrar, o faltan cabeceras obligatorias).
  * **`422 Unprocessable Content`:** El JSON tiene una sintaxis perfecta y se pudo parsear correctamente, pero los datos contenidos violan reglas semánticas del negocio (por ejemplo, mandar un string en un campo que debe ser un número positivo).
