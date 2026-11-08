# Verification and upgrades

Run from `standalone/`:

```sh
npm test
npm run format:check
npm run probe
npx playwright install chromium
# With a separately running wrapper using the same token:
ACCESS_TOKEN="$ACCESS_TOKEN" npm run test:browser
```

Set `BASE_URL` for a non-default browser test endpoint and `PLAYWRIGHT_BROWSERS_PATH` if browser binaries are installed in a custom location. Browser smoke testing uses the existing UI but does not submit chat or require a Codex login. It covers wrapper login, rendering, RPC, tab isolation and reload. Unit tests cover transport, persistence, URI behavior, asset mismatch rejection, loopback policy, static path/symlink confinement and view-specific confirmations.

Before relying on a remote deployment, verify these account-backed scenarios:

1. Device login on the server; load history and settings, send a chat, choose a model.
2. Trigger an approval, reject and accept separate operations; interrupt a turn. Repeat with two tabs and ensure approvals and replies target the intended session.
3. Change settings, configure MCP, inspect skills/plugins, exercise Git state and diffs in a disposable repository, and verify cloud eligibility.
4. Attach a browser upload and a server file, test large payloads and chunk ACK exchanges, and verify config editing/read-only previews.
5. Disconnect during a turn and reconnect; confirm no duplicate sends. Restart the service; confirm history and configuration persist and wrapper authentication is required again.
6. From another PC, verify trusted HTTPS/WSS, reject invalid tokens and cross-origin requests/upgrades, and try encoded traversal and escaping symlinks. Verify inaccessible host/CLI listeners remain inaccessible.

Development verified activation, original UI RPC and the unauthenticated Codex sign-in screen. Account-backed and separate-machine checks remain pending; record actual results here when performed.

`codex-vscode/` is an external, read-only distribution, deliberately excluded from wrapper commits. Preserve its licenses. Use a complete distribution of the same version for UI, extension and binaries. `standalone/assets-manifest.json` pins the current version and hashes of the package, entry HTML, extension host and bundled executables. Startup stops on a mismatch. It is a compatibility guard, not a signature for every asset.

For an upgrade, keep the previous assets and state backup, point a test instance at the new distribution, inspect changed APIs and update the compatibility layer, recompute the manifest hashes intentionally, and run all checks above before deployment. Never replace just the CLI. No generated patches are currently used. If a compatibility issue eventually requires a patch, generate a separate copy and check the exact version and original hash before applying it. Store the diff, reason and regression test together, and fail closed on mismatch. Never use ambiguous string replacement on a new release.
