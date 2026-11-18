# 06-paginacion.js: Paginación por Offset vs. Paginación por Cursor

Demuestra por qué paginar por número de página (`offset`) repite u omite elementos cuando los datos cambian en tiempo real, y cómo la paginación por **cursor** (*Keyset Pagination*) resuelve el problema.

---

## 1. El Enfoque Frágil: Paginación por Offset (Líneas 21 a 24)

```javascript
app.get("/offset", (req, res) => {
  const pagina = Number(req.query.pagina), limite = 3;
  res.json({ items: nuevasPrimero().slice((pagina - 1) * limite, pagina * limite).map((a) => a.id) });
});
```

* **Cómo funciona:** Calcula una posición relativa: `(pagina - 1) * limite`.
* **Falla con inserciones:**  
  Si la lista es `[10, 9, 8, 7, 6, 5]`:
  * Página 1 (límite 3) devuelve `[10, 9, 8]`.
  * Si alguien inserta la alerta `11`, la lista pasa a ser `[11, 10, 9, 8, 7, 6, 5]`.
  * Al pedir la Página 2 (índices 3 al 5), devuelve `[8, 7, 6]`.
  * **¡El elemento `8` aparece repetido dos veces!**
* **Falla con eliminaciones:** Si se borra un elemento de la primera página antes de pedir la segunda, un elemento se saltea y nunca se llega a ver.

---

## 2. El Enfoque Robusto: Paginación por Cursor (Líneas 25 a 31)

```javascript
const cifrar = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const descifrar = (c) => JSON.parse(Buffer.from(c, "base64url").toString());

app.get("/cursor", (req, res) => {
  const limite = 3;
  const desde = req.query.cursor ? descifrar(req.query.cursor).id : Infinity;
  const items = nuevasPrimero().filter((a) => a.id < desde).slice(0, limite);
  const ultimo = items.at(-1);
  res.json({ items: items.map((a) => a.id), siguiente: ultimo ? cifrar({ id: ultimo.id }) : null });
});
```

* **Qué es el cursor:** Un puntero al último registro visto (codificado en Base64URL para no exponer detalles internos de la base de datos).
* `a.id < desde`:  
  En lugar de contar posiciones, la consulta filtra por valor: *"dame los elementos cuyo ID sea estrictamente menor al último ID que ya leí"*.
* **Inmunidad ante cambios:** No importa si entran 50 alertas nuevas con IDs más altos o si se borran elementos viejos: el punto de referencia (`desde`) permanece inmutable en el tiempo.
* `siguiente: cifrar({ id: ultimo.id })`:  
  Devuelve el token que el cliente debe enviar en su próxima llamada (`?cursor=...`) para continuar exactamente donde se quedó. Si no quedan más elementos, devuelve `null`.



---

## 3. Teoría que hay que llevarse aprendida (Preguntas y Respuestas)

### Pregunta 1: ¿Por qué la paginación tradicional por desplazamiento (`OFFSET` o número de página) es defectuosa en sistemas dinámicos?
* **Respuesta:**  
  Porque calcula posiciones relativas respecto al inicio del conjunto de datos. Si mientras el usuario lee una página se insertan registros nuevos al principio de la tabla, toda la lista se desplaza hacia abajo: al solicitar la siguiente página, el último elemento ya visto vuelve a aparecer duplicado. De igual forma, si se eliminan registros intermedios, otros elementos se saltean sin ser leídos.

### Pregunta 2: ¿Cómo funciona la paginación por Cursor (*Keyset Pagination*) y por qué es estable?
* **Respuesta:**  
  En lugar de saltar $N$ filas, el cliente solicita registros utilizando como referencia el identificador del último elemento que ya procesó (ej. `WHERE id < ultimo_id_visto LIMIT 10`). La posición de lectura queda anclada a una clave inmutable; no importa cuántos elementos nuevos se agreguen o borren en otros puntos de la tabla, la consulta siempre reanuda de forma determinística en el elemento siguiente.

### Pregunta 3: ¿Por qué el cursor que se le envía al cliente suele codificarse (por ejemplo, en Base64URL)?
* **Respuesta:**  
  Para tratar al cursor como un **token opaco**. Esto evita que el cliente intente adivinar o manipular su estructura, desacopla la API de la estructura interna de la base de datos (por si el cursor está compuesto por múltiples columnas) y permite evolucionar la estrategia de paginación sin romper a los clientes.

### Pregunta 4: ¿Qué sucede con el cursor si se ordena por un campo con valores repetidos (ej. ordenar por fecha o por precio)?
* **Respuesta:**  
  Si múltiples registros comparten exactamente el mismo valor de ordenamiento, filtrar solo por `WHERE valor < ultimo_valor` omitirá todos los elementos que tengan el mismo valor repetido.  
  **La solución:** El cursor requiere obligatoriamente una regla de **desempate determinístico**, combinando el campo repetido con la clave primaria única: `ORDER BY fecha DESC, id DESC`, filtrando como `WHERE (fecha, id) < ($1, $2)`.
