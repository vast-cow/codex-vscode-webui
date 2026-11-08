// Run against a running service, using its ACCESS_TOKEN and optional BASE_URL.
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { unpack } = require("../src/codec");
(async () => {
  const base = process.env.BASE_URL || "http://127.0.0.1:8787";
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator("input[name=token]").fill(process.env.ACCESS_TOKEN);
    await page.locator("button").click();
    await page.waitForURL(base + "/");
    const frames = [];
    // The bridge is created during navigation; instrument subsequent tab for RPC assertions.
    const second = await context.newPage();
    second.on("websocket", (ws) =>
      ws.on("framereceived", (f) => frames.push(unpack(JSON.parse(f.payload)))),
    );
    await second.goto(base);
    await second.waitForFunction(
      () => document.body.innerText.includes("Codex"),
      {},
      { timeout: 120000 },
    );
    await second.waitForTimeout(2000);
    assert(frames.some((m) => m.message?.type === "vscode-capn-rpc-message"));
    const ids = await Promise.all(
      [page, second].map((p) => p.evaluate(() => window.__webviewId)),
    );
    assert.notEqual(ids[0], ids[1]);
    assert(
      frames.filter((m) => m.type === "message").every((m) => m.id === ids[1]),
    );
    await second.reload();
    assert.notEqual(await second.evaluate(() => window.__webviewId), ids[1]);
    assert.deepEqual(errors, []);
    console.log(
      "Browser login, rendering, RPC, tab isolation and reload passed",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
