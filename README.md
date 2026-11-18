# Semántica HTTP, identidad federada y JWT

Programación IV · UTN FRRe. Todo corre en tu máquina, sin cuentas ni servicios externos.

## Arranque

Abrí una terminal en esta carpeta y corré:

```
node 00-arranque/verificar.js
```

Tiene que terminar en `TODO OK`. Si dice que falta Express, corré `npm install`. Necesitás Node 22 o más.

## Cómo se trabaja

Cada archivo levanta su propio servidor, le pega y termina. No hacen falta dos terminales.

1. Abrí el archivo y leé el `PREDECÍ ANTES DE EJECUTAR` del principio.
2. Escribí tu predicción. **Sin esto, no aprendés nada de ver la salida.**
3. Ejecutalo.
4. Si le erraste, escribí qué parte de tu modelo mental estaba mal.
5. Hacé el `PARA PROBAR VOS` del final. Modificá el archivo sin miedo.

## Qué te tenés que llevar

- **Un timeout no te dice qué pasó.** Por eso un POST reintentado crea duplicados, salvo que el cliente mande una clave de idempotencia.
- **Dos 200 no significan dos escrituras exitosas.** `ETag` + `If-Match` hace visible el conflicto.
- **Tu backend no autentica: verifica.** Lo único que identifica a un usuario es lo que sale de un token verificado.
- **Una firma correcta no alcanza.** También hay que mirar para quién es (`aud`), quién lo emitió (`iss`) y cuándo vence (`exp`).
- **Base64url no es cifrado.** Cualquiera lee un JWT.
- **El servidor decide el algoritmo y la clave.** Nunca el token.
- **Un JWT no se revoca sin estado.** Las salidas reales son vencimiento corto, refresh rotativo o sesión en base.

## Comandos

### Bloque 1: Semántica HTTP

```
node 01-http/01-reintento-post.js
node 01-http/02-idempotency-key.js
node 01-http/03-lost-update.js
node 01-http/04-etag-if-match.js
node 01-http/05-problem-details.js
node 01-http/06-paginacion.js
```

### Bloque 2: Identidad federada

```
node 02-identidad/01-uid-en-el-body.js
node 02-identidad/02-verificar-id-token.js
node 02-identidad/03-authn-vs-authz.js
```

El proveedor de `comun/proveedor-local.js` emite tokens con la misma forma que Firebase Auth. Con Firebase real, tu backend reemplaza `verificarIdToken` por `getAuth().verifyIdToken(idToken)` del Admin SDK.

### Bloque 3: JWT

```
node 03-jwt/01-abrir-token.js
node 03-jwt/02-alg-none.js
node 03-jwt/03-algorithm-confusion.js
node 03-jwt/04-secreto-debil.js
node 03-jwt/05-kid-inyeccion.js
node 03-jwt/06-endurecido.js
node 03-jwt/07-no-se-puede-revocar.js
node 03-jwt/08-refresh-rotacion.js
node 03-jwt/09-rotacion-de-claves.js
```

Los ataques apuntan a un verificador con agujeros escrito para esta clase, en tu propia máquina. Probar esto contra sistemas ajenos sin autorización es un delito.

### Laboratorio

Leé `laboratorio/CONSIGNA.md`, arreglá `laboratorio/api.js` y corré:

```
npm run lab
```

## Para leer

- RFC 9110 §9: métodos seguros e idempotentes
- RFC 9457: Problem Details
- RFC 7519: JSON Web Token
- RFC 8725: buenas prácticas de JWT
- Firebase: *Verify ID Tokens*
