Aquí tienes la explicación directa y literal de cada defecto, sin analogías: qué falla en el código, cómo lo razona el estudiante y la serie exacta de pasos para arreglarlo.

---

### Defecto 1: Validación del JWT y origen del usuario

#### 1. Qué ve el estudiante

- En `api.js`, la función `autenticar` usa `abrir(token)`. Esa función solo convierte el texto del token a JSON; no comprueba si la firma es real ni si los datos fueron alterados.
- En `POST /alertas`, el código hace:
  ```javascript
  const alerta = { id: alertas.length + 1, creadaPor: req.uid, ...req.body };
  ```
  Si el cliente envía en el cuerpo `{ "creadaPor": "otro_usuario" }`, sobreescribe el valor de `req.uid`.
- En la consola, fallan las pruebas de token vencido, token sin firma (`alg: none`), token de otro proyecto y suplantación de usuario.

#### 2. Qué comprende el estudiante

- Debe validar criptográficamente el token antes de aceptar cualquier petición.
- Debe verificar cuatro condiciones obligatorias del token:
  1. Que el algoritmo sea `RS256` y no `none`.
  2. Que la firma matemática sea válida usando la clave pública del servidor de autenticación.
  3. Que la fecha actual no haya superado el tiempo de expiración (`exp`).
  4. Que el campo de audiencia (`aud`) coincida con el nombre de este proyecto (`telemetria-utn`).
- En la creación de la alerta, el campo `creadaPor` debe asignarse siempre desde el token verificado y nunca permitir que el cuerpo de la petición lo reemplace.

#### 3. Pasos para solucionarlo

1. En `autenticar`:
   - Leer la cabecera `Authorization`. Si no existe o no empieza con `Bearer `, responder con código `401`.
   - Separar el token y leer su cabecera (`header`) y su contenido (`payload`).
   - Si `header.alg` no es `"RS256"`, responder `401`.
   - Obtener la clave pública correspondiente a `header.kid` desde `clavesPublicas`. Si no existe, responder `401`.
   - Verificar la firma con `firmaRS256Valida(token, clavePublica)`. Si es falsa, responder `401`.
   - Comprobar si `payload.exp <= ahora()`. Si expiró, responder `401`.
   - Comprobar si `payload.aud !== proyecto`. Si no coincide, responder `401`.
   - Si todo es válido, guardar el identificador del usuario: `req.uid = payload.sub` y llamar a `next()`.
2. En `POST /alertas`:
   - Construir el objeto colocando la propiedad `creadaPor: req.uid` al final del objeto o pisando explícitamente cualquier valor previo:
     ```javascript
     const alerta = { id: alertas.length + 1, ...req.body, creadaPor: req.uid };
     ```

---

### Defecto 2: Falta de Idempotencia en `POST /alertas`

#### 1. Qué ve el estudiante

- Cuando un cliente envía dos peticiones `POST` seguidas con los mismos datos porque se cortó la conexión, el servidor inserta dos alertas distintas con IDs diferentes.
- La prueba exige que si el cliente envía una cabecera `Idempotency-Key`, reintentar la petición no cree una segunda alerta y devuelva exactamente la respuesta guardada de la primera vez.
- Si el cliente reutiliza esa misma clave pero con un cuerpo diferente, debe responder con código `422`. Si no envía la clave, debe responder con código `400`.

#### 2. Qué comprende el estudiante

- El servidor necesita una memoria temporal (`Map`) para recordar las peticiones que ya procesó.
- La clave de búsqueda en esa memoria será el valor de la cabecera `Idempotency-Key`.
- Si llega una clave repetida con el mismo cuerpo, no se ejecuta la lógica de creación: se retorna la respuesta ya almacenada.
- Si la clave coincide pero el cuerpo cambió, hay una inconsistencia y se debe rechazar.

#### 3. Pasos para solucionarlo

1. Crear una estructura en memoria dentro de `crearApp`:
   ```javascript
   const operacionesIdempotentes = new Map();
   ```
2. En la ruta `POST /alertas`:
   - Leer `req.get("Idempotency-Key")`. Si no está presente, responder `400`.
   - Comprobar si esa clave ya existe en `operacionesIdempotentes`:
     - Si existe:
       - Comparar el cuerpo guardado con el actual (usando `JSON.stringify`).
       - Si los cuerpos son distintos, responder con estado `422`.
       - Si son iguales, devolver el estado `201` y el JSON que se guardó previamente, sin modificar el array `alertas`.
     - Si no existe:
       - Crear la alerta y agregarla a `alertas`.
       - Guardar en `operacionesIdempotentes` la clave con: `{ cuerpo: req.body, respuesta: alerta }`.
       - Responder con estado `201` y la nueva alerta.

---

### Defecto 3: Modificación concurrente sin control de versión (`Lost Update`)

#### 1. Qué ve el estudiante

- En `PUT /sensores/:id`, cualquier cliente sobreescribe los datos del sensor sin importar si otro cliente modificó ese mismo sensor un instante antes.
- La prueba exige:
  - Que `GET /sensores/:id` devuelva una cabecera `ETag` (un identificador de la versión actual del sensor).
  - Que si el cliente envía `If-None-Match` con el `ETag` actual, responda `304 Not Modified`.
  - Que `PUT /sensores/:id` obligue a enviar la cabecera `If-Match`. Si no viene, responder `428`.
  - Si el valor de `If-Match` no coincide con el `ETag` del sensor actual en el servidor, responder `412` y no modificar los datos.

#### 2. Qué comprende el estudiante

- El servidor debe calcular una etiqueta de versión (`ETag`) para cada sensor a partir de su contenido actual (por ejemplo, con un hash MD5 o SHA-1 en formato de texto entre comillas).
- En lecturas, si el cliente ya tiene esa versión exacta, se ahorra tráfico con `304`.
- En escrituras, el cliente debe demostrar qué versión leyó antes de editar. Si su versión quedó vieja porque otro cliente guardó antes, la modificación se rechaza con `412 Precondition Failed`.

#### 3. Pasos para solucionarlo

1. Crear una función para calcular el identificador de versión:
   ```javascript
   function generarETag(objeto) {
     const hash = crypto
       .createHash("sha1")
       .update(JSON.stringify(objeto))
       .digest("hex");
     return `"${hash}"`;
   }
   ```
2. En `GET /sensores/:id`:
   - Obtener el sensor. Si no existe, responder `404`.
   - Calcular su `etag = generarETag(sensor)`.
   - Si `req.get("If-None-Match") === etag`, responder con estado `304` y terminar la petición sin cuerpo.
   - Si no, establecer la cabecera `res.setHeader("ETag", etag)` y enviar el sensor en JSON.
3. En `PUT /sensores/:id`:
   - Obtener el sensor actual. Si no existe, responder `404`.
   - Comprobar la cabecera `If-Match`: si falta, responder con código `428`.
   - Calcular el `etag` del sensor que está guardado actualmente en el servidor.
   - Si `req.get("If-Match") !== etag`, responder con código `412` y no modificar nada.
   - Si coincide: actualizar el sensor, calcular el nuevo `ETag`, colocarlo en la cabecera de respuesta y devolver el sensor actualizado con código `200`.

---

### Defecto 4: Formato de errores no estandarizado y fuga de información interna

#### 1. Qué ve el estudiante

- La ruta `GET /roto` lanza una excepción que contiene la cadena `"conexión a postgres://admin:secreto@db falló"`.
- El manejador de errores actual responde `{ error: err.message }`, enviando la URL con la contraseña de la base de datos directo al cliente.
- Las pruebas requieren que todos los errores utilicen el tipo de contenido `application/problem+json` (RFC 9457), contengan los campos `type`, `title`, `status`, y que un error `500` no contenga datos sensibles ni credenciales.
- Además, si el cliente manda un JSON mal formado (error de parseo), debe capturarse y responderse como un `400` en este mismo formato.

#### 2. Qué comprende el estudiante

- Las respuestas de error deben tener un esquema fijo y predecible: cabecera `Content-Type: application/problem+json` y un objeto JSON con `type`, `title` y `status`.
- Ante excepciones no controladas en el servidor (errores `500`), el mensaje real del error solo debe quedar en los registros internos del servidor. Al cliente solo se le debe enviar un título genérico como `"Error interno del servidor"`.

#### 3. Pasos para solucionarlo

1. Escribir una función auxiliar para emitir errores:
   ```javascript
   function enviarError(res, status, title, type = "about:blank") {
     res
       .status(status)
       .setHeader("Content-Type", "application/problem+json")
       .json({ type, title, status });
   }
   ```
2. Reemplazar todas las respuestas de error manuales (`400`, `401`, `404`, `412`, `422`, `428`) en las rutas existentes para que utilicen este formato.
3. Modificar el middleware de captura de errores al final de la aplicación:
   ```javascript
   app.use((err, req, res, next) => {
     // Si Express falló al parsear un JSON inválido en el body
     if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
       return enviarError(res, 400, "JSON inválido");
     }
     const status = err.status ?? 500;
     const title = status === 500 ? "Error interno del servidor" : err.message;
     enviarError(res, status, title);
   });
   ```

---

### Defecto 5: Paginación por desplazamiento (`Offset`) en lugar de Cursor

#### 1. Qué ve el estudiante

- `GET /alertas` usa `.slice((pagina - 1) * limite, pagina * limite)`.
- La prueba inserta 7 alertas, pide las primeras 3, luego inserta una alerta nueva en el sistema y finalmente pide la siguiente página.
- Con el método actual de desplazamiento (`offset`/página), al insertarse un elemento nuevo, todos los índices se corren: un elemento que ya se vio en la primera página vuelve a aparecer en la segunda página.
- La prueba exige que la respuesta no repita ni omita registros y que devuelva una propiedad llamada `siguiente` con el cursor para la próxima consulta.

#### 2. Qué comprende el estudiante

- No debe paginar contando posiciones numéricas relativas (`página 1`, `página 2`).
- Debe usar paginación basada en claves (cursor): el cliente solicita los elementos cuyo `id` sea menor al último `id` que ya recibió.
- De este modo, aunque se sigan insertando registros nuevos con IDs más altos, la posición de lectura del cliente se mantiene fija respecto al último elemento procesado.

#### 3. Pasos para solucionarlo

1. En `GET /alertas`:
   - Leer los parámetros de la URL: `limite = Number(req.query.limite ?? 10)` y `cursor = req.query.cursor ? Number(req.query.cursor) : null`.
   - Tomar la lista de alertas y ordenarla de mayor a menor por `id`:
     ```javascript
     let items = [...alertas].sort((a, b) => b.id - a.id);
     ```
   - Si se especificó un `cursor`, filtrar para conservar únicamente las alertas cuyo `id` sea estrictamente menor al cursor:
     ```javascript
     if (cursor !== null) {
       items = items.filter((a) => a.id < cursor);
     }
     ```
   - Cortar el lote con el tamaño solicitado:
     ```javascript
     const resultado = items.slice(0, limite);
     ```
   - Determinar el valor de `siguiente`: si quedaron más elementos por leer después del corte, tomar el `id` del último elemento devuelto y convertirlo a string.
   - Responder el objeto: `{ items: resultado, siguiente }`.

---

### Defecto 6: Reutilización indefinida de Refresh Tokens y falta de detección de reuso

#### 1. Qué ve el estudiante

- En `POST /refresh`, el servidor busca el token en un `Map` y devuelve exactamente el mismo token recibido sin modificarlo ni rotarlo:
  ```javascript
  res.json({ refresh: req.body.token, uid });
  ```
- Las pruebas exigen dos comportamientos:
  1. **Rotación:** Al usar un refresh token, el servidor debe invalidarlo y entregar uno nuevo y distinto.
  2. **Detección de reuso:** Si un cliente intenta utilizar un refresh token que ya fue utilizado con anterioridad, el servidor debe responder `401` y además revocar toda la cadena/familia de tokens asociados a esa sesión (el token nuevo que se había emitido también debe quedar invalidado).

#### 2. Qué comprende el estudiante

- Un refresh token debe funcionar una sola vez.
- No basta con borrar el token usado del mapa, porque si se borra, no se puede distinguir entre un token inventado y un token que fue robado y reutilizado.
- Debe almacenar para cada token: a qué usuario pertenece, a qué grupo/familia de sesión corresponde y un indicador booleano de si ya fue consumido (`usado: true/false`).
- Si entra una petición con un token que tiene `usado === true`, se detecta un reuso indebido: se deben borrar todos los tokens pertenecientes a esa misma familia para forzar el cierre de sesión completo.

#### 3. Pasos para solucionarlo

1. Definir la estructura de datos para los tokens:
   Cada elemento guardado en `refreshes` tendrá la forma:
   ```javascript
   { uid, familiaId, usado: false }
   ```
2. En `app.locals.iniciarSesion(uid)`:
   - Generar un `token` aleatorio y un identificador único de familia: `const familiaId = crypto.randomUUID();`.
   - Guardar en el mapa: `refreshes.set(token, { uid, familiaId, usado: false });`.
   - Devolver el `token`.
3. En `POST /refresh`:
   - Leer `req.body.token`.
   - Buscar el registro en `refreshes`. Si no existe, responder `401`.
   - **Si existe y `registro.usado === true` (detección de reuso):**
     - Recorrer el mapa `refreshes` y eliminar todos los tokens cuyo `familiaId` coincida con `registro.familiaId`.
     - Responder con código `401`.
   - **Si existe y `registro.usado === false` (uso legítimo):**
     - Marcar el token actual como usado: `registro.usado = true;`.
     - Generar un nuevo token aleatorio:
       ```javascript
       const nuevoToken = crypto.randomBytes(32).toString("base64url");
       ```
     - Guardar el nuevo token con la misma familia y usuario:
       ```javascript
       refreshes.set(nuevoToken, {
         uid: registro.uid,
         familiaId: registro.familiaId,
         usado: false,
       });
       ```
     - Responder con código `200` y el cuerpo: `{ refresh: nuevoToken, uid: registro.uid }`.
