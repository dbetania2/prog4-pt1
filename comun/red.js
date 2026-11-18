// Ayudas para que cada archivo levante su propio servidor, le pegue y termine.
// Así no hacen falta dos terminales: corrés un archivo y ves la película entera.
function levantar(app) {
  return new Promise((ok) => {
    const server = app.listen(0, "127.0.0.1", () => {
      ok({
        url: `http://127.0.0.1:${server.address().port}`,
        cerrar: () => new Promise((fin) => { server.closeAllConnections(); server.close(fin); }),
      });
    });
  });
}

async function pedir(url, { metodo = "GET", cuerpo, headers = {}, timeoutMs } = {}) {
  const res = await fetch(url, {
    method: metodo,
    headers: cuerpo !== undefined ? { "content-type": "application/json", ...headers } : headers,
    body: cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  const texto = await res.text();
  let datos = texto;
  try { datos = texto ? JSON.parse(texto) : null; } catch { /* queda como texto */ }
  return { status: res.status, headers: res.headers, datos };
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
module.exports = { levantar, pedir, esperar };
