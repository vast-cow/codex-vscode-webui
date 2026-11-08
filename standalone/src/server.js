const http = require("node:http"),
  https = require("node:https"),
  fs = require("node:fs"),
  path = require("node:path");
const { fork } = require("node:child_process");
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { WebSocketServer } = require("ws");
const { pack, unpack } = require("./codec");
function config(env = process.env) {
  const host = env.HOST || "127.0.0.1",
    port = Number(env.PORT || 8787),
    tls = !!(env.TLS_CERT && env.TLS_KEY);
  if (!tls && !["127.0.0.1", "::1", "localhost"].includes(host))
    throw Error("Non-loopback binding requires TLS_CERT and TLS_KEY");
  if (!env.ACCESS_TOKEN || env.ACCESS_TOKEN.length < 24)
    throw Error("ACCESS_TOKEN must contain at least 24 characters");
  return {
    host,
    port,
    tls,
    origin:
      env.PUBLIC_ORIGIN ||
      `${tls ? "https" : "http"}://${host.includes(":") ? "[" + host + "]" : host}:${port}`,
    token: env.ACCESS_TOKEN,
    assets: path.resolve(env.CODEX_ASSETS || "../codex-vscode/extension"),
    workspace: path.resolve(env.CODEX_WORKSPACE || process.cwd()),
    state: path.resolve(env.CODEX_STATE || ".state"),
    cert: env.TLS_CERT,
    key: env.TLS_KEY,
  };
}
function equal(a, b) {
  const x = Buffer.from(a || ""),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function safeAsset(root, relative) {
  const file = await fs.promises.realpath(path.resolve(root, relative));
  const base = await fs.promises.realpath(root);
  if (!file.startsWith(base + path.sep)) throw Error("Forbidden path");
  return file;
}
function start(c) {
  const sessions = new Set(),
    clients = new Map(),
    pending = new Map();
  let ready = false,
    dead = false;
  const child = fork(path.join(__dirname, "host.js"), [], {
    serialization: "advanced",
    env: {
      ...process.env,
      CODEX_ASSETS: c.assets,
      CODEX_WORKSPACE: c.workspace,
      CODEX_STATE: c.state,
    },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });
  const relay = (m) => child.connected && child.send(pack(m));
  child.on("message", (wire) => {
    const m = unpack(wire);
    if (m.type === "ready") {
      ready = true;
      return;
    }
    if (m.type === "html" || m.type === "error") {
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.type === "error" ? p.reject(Error(m.error)) : p.resolve(m.html);
        return;
      }
    }
    const wireOut = JSON.stringify(pack(m));
    if (m.id) {
      const ws = clients.get(m.id)?.ws;
      if (ws?.readyState === 1) ws.send(wireOut);
    } else
      for (const { ws } of clients.values())
        if (ws?.readyState === 1) ws.send(wireOut);
  });
  child.on("exit", () => {
    dead = true;
    ready = false;
    for (const { ws } of clients.values())
      ws?.close(1011, "Extension host exited");
  });
  const authenticated = (req) => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("codex_session="))
      ?.slice(14);
    return sessions.has(cookie);
  };
  const handler = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      if (req.headers.host !== new URL(c.origin).host) {
        res.writeHead(403).end();
        return;
      }
      if (req.headers.origin && req.headers.origin !== c.origin) {
        res.writeHead(403).end();
        return;
      }
      const url = new URL(req.url, c.origin);
      if (url.pathname === "/login" && req.method === "POST") {
        let body = "";
        for await (const b of req) {
          body += b;
          if (body.length > 4096) {
            res.writeHead(413).end();
            return;
          }
        }
        if (!equal(new URLSearchParams(body).get("token"), c.token)) {
          res.writeHead(401).end("Invalid access token");
          return;
        }
        const session = randomBytes(32).toString("hex");
        sessions.add(session);
        res.setHeader(
          "Set-Cookie",
          `codex_session=${session}; HttpOnly; SameSite=Strict; Path=/${c.tls ? "; Secure" : ""}`,
        );
        res.writeHead(303, { Location: "/" }).end();
        return;
      }
      if (!authenticated(req)) {
        res
          .writeHead(401, { "Content-Type": "text/html; charset=utf-8" })
          .end(
            '<!doctype html><title>Codex sign in</title><form method="post" action="/login"><label>Access token <input name="token" type="password" required autocomplete="current-password"></label><button>Sign in</button></form>',
          );
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === "/health") {
        res
          .writeHead(ready ? 200 : 503, { "Content-Type": "application/json" })
          .end(JSON.stringify({ ready, dead }));
        return;
      }
      if (url.pathname === "/") {
        if (!ready) {
          res.writeHead(503).end("Extension host starting; reload shortly.");
          return;
        }
        const id = randomBytes(16).toString("hex");
        clients.set(id, { ws: null });
        const html = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(Error("Webview startup timeout"));
          }, 20000);
          pending.set(id, { resolve, reject, timer });
          relay({ type: "open", id });
        });
        let out = html
          .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g, "")
          .replaceAll("http://standalone.invalid/assets/", "/assets/")
          .replaceAll("/assets//", "/assets/");
        out = out.replace(
          "<head>",
          `<head><script>window.__webviewId=${JSON.stringify(id)}</script><script src="/bridge.js"></script><link rel="stylesheet" href="/theme.css">`,
        );
        // Extension nonce-based CSP is designed for VS Code's origin; enforce the wrapper policy instead.
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; worker-src 'self' blob:; frame-ancestors 'none'",
        );
        res
          .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
          .end(out);
        return;
      }
      let root, relative;
      if (["/bridge.js", "/theme.css"].includes(url.pathname)) {
        root = path.join(__dirname, "../public");
        relative = url.pathname.slice(1);
      } else if (url.pathname.startsWith("/assets/")) {
        root = path.join(c.assets, "webview");
        relative = decodeURIComponent(url.pathname.slice(8));
      } else {
        res.writeHead(404).end();
        return;
      }
      const file = await safeAsset(root, relative);
      const mime = {
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".json": "application/json",
        ".wasm": "application/wasm",
      };
      const data = await fs.promises.readFile(file);
      res
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] || "application/octet-stream",
        })
        .end(data);
    } catch (e) {
      console.error(e.message);
      if (!res.headersSent) res.writeHead(500);
      res.end("Request failed");
    }
  };
  const server = c.tls
    ? https.createServer(
        { cert: fs.readFileSync(c.cert), key: fs.readFileSync(c.key) },
        handler,
      )
    : http.createServer(handler);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 32 * 1024 * 1024,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    let id;
    try {
      id = new URL(req.url, c.origin).searchParams.get("id");
    } catch {}
    if (
      req.headers.host !== new URL(c.origin).host ||
      req.headers.origin !== c.origin ||
      !authenticated(req) ||
      !clients.has(id) ||
      clients.get(id).ws ||
      !ready
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const entry = clients.get(id);
      entry.ws = ws;
      ws.on("message", (data) => {
        try {
          const envelope = unpack(JSON.parse(data));
          if (envelope.kind === "response")
            relay({
              type: "response",
              id,
              requestId: envelope.requestId,
              value: envelope.value,
            });
          else if (envelope.kind === "message")
            relay({ type: "message", id, message: envelope.value });
          else throw Error("Invalid envelope");
        } catch {
          ws.close(1007, "Invalid message");
        }
      });
      ws.on("close", () => {
        clients.delete(id);
        relay({ type: "close", id });
      });
    });
  });
  const expiry = setInterval(() => {
    for (const [id, e] of clients)
      if (!e.ws && !pending.has(id)) {
        clients.delete(id);
        relay({ type: "close", id });
      }
  }, 60000);
  expiry.unref();
  server.listen(c.port, c.host, () =>
    console.log(`Codex standalone: ${c.origin}`),
  );
  const stop = () => {
    clearInterval(expiry);
    for (const { ws } of clients.values()) ws?.terminate();
    server.close();
    child.kill("SIGTERM");
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return { server, child, stop };
}
if (require.main === module) {
  try {
    start(config());
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
module.exports = { config, safeAsset, start };
