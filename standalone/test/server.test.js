const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { config, safeAsset } = require("../src/server");
test("default binding accepts HTTP and preserves strong authentication", () => {
  assert.throws(() => config({ ACCESS_TOKEN: "short" }));
  const defaults = config({ ACCESS_TOKEN: "x".repeat(32) });
  assert.equal(defaults.host, "0.0.0.0");
  assert.equal(defaults.origin, "http://127.0.0.1:8787");
  assert.equal(defaults.tls, false);
  const remote = config({
    ACCESS_TOKEN: "x".repeat(32),
    PUBLIC_ORIGIN: "http://192.168.1.10:8787",
  });
  assert.equal(remote.origin, "http://192.168.1.10:8787");
  assert.equal(
    config({ HOST: "127.0.0.1", ACCESS_TOKEN: "x".repeat(32) }).host,
    "127.0.0.1",
  );
});
test("static delivery rejects traversal and escaping symlinks", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-assets-"));
  try {
    fs.mkdirSync(path.join(root, "public"));
    fs.writeFileSync(path.join(root, "secret"), "private");
    fs.writeFileSync(path.join(root, "public", "ok.js"), "ok");
    fs.symlinkSync(
      path.join(root, "secret"),
      path.join(root, "public", "link"),
    );
    assert.equal(
      await safeAsset(path.join(root, "public"), "ok.js"),
      path.join(root, "public", "ok.js"),
    );
    await assert.rejects(safeAsset(path.join(root, "public"), "../secret"));
    await assert.rejects(safeAsset(path.join(root, "public"), "link"));
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});
