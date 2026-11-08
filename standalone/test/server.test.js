const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { config, safeAsset } = require("../src/server");
test("remote HTTP and weak authentication are rejected", () => {
  assert.throws(() => config({ ACCESS_TOKEN: "short" }));
  assert.throws(() =>
    config({ HOST: "0.0.0.0", ACCESS_TOKEN: "x".repeat(32) }),
  );
  assert.equal(config({ ACCESS_TOKEN: "x".repeat(32) }).host, "127.0.0.1");
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
