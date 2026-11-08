const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pack, unpack } = require("../src/codec");
const { Uri, store, EventEmitter } = require("../src/compat");
test("transport preserves binary, undefined and reserved-looking objects", () => {
  const value = {
    a: new Uint8Array([0, 128, 255]),
    b: [undefined, { $bytes: "literal" }],
  };
  assert.deepEqual(unpack(pack(value)), value);
});
test("URI round trip handles spaces and fragments", () => {
  const u = Uri.file("/tmp/a #b");
  assert.equal(u.fsPath, "/tmp/a #b");
  assert.equal(Uri.joinPath(u, "c").fsPath, "/tmp/a #b/c");
});
test("state survives reload and deletion", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-state-"));
  try {
    const file = path.join(dir, "s.json");
    await store(file).update("x", false);
    assert.equal(store(file).get("x", true), false);
    await store(file).update("x", undefined);
    assert.deepEqual(store(file).keys(), []);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("events detach listeners", () => {
  const e = new EventEmitter();
  let count = 0;
  const d = e.event(() => count++);
  e.fire();
  d.dispose();
  e.fire();
  assert.equal(count, 1);
});
test("asset validation stops on an unexpected hash", () => {
  const { verifyAssets } = require("../src/assets");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-pin-"));
  try {
    fs.writeFileSync(path.join(dir, "asset"), "changed");
    assert.throws(
      () =>
        verifyAssets(dir, {
          version: "test",
          sha256: { asset: "0".repeat(64) },
        }),
      /Asset mismatch/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});
test("browser confirmation responses are restricted to the originating view", async () => {
  const { createCompat } = require("../src/compat");
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "codex-confirm-"));
  const sent = [];
  try {
    const c = createCompat({
      assets: path.resolve(__dirname, "../../codex-vscode/extension"),
      workspace: state,
      state,
      send: (m) => sent.push(m),
    });
    c.api.window.registerWebviewViewProvider("chatgpt.sidebarView", {
      resolveWebviewView(view) {
        view.webview.onDidReceiveMessage(() => {
          void c.api.window
            .showWarningMessage("Confirm operation", "Approve")
            .then((value) => sent.push({ result: value }));
        });
      },
    });
    await c.open("first");
    c.receive("first", {});
    const request = sent.find((m) => m.type === "confirm");
    assert.equal(request.id, "first");
    c.respond("second", request.requestId, "Approve");
    await new Promise(setImmediate);
    assert(!sent.some((m) => "result" in m));
    c.respond("first", request.requestId, "Approve");
    await new Promise(setImmediate);
    assert.equal(sent.find((m) => "result" in m).result, "Approve");
    c.close("first");
  } finally {
    fs.rmSync(state, { recursive: true });
  }
});
