// Un JWT escrito a mano, sin librerías, para que no haya magia.
// En producción usás una librería auditada (jose). Acá lo importante es VER qué hace.
const crypto = require("node:crypto");

const b64u = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
const deB64u = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

function firmarHS256(payload, secreto, headerExtra = {}) {
  const base = `${b64u({ alg: "HS256", typ: "JWT", ...headerExtra })}.${b64u(payload)}`;
  return `${base}.${crypto.createHmac("sha256", secreto).update(base).digest("base64url")}`;
}

function firmarRS256(payload, clavePrivada, kid) {
  const base = `${b64u({ alg: "RS256", kid, typ: "JWT" })}.${b64u(payload)}`;
  return `${base}.${crypto.createSign("RSA-SHA256").update(base).sign(clavePrivada, "base64url")}`;
}

function sinFirma(payload) {
  return `${b64u({ alg: "none", typ: "JWT" })}.${b64u(payload)}.`;
}

// Lee sin verificar NADA. Cualquiera puede hacer esto con cualquier token.
function abrir(token) {
  const [h, p, firma] = String(token).split(".");
  return { header: deB64u(h), payload: deB64u(p), firma };
}

function firmaHS256Valida(token, secreto) {
  const [h, p, firma = ""] = token.split(".");
  const esperada = crypto.createHmac("sha256", secreto).update(`${h}.${p}`).digest();
  const recibida = Buffer.from(firma, "base64url");
  // timingSafeEqual: comparar con === filtra por tiempo en qué byte difirió.
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

function firmaRS256Valida(token, clavePublica) {
  const [h, p, firma = ""] = token.split(".");
  return crypto.createVerify("RSA-SHA256").update(`${h}.${p}`).verify(clavePublica, firma, "base64url");
}

const ahora = () => Math.floor(Date.now() / 1000);
module.exports = { b64u, firmarHS256, firmarRS256, sinFirma, abrir, firmaHS256Valida, firmaRS256Valida, ahora };
