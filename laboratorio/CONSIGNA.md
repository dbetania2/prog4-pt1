# Laboratorio: arreglá la API de alertas

`api.js` funciona en el caso feliz y tiene seis defectos, todos vistos hoy. No toques `pruebas.test.js`.

```
npm run lab
```

Al principio fallan casi todas. Andá de a una, en orden: leé qué esperaba la prueba, predecí qué falla y recién después escribí el arreglo.

| Peso | Parte | Qué tiene que pasar |
|---|---|---|
| 20% | 1. Identidad | Un token vencido, para otro proyecto o con `alg: none` recibe 401. El usuario sale del token, nunca del body |
| 20% | 2. Idempotencia | Reintentar un `POST /alertas` con la misma `Idempotency-Key` crea una sola alerta y devuelve la misma respuesta. Otro cuerpo con esa clave: 422 |
| 20% | 3. Concurrencia | `PUT /sensores/:id` exige `If-Match`: 428 si falta, 412 si está vieja. `GET` manda `ETag` y contesta 304 con `If-None-Match` |
| 10% | 4. Errores | Todos los errores salen como `application/problem+json` con `type`, `title` y `status`. Un 500 no filtra el mensaje interno |
| 15% | 5. Paginación | `GET /alertas?limite=3&cursor=...` no repite ni saltea con inserciones entre páginas |
| 15% | 6. Sesiones | `POST /refresh` rota el token. Reusar uno ya usado revoca la familia |

## Para defender

Pasar las pruebas no alcanza. Respondé por escrito, con tus palabras:

1. ¿Qué token falso entra si sacás tus chequeos de `aud` e `iss`? Describí quién lo consigue y cómo.
2. Tu arreglo de idempotencia, ¿sigue andando con dos instancias de la API? Si no, ¿qué cambiarías en PostgreSQL?
3. Tu cursor, ¿qué pasa si ordenás por un campo con valores repetidos?
4. Una decisión donde hayas rechazado lo que te propuso una IA o un compañero, y por qué.

Se corrige que puedas explicar exactamente por qué funciona. Esto es lo que vas a necesitar para el TP final.
