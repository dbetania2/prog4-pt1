# 03-lost-update.js: El Problema de la Modificación Concurrente (Lost Update)

Demuestra cómo dos clientes que leen el mismo recurso al mismo tiempo se pisan y borran cambios mutuamente sin recibir ningún error.

---

## 1. El Recurso y los Endpoints Inseguros (Líneas 9 a 13)

```javascript
let sensor = { id: "S-01", nombre: "Cámara fría", umbral: 8 };
const app = express();
app.use(express.json());
app.get("/sensores/S-01", (req, res) => res.json(sensor));
app.put("/sensores/S-01", (req, res) => { sensor = { ...req.body, id: "S-01" }; res.json(sensor); });
```

* `let sensor = { id: "S-01", nombre: "Cámara fría", umbral: 8 };`  
  Objeto en memoria que representa el recurso compartido.
* `app.get("/sensores/S-01", (req, res) => res.json(sensor));`  
  Endpoint de lectura. Devuelve el estado actual del recurso sin ninguna información de versión o etiqueta.
* `app.put("/sensores/S-01", (req, res) => { ... })`  
  Endpoint de actualización por reemplazo total (`PUT`). Sobrescribe ciegamente el objeto `sensor` con lo que mande el cliente (`...req.body`) y responde `200 OK`. No comprueba si el recurso cambió desde que el cliente lo leyó.

---

## 2. El Conflicto de Concurrencia (Líneas 19 a 28)

```javascript
const deAna = (await pedir(url)).datos;
const deBeto = (await pedir(url)).datos;

const a = await pedir(url, { metodo: "PUT", cuerpo: { ...deAna, umbral: 4 } });
console.log("Ana sube umbral a 4:     ", a.status, a.datos);
const b = await pedir(url, { metodo: "PUT", cuerpo: { ...deBeto, nombre: "Cámara 1" } });
console.log("Beto renombra:           ", b.status, b.datos);
```

1. **Lectura simultánea:** Ana y Beto leen el sensor. Ambos obtienen `{ nombre: "Cámara fría", umbral: 8 }`.
2. **Primera escritura (Ana):** Modifica el umbral a `4` y hace `PUT`. El servidor actualiza el sensor a `{ nombre: "Cámara fría", umbral: 4 }` y responde `200 OK`.
3. **Segunda escritura (Beto):** Beto todavía tenía en su pantalla la lectura original con umbral `8`. Modifica el nombre a `"Cámara 1"` y envía `PUT` con `{ nombre: "Cámara 1", umbral: 8 }`.
4. **El Desastre (*Lost Update*):** El servidor acepta el `PUT` de Beto con `200 OK`. Al sobrescribir el objeto completo, el umbral `4` de Ana se borró y volvió a `8`.
5. **Conclusión:** Ambos clientes recibieron `200 OK`, no hubo ningún error en consola, pero el cambio de Ana se perdió por completo.



---

## 3. Teoría que hay que llevarse aprendida (Preguntas y Respuestas)

### Pregunta 1: ¿Qué es el problema del *Lost Update* (Actualización Perdida) en HTTP?
* **Respuesta:**  
  Ocurre cuando dos o más clientes leen el mismo estado de un recurso al mismo tiempo, ambos aplican modificaciones locales basadas en esa lectura vieja y envían sus cambios al servidor. La última petición en llegar sobrescribe por completo el estado del recurso, borrando silenciosamente los cambios que guardó el cliente anterior.

### Pregunta 2: ¿Por qué dos códigos `200 OK` consecutivos no garantizan que ambas escrituras fueron exitosas?
* **Respuesta:**  
  Porque el código `200 OK` solo confirma que la petición individual del cliente fue procesada y guardada sin errores en ese instante. No garantiza que la escritura respete la intención de los cambios previos. Ambos clientes reciben `200 OK`, pero el resultado final contiene únicamente los cambios del último en escribir.

### Pregunta 3: ¿Se soluciona este problema usando `PATCH` en lugar de `PUT` o teniendo una base de datos más rápida?
* **Respuesta:**  
  **No.** Si dos clientes intentan modificar el mismo campo a partir de una lectura vieja (por ejemplo: *"si el saldo es 100, descontar 50"*), `PATCH` sufre exactamente la misma colisión de concurrencia. La velocidad de la base de datos tampoco lo resuelve, porque el tiempo muerto crítico ocurre en el **humano o cliente** que mantiene la pantalla abierta leyendo datos viejos antes de enviar la actualización.
