Tarjeta 1: Especificaciones y Semántica de los Métodos HTTP

Frente:

¿Cuáles son las especificaciones y restricciones de los métodos HTTP principales (GET, POST, PUT, PATCH y DELETE), cuál es la diferencia exacta entre reescribir un recurso por completo o modificar solo campos específicos, y qué significa que un método sea Seguro?

Dorso:

Método Seguro: Es aquel que solo consulta información y no altera en absoluto el estado del servidor ni de la base de datos (operación de solo lectura). El único método seguro del grupo principal es GET. Los métodos POST, PUT, PATCH y DELETE no son seguros porque modifican recursos.

GET (Consulta): Su función se restringe a solicitar la representación de un recurso. Es seguro y no debe provocar efectos secundarios en los datos.

DELETE (Eliminación): Elimina el recurso indicado en la URL. No es seguro, pero sí deja el servidor en el mismo estado final aunque se repita.

PUT (Reemplazo Total): Reemplaza completamente el recurso existente por el cuerpo enviado. Si el recurso original tenía diez atributos y en la petición solo se envían dos, los ocho restantes se borran o quedan vacíos, ya que sobrescribe el documento entero.

PATCH (Modificación Parcial): Modifica únicamente los campos específicos que viajan en el cuerpo de la petición. El resto de los atributos existentes en el servidor se mantienen intactos.

POST (Creación / Procesamiento): Envía datos para que el servidor procese una acción o cree un recurso subordinado con un nuevo identificador. Cada llamada genera un nuevo registro o efecto secundario en el sistema.

Tarjeta 2: Concepto de Idempotencia, Timeouts y Solución en HTTP

Frente:

**¿Qué es la Idempotencia en general y en HTTP (RFC 9110), por qué un Timeout en `POST` provoca duplicados, y cómo se soluciona con `Idempotency-Key`?**

Dorso:

- **Idempotencia en general:** Propiedad matemática y lógica donde ejecutar una acción múltiples veces produce el mismo resultado y estado final que ejecutarla una sola vez (*f(f(x)) = f(x)*).
- **Idempotencia en HTTP (RFC 9110):** Se refiere al efecto en el servidor. Un método es idempotente si varias peticiones idénticas dejan los datos en el mismo estado (`GET`, `PUT`, `DELETE` son idempotentes; `POST` generalmente no lo es). Permite a los clientes reintentar peticiones ante fallas sin generar efectos adicionales.

- **El problema del Timeout con POST:**
  - **Timeout:** Es el tiempo máximo que el cliente espera una respuesta. Si se agota, el cliente desconoce si la operación llegó a ejecutarse.
  - **Los tres escenarios posibles (físicamente indistinguibles para el cliente):**
    1. **La petición no llegó:** La comunicación se interrumpió antes de alcanzar el servidor. La operación no se ejecutó.
    2. **La petición llegó y falló:** El servidor recibió los datos, pero ocurrió un error antes de completar la operación.
    3. **La petición funcionó, pero se perdió la respuesta:** El servidor procesó la operación y guardó los datos, pero la confirmación no llegó al cliente.
  - **Consecuencia:** El cliente no puede distinguir cuál de los tres escenarios ocurrió. Si reintenta a ciegas una operación no idempotente, en el tercer escenario puede ejecutar la operación nuevamente y generar efectos duplicados (por ejemplo, cobrar dos veces una factura).

- **La solución con Idempotency-Key:** El cliente genera un UUID único por operación y lo envía en la cabecera `Idempotency-Key`, reutilizando la misma clave en cada reintento.

**Lógica del servidor ante la clave:**
- **Si la clave es nueva:** Procesa la operación, almacena la clave asociada al resultado y responde con código `201`.
- **Si la clave ya fue procesada y el cuerpo es idéntico:** No vuelve a ejecutar la operación; devuelve la respuesta anterior.
- **Si la misma clave se envía con un cuerpo diferente:** Rechaza la petición (por ejemplo, con `422 Unprocessable Content`).
- **Si la petición no incluye la cabecera requerida:** Puede rechazarla con `400 Bad Request`, si la API exige esa cabecera.
