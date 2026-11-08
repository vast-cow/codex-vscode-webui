const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const manifest = require("../assets-manifest.json");
function verifyAssets(root, expected = manifest) {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw Error("Only Linux x86_64 is supported");
  for (const [file, hash] of Object.entries(expected.sha256)) {
    const actual = createHash("sha256")
      .update(fs.readFileSync(path.join(root, file)))
      .digest("hex");
    if (actual !== hash)
      throw Error(
        `Asset mismatch: ${file}. Expected extension ${expected.version}; review docs/maintenance.md before upgrading.`,
      );
  }
  return expected.version;
}
module.exports = { verifyAssets };
