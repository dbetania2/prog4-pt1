const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { levantar, pedir } = require("../comun/red");
const { crearProveedor } = require("../comun/proveedor-local");
const { abrir, sinFirma } = require("../comun/jwt");

const { crearApp } = require(process.env.LAB_API ? path.resolve(process.env.LAB_API) : "./api");
const PROYECTO = "telemetria-utn";
const idp = crearProveedor();
idp.registrar("ana@utn.edu", "a");

let s, app, ana;
const conToken = (h = {}) => ({ Authorization: `Bearer ${ana}`, ...h });

before(async () => {
  app = crearApp({ proyecto: PROYECTO, clavesPublicas: idp.clavesPublicas() });
  s = await levantar(app);
  ana = idp.iniciarSesion("ana@utn.edu", "a", PROYECTO);
});
after(() => s.cerrar());

const clave = () => crypto.randomUUID();
const crearAlerta = (cuerpo = { sensor: "S-01" }, k = clave()) =>
  pedir(`${s.url}/alertas`, { metodo: "POST", cuerpo, headers: conToken({ "Idempotency-Key": k }) });

describe("1. Identidad", () => {
  const conEste = (t) => pedir(`${s.url}/alertas`, { headers: { Authorization: `Bearer ${t}` } });
  test("token válido entra", async () => assert.equal((await conEste(ana)).status, 200));
  test("sin token: 401", async () => assert.equal((await pedir(`${s.url}/alertas`)).status, 401));
  test("token para otro proyecto: 401", async () => {
    assert.equal((await conEste(idp.iniciarSesion("ana@utn.edu", "a", "otro"))).status, 401);
  });
  test("token vencido: 401", async () => {
    assert.equal((await conEste(idp.iniciarSesion("ana@utn.edu", "a", PROYECTO, { duracion: -3600 }))).status, 401);
  });
  test("alg none: 401", async () => assert.equal((await conEste(sinFirma(abrir(ana).payload))).status, 401));
  test("payload editado: 401", async () => {
    const [h, , f] = ana.split(".");
    const p = Buffer.from(JSON.stringify({ ...abrir(ana).payload, sub: "uid_admin" })).toString("base64url");
    assert.equal((await conEste(`${h}.${p}.${f}`)).status, 401);
  });
  test("el usuario sale del token, no del body", async () => {
    const r = await crearAlerta({ sensor: "S-01", creadaPor: "uid_admin" });
    assert.equal(r.datos.creadaPor, abrir(ana).payload.sub);
  });
});

describe("2. Idempotencia", () => {
  test("sin clave: 400", async () => {
    const r = await pedir(`${s.url}/alertas`, { metodo: "POST", cuerpo: { sensor: "S-01" }, headers: conToken() });
    assert.equal(r.status, 400);
  });
  test("mismo reintento: una sola alerta, misma respuesta", async () => {
    const k = clave();
    const antes = app.locals.cantidadDeAlertas();
    const r1 = await crearAlerta({ sensor: "S-02" }, k);
    const r2 = await crearAlerta({ sensor: "S-02" }, k);
    assert.equal(app.locals.cantidadDeAlertas(), antes + 1);
    assert.deepEqual(r2.datos, r1.datos);
    assert.equal(r2.status, 201);
  });
  test("misma clave, otro cuerpo: 422", async () => {
    const k = clave();
    await crearAlerta({ sensor: "S-03" }, k);
    assert.equal((await crearAlerta({ sensor: "S-04" }, k)).status, 422);
  });
});

describe("3. Concurrencia", () => {
  const url = () => `${s.url}/sensores/S-01`;
  test("GET manda un ETag fuerte", async () => {
    const e = (await pedir(url(), { headers: conToken() })).headers.get("etag");
    assert.ok(e && !e.startsWith("W/"), `ETag recibido: ${e}`);
  });
  test("If-None-Match vigente: 304", async () => {
    const e = (await pedir(url(), { headers: conToken() })).headers.get("etag");
    assert.equal((await pedir(url(), { headers: conToken({ "If-None-Match": e ?? "x" }) })).status, 304);
  });
  test("PUT sin If-Match: 428", async () => {
    assert.equal((await pedir(url(), { metodo: "PUT", cuerpo: { umbral: 1 }, headers: conToken() })).status, 428);
  });
  test("segundo PUT con ETag viejo: 412 y no pisa", async () => {
    const leido = await pedir(url(), { headers: conToken() });
    const e = leido.headers.get("etag") ?? "x";
    const a = await pedir(url(), { metodo: "PUT", cuerpo: { ...leido.datos, umbral: 4 }, headers: conToken({ "If-Match": e }) });
    assert.equal(a.status, 200);
    const b = await pedir(url(), { metodo: "PUT", cuerpo: { ...leido.datos, nombre: "pisado" }, headers: conToken({ "If-Match": e }) });
    assert.equal(b.status, 412);
    const final = await pedir(url(), { headers: conToken() });
    assert.equal(final.datos.umbral, 4);
    assert.notEqual(final.datos.nombre, "pisado");
  });
});

describe("4. Errores", () => {
  test("404 en problem+json", async () => {
    const r = await pedir(`${s.url}/sensores/nada`, { headers: conToken() });
    assert.equal(r.status, 404);
    assert.match(r.headers.get("content-type"), /application\/problem\+json/);
    assert.ok(r.datos.type && r.datos.title);
    assert.equal(r.datos.status, 404);
  });
  test("JSON roto: 400 en problem+json", async () => {
    const r = await pedir(`${s.url}/alertas`, { metodo: "POST", cuerpo: "{roto", headers: conToken({ "Idempotency-Key": clave() }) });
    assert.equal(r.status, 400);
    assert.match(r.headers.get("content-type"), /application\/problem\+json/);
  });
  test("500 sin filtrar el mensaje interno", async () => {
    const r = await pedir(`${s.url}/roto`);
    assert.equal(r.status, 500);
    assert.match(r.headers.get("content-type"), /application\/problem\+json/);
    assert.doesNotMatch(JSON.stringify(r.datos), /postgres|secreto/);
  });
});

describe("5. Paginación", () => {
  test("no repite ni saltea con una inserción entre páginas", async () => {
    for (let i = 0; i < 7; i++) await crearAlerta({ sensor: `P-${i}` });
    const pagina = async (c) => (await pedir(`${s.url}/alertas?limite=3${c ? "&cursor=" + c : ""}`, { headers: conToken() })).datos;
    const p1 = await pagina();
    await crearAlerta({ sensor: "nueva" });
    assert.ok(p1.siguiente, "la respuesta tiene que traer el campo siguiente");
    const p2 = await pagina(p1.siguiente);
    const ids = [...p1.items, ...p2.items].map((a) => a.id);
    assert.equal(new Set(ids).size, 6, `ids: ${ids}`);
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a));
    assert.equal(ids[5], ids[0] - 5, `no puede saltear: ${ids}`);
  });
});

describe("6. Sesiones", () => {
  const refrescar = (token) => pedir(`${s.url}/refresh`, { metodo: "POST", cuerpo: { token } });
  test("rota: devuelve un token distinto", async () => {
    const t = app.locals.iniciarSesion("ana");
    const r = await refrescar(t);
    assert.equal(r.status, 200);
    assert.notEqual(r.datos.refresh, t);
  });
  test("reuso: 401 y se revoca toda la familia", async () => {
    const t = app.locals.iniciarSesion("ana");
    const nuevo = (await refrescar(t)).datos.refresh;
    assert.equal((await refrescar(t)).status, 401);
    assert.equal((await refrescar(nuevo)).status, 401);
  });
});
