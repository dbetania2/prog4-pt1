Analyzed api.js:L1-74
Ran list files in workspace
Ran list laboratorio files
Analyzed CONSIGNA.md:L1-29
Analyzed jwt.js:L1-42
Analyzed pruebas.test.js:L1-100
Analyzed pruebas.test.js:L100-146
Ran list lessons directories

Para entender cómo razona un estudiante enfrentando este laboratorio, hay que situarse en su mente: acaba de salir de una clase densa sobre seguridad, protocolo HTTP y JWT. Abre `laboratorio/api.js`, ejecuta `npm run lab` y la consola explota en color rojo con decenas de tests rotos.

A continuación se narra el viaje mental, paso a paso, por cada uno de los 6 defectos: qué ve primero, qué conceptos teóricos rescata de su memoria, el momento de asimilación (_el "clic" mental_) y cómo construye la solución.

---

### Defecto 1: Identidad y Autenticación

> _`// DEFECTO 1: abre el token y le cree. No verifica nada.`_

#### 1. Qué ve primero

El estudiante mira la función `autenticar`:

```javascript
const token = (req.get("Authorization") ?? "").replace("Bearer ", "");
req.uid = abrir(token).payload.sub;
```

Y luego mira el test en `pruebas.test.js`: fallan `token para otro proyecto: 401`, `token vencido: 401`, `alg none: 401` y `el usuario sale del token, no del body`.
Su primera impresión es: _"Pero si extraigo el token y saco el `sub`, ¿por qué no alcanza? Ah... estoy llamando a `abrir()`, no a una función de verificación"_.

#### 2. Qué recuerda de la clase

- Recuerda la función `abrir` en `comun/jwt.js`: es solo un decodificador base64url. Cualquiera puede inventar un JSON en su navegador, no firmarlo y mandarlo.
- Recuerda la lección de los ataques a JWT (`03-jwt`):
  - **Ataque `alg: none`**: el cliente le dice al servidor "no tengo firma" y el servidor ingenuo confía.
  - **Algorithm confusion** y **RS256**: el servidor debe verificar criptográficamente la firma con la clave pública del Identity Provider (`clavesPublicas`).
  - **Los Claims estándar**: `exp` (vencimiento), `aud` (¿el token es para mi API o para otra?), `iss` (¿quién lo emitió?).
- Recuerda el bug sutil de asignación de objetos en JavaScript:
  ```javascript
  const alerta = { id: alertas.length + 1, creadaPor: req.uid, ...req.body };
  ```
  Si el cliente manda `{ "creadaPor": "admin" }` en el cuerpo, el spread operator `...req.body` sobreescribe `req.uid`.

#### 3. La asimilación (_El "clic"_)

> _"Tener un JWT no es estar autenticado; cualquiera puede escribir un JWT en un bloc de notas. Autenticar no es parsear: es desconfiar de todo hasta validar matemáticamente la firma, verificar que no haya expirado y confirmar que la audiencia (`aud`) sea exactamente mi proyecto (`telemetria-utn`). Y en el endpoint, la identidad la manda el token, el cliente no puede spoofearla metiendo su propio `creadaPor` en el JSON."_

#### 4. Pasos y resolución que realiza

1. Importa `firmaRS256Valida` y `ahora` desde `../comun/jwt`.
2. En `autenticar`:
   - Verifica que haya un header `Authorization` válido con formato `Bearer ...`.
   - Abre el token para inspeccionar `header` y `payload`.
   - Si `header.alg === "none"` o es distinto a `"RS256"`, rechaza con 401.
   - Busca la clave pública correspondiente (`clavesPublicas[header.kid]`). Si no existe o `firmaRS256Valida(...)` da falso, 401.
   - Valida tiempos: si `payload.exp <= ahora()`, 401 (vencido).
   - Valida audiencia: si `payload.aud !== proyecto`, 401.
3. Corrige la creación de la alerta:
   - Coloca `creadaPor: req.uid` **después** del `...req.body` (o lo asigna explícitamente sin permitir sobreescritura).

---

### Defecto 2: Idempotencia en POST

> _`// DEFECTO 2: cada reintento crea otra alerta.`_

#### 1. Qué ve primero

El test falla en:

- `sin clave: 400`
- `mismo reintento: una sola alerta, misma respuesta`
- `misma clave, otro cuerpo: 422`

En `api.js` ve que cada `POST /alertas` hace ciegamente un `alertas.push(alerta)`. Si la red parpadea y el cliente reintenta, se duplican registros.

#### 2. Qué recuerda de la clase

- La cabecera `Idempotency-Key` (IETF draft / patrón Stripe).
- Los reintentos de red automáticos en clientes HTTP cuando hay un timeout o corte de conexión.
- Un `POST` por definición no es idempotente en la especificación HTTP base, pero en APIs transaccionales necesitamos convertirlo en una operación a salvo de reintentos.
- Si el cliente manda la misma clave con el **mismo payload**, no debe ejecutar el trabajo de nuevo: debe responder exactamente lo mismo que respondió la primera vez (el mismo status y el mismo JSON).
- Si el cliente manda la misma clave pero con un payload **distinto**, es un error de conflicto de intención (código HTTP `422 Unprocessable Content`).

#### 3. La asimilación (_El "clic"_)

> _"La idempotencia no es magia de la base de datos, es un caché de intenciones. Necesito un almacenamiento en memoria (`Map`) indexado por la clave de idempotencia donde guarde no solo la respuesta, sino también el hash o el contenido del cuerpo original para detectar si me están reutilizando la clave para otra cosa."_

#### 4. Pasos y resolución que realiza

1. Crea un almacén en el ámbito de la app: `const idempotencia = new Map();`
2. En `POST /alertas`:
   - Extrae `req.get("Idempotency-Key")`. Si no viene, responde `400` (_"Idempotency-Key requerida"_).
   - Verifica si la clave ya existe en el `Map`:
     - Si existe, compara el cuerpo recibido con el cuerpo guardado (usando `JSON.stringify` o hash).
     - Si los cuerpos son distintos: corta con `422`.
     - Si son idénticos: devuelve el status (201) y la respuesta guardada previamente, **sin tocar el array de alertas**.
   - Si no existe: crea la alerta, la inserta en `alertas`, guarda en el `Map` `{ cuerpo: req.body, respuesta: alerta, status: 201 }`, y devuelve el 201.

---

### Defecto 3: Concurrencia y Lost Update (GET y PUT de Sensores)

> _`// DEFECTO 3: el último que escribe pisa al otro.`_

#### 1. Qué ve primero

El código actual:

```javascript
app.put("/sensores/:id", autenticar, (req, res) => {
  const sensor = { ...req.body, id: req.params.id };
  sensores.set(req.params.id, sensor);
  res.json(sensor);
});
```

Los tests exigen:

- `GET manda un ETag fuerte`
- `If-None-Match vigente: 304`
- `PUT sin If-Match: 428`
- `segundo PUT con ETag viejo: 412 y no pisa`

#### 2. Qué recuerda de la clase

- El clásico problema del **Lost Update**: Dos operadores abren la misma cámara fría a 8°C. Uno la cambia a 4°C y guarda. El otro, que tenía la pantalla abierta con 8°C, le cambia el nombre a "Cámara Principal" y al guardar pisa los 4°C del primero volviéndolo a 8°C sin saberlo.
- HTTP ya resolvió esto en los años 90 con **bloqueo optimista condicional**:
  - `ETag`: huella digital o hash del recurso. Un ETag fuerte no lleva el prefijo `W/` y va entre comillas: `"a1b2c3..."`.
  - `If-None-Match`: el cliente pregunta _"¿cambió algo desde que tengo este ETag?"_. Si no cambió, el servidor no gasta ancho de banda y manda `304 Not Modified`.
  - `If-Match`: para escribir (`PUT`), el cliente dice _"sólo aplica esto si el recurso sigue teniendo exactamente esta versión"_.
  - Códigos de estado HTTP semánticos:
    - `428 Precondition Required`: Si el cliente no mandó la cabecera condicional obligatoria.
    - `412 Precondition Failed`: Si el ETag no coincide con el estado actual del recurso en el servidor.

#### 3. La asimilación (_El "clic"_)

> _"No necesito locks ni mutexes en memoria. El servidor le da una firma o hash del estado al cliente. Si el cliente quiere modificarlo, tiene que probar que leyó la última versión pasándome esa misma firma. Si otro cliente modificó el sensor un milisegundo antes, el hash cambió y el segundo cliente es rechazado con 412."_

#### 4. Pasos y resolución que realiza

1. Escribe una función auxiliar `calcularETag(sensor)`:
   - Calcula un hash SHA-256 o MD5 de `JSON.stringify(sensor)` y devuelve `"${hash}"`.
2. En `GET /sensores/:id`:
   - Calcula el `etag`.
   - Revisa si viene `req.get("If-None-Match") === etag`. Si coincide, responde `res.status(304).end()`.
   - Si no, setea `res.setHeader("ETag", etag)` y devuelve el JSON del sensor.
3. En `PUT /sensores/:id`:
   - Revisa el header `If-Match`: si no existe, devuelve `428`.
   - Obtiene el sensor actual y calcula su ETag. Si el `If-Match` recibido difiere del ETag actual, responde `412`.
   - Si coincide: actualiza el sensor, calcula el nuevo ETag, setea el header `ETag` y responde 200.

---

### Defecto 4: Manejo de Errores y RFC 9457

> _`// DEFECTO 4: los errores no siguen RFC 9457 y filtran datos internos.`_

#### 1. Qué ve primero

En `api.js`:

```javascript
app.get("/roto", () => {
  throw new Error("conexión a postgres://admin:secreto@db falló");
});
app.use((err, req, res, next) =>
  res.status(err.status ?? 500).json({ error: err.message }),
);
```

Y los tests piden:

- `Content-Type: application/problem+json`
- Campos estándar: `type`, `title`, `status`
- En error 500: que no filtre datos sensibles (_"postgres"_, _"secreto"_).
- Que los errores de parseo JSON (`SyntaxError` de express.json()) salgan también como Problem Details 400.

#### 2. Qué recuerda de la clase

- **RFC 9457** (reemplazo de RFC 7807): especificación estándar para reportar errores en HTTP.
- En vez de devolver estructuras arbitrarias (`{ error: "..." }` o `{ message: "..." }`), se estandariza el formato con `type` (URI), `title` (resumen corto y humano), y `status` (código HTTP).
- **Seguridad (CWE-209 - Information Exposure)**: un error 500 jamás debe mandar el `err.message` o el stack trace crudo al cliente en producción, porque filtra credenciales de base de datos, rutas internas del servidor o nombres de tablas.

#### 3. La asimilación (_El "clic"_)

> _"Cada error de la API (400, 401, 404, 412, 422, 500) tiene que hablar el mismo dialecto: `application/problem+json`. Y si el servidor se rompe con un 500, el cliente solo debe recibir 'Error interno del servidor'; el string con la password de la base de datos se loguea en la consola del servidor, nunca en el payload HTTP."_

#### 4. Pasos y resolución que realiza

1. Crea un helper `responderProblema(res, status, title, detail, type)`:
   - Setea `res.setHeader("Content-Type", "application/problem+json")`.
   - Envía `{ type: type ?? `https://httpstatuses.com/${status}`, title, status, ...(detail ? { detail } : {}) }`.
2. Actualiza los `res.status(401)`, `res.status(404)`, etc., de los endpoints para usar este formato.
3. En el middleware global de error `app.use((err, req, res, next) => ...)`:
   - Si es un error de sintaxis JSON (`err instanceof SyntaxError && err.status === 400`), responde 400 con `problem+json`.
   - Si es un error 500:
     - Oculta el mensaje real y devuelve `title: "Error interno del servidor"` con `status: 500`.

---

### Defecto 5: Paginación (Offset vs Cursor)

> _`// DEFECTO 5: paginación por offset.`_

#### 1. Qué ve primero

El endpoint actual hace:

```javascript
const items = [...alertas]
  .sort((a, b) => b.id - a.id)
  .slice((pagina - 1) * limite, pagina * limite);
```

El test `no repite ni saltea con una inserción entre páginas`:

- Inserta 7 alertas. Pide límite 3.
- Antes de pedir la página 2, **inserta una nueva alerta**.
- El test falla porque con `offset` / `pagina`, la nueva inserción desplaza todos los índices, haciendo que un elemento de la página 1 aparezca de nuevo en la página 2 o que un elemento se saltee.
- Además, el test exige que la respuesta devuelva un puntero `siguiente`.

#### 2. Qué recuerda de la clase

- **El problema de la paginación por Offset**:
  - Si tengo los IDs `[10, 9, 8, 7, 6, 5]`. Página 1 (límite 3) devuelve `[10, 9, 8]`.
  - Alguien inserta `11`. Ahora la lista es `[11, 10, 9, 8, 7, 6, 5]`.
  - La página 2 (offset 3) toma los índices 3, 4 y 5: `[8, 7, 6]`.
  - ¡El elemento `8` se duplicó para el usuario!
- **Paginación por Cursor (Keyset Pagination)**:
  - En vez de decir "dame los siguientes 3 saltándote $N$", el cliente dice: _"dame los 3 que vengan después del ID que acabo de ver"_.
  - Como el orden es descendente (`b.id - a.id`), "después de X" significa `id < cursor`.
  - No importa cuántas alertas se agreguen al principio: el cursor es un ancla fija en el flujo temporal.

#### 3. La asimilación (_El "clic"_)

> _"Offset le dice a la base de datos 'contá y descartá', lo cual es frágil si los datos cambian en tiempo real. Un cursor es un marcador de libro: 'la última que leí fue la alerta 8; la próxima página arranca estrictamente en las que tienen ID menor a 8'. Y el token `siguiente` que le devuelvo al cliente es simplemente el ID del último elemento de la página."_

#### 4. Pasos y resolución que realiza

1. En `GET /alertas`:
   - Lee `const limite = Number(req.query.limite ?? 10);`
   - Lee `const cursor = req.query.cursor ? Number(req.query.cursor) : null;`
   - Ordena las alertas de forma descendente por `id`.
   - Filtra: si viene `cursor`, solo toma las alertas con `alerta.id < cursor`.
   - Toma las primeras `limite` alertas con `.slice(0, limite)`.
   - Si hay más alertas disponibles detrás de la última devuelta, genera el cursor `siguiente: String(ultimoItem.id)`. Si no hay más, `siguiente: null` o lo omite.
   - Responde `{ items, siguiente }`.

---

### Defecto 6: Sesiones y Refresh Tokens (Rotación y Detección de Reuso)

> _`// DEFECTO 6: el refresh se puede usar para siempre.`_

#### 1. Qué ve primero

El endpoint original:

```javascript
app.post("/refresh", (req, res) => {
  const uid = refreshes.get(req.body.token);
  if (!uid) return res.status(401).json({ error: "refresh inválido" });
  res.json({ refresh: req.body.token, uid });
});
```

El test exige:

- `rota: devuelve un token distinto`: usar un refresh token debe dar uno nuevo e invalidar el anterior.
- `reuso: 401 y se revoca toda la familia`: si alguien vuelve a mandar un refresh token que ya fue consumido, debe dar 401 **y revocar inmediatamente el nuevo token también**.

#### 2. Qué recuerda de la clase

- Los tokens de acceso (JWT) viven poco tiempo (ej. 15 minutos). Los refresh tokens viven días o semanas.
- **Refresh Token Rotation (RTR)**: cada vez que el refresh token se usa para pedir un nuevo access token, el refresh token se destruye y se emite uno nuevo.
- **Detección de robo / Reuso de token**:
  - Si un atacante interceptó un refresh token y la víctima legítima lo usó primero, el atacante intentará usar un token ya invalidado.
  - O al revés: el atacante lo usa primero y cuando la víctima legítima intenta refrescar, su token ya aparece como "usado".
  - La única forma segura de reaccionar ante el reuso de un token ya consumido es asumir **compromiso de seguridad** y destruir la sesión completa (revocar toda la "familia" de tokens del usuario).

#### 3. La asimilación (_El "clic"_)

> _"Un refresh token es de un solo uso, como una bala. Pero no me alcanza con borrarlo del `Map` cuando lo usan, porque si lo borro sin más, cuando alguien lo reintente voy a creer que simplemente era un token inventado. Necesito recordar que ese token **ya fue utilizado** y a qué familia o sesión pertenecía. Si alguien toca un token quemado, es una alarma de intrusión: se baja la sesión entera."_

#### 4. Pasos y resolución que realiza

1. Modifica la estructura de almacenamiento de refresh tokens:
   - En lugar de un simple `Map(token -> uid)`, guarda un objeto de sesión o familia:
     ```javascript
     // familiaId -> { uid, tokenActivo, tokensUsados: Set }
     ```
     o en el mapa de tokens guarda su estado:
     ```javascript
     refreshes.set(token, { uid, familiaId, usado: false });
     ```
2. En `app.locals.iniciarSesion(uid)`:
   - Genera el token inicial y un `familiaId`. Lo guarda como `{ uid, familiaId, usado: false }`.
3. En `POST /refresh`:
   - Busca la info del token en el `Map`:
     - Si no existe: responde `401`.
     - **Si existe pero `usado === true` (¡Reuso detectado!)**:
       - Busca todos los tokens que compartan ese `familiaId` y los borra o invalida por completo.
       - Responde `401` (_"Reuso de token detectado. Sesión revocada"_).
     - Si existe y `usado === false`:
       - Marca el token actual como `usado: true`.
       - Genera un `nuevoToken` criptográficamente aleatorio.
       - Guarda el `nuevoToken` asociado al mismo `familiaId` y `uid` con `usado: false`.
       - Devuelve `{ refresh: nuevoToken, uid }`.

---

### El balance final del estudiante

Al terminar el sexto defecto, el estudiante vuelve a ejecutar:

```bash
npm run lab
```

Y ve la suite completa en verde:

```text
✔ 1. Identidad > token válido entra
✔ 1. Identidad > sin token: 401
...
✔ 6. Sesiones > reuso: 401 y se revoca toda la familia
```

El cambio más profundo no está en las líneas de código agregadas, sino en la asimilación conceptual:

- Comprendió que una API REST en producción no es solo hacer CRUD de objetos en JSON.
- El protocolo HTTP tiene una semántica rica (cabeceras condicionales, idempotencia, códigos de error tipificados) diseñada específicamente para resolver los problemas de los sistemas distribuidos (concurrencia, latencia, reintentos de red y seguridad).
