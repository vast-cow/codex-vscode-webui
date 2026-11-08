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
