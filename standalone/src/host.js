const Module = require("node:module");
const path = require("node:path");
const { createCompat } = require("./compat");
const { pack, unpack } = require("./codec");
const assets = path.resolve(
  process.env.CODEX_ASSETS || "../codex-vscode/extension",
);
const workspace = path.resolve(process.env.CODEX_WORKSPACE || process.cwd());
const state = path.resolve(process.env.CODEX_STATE || ".state");
const send = (message) => process.send?.(pack(message));
const compat = createCompat({ assets, workspace, state, send });
const original = Module._load;
Module._load = function (id, ...rest) {
  return id === "vscode" ? compat.api : original.call(this, id, ...rest);
};
let extension;
(async () => {
  extension = require(path.join(assets, "out/extension.js"));
  await extension.activate(compat.context);
  send({ type: "ready" });
  console.error("Standalone extension activated");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
process.on("message", async (wire) => {
  const m = unpack(wire);
  try {
    if (m.type === "open")
      send({ type: "html", id: m.id, html: await compat.open(m.id) });
    else if (m.type === "message") compat.receive(m.id, m.message);
    else if (m.type === "response") compat.respond(m.id, m.requestId, m.value);
    else if (m.type === "close") compat.close(m.id);
  } catch (e) {
    send({ type: "error", id: m.id, error: e.message });
    console.error(e);
  }
});
async function stop() {
  try {
    await extension?.deactivate?.();
    for (const d of compat.context.subscriptions.reverse()) d.dispose();
  } finally {
    process.exit();
  }
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
