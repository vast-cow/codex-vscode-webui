# Standalone Codex Web UI

Runs the bundled Codex extension and its existing UI without VS Code. Requires Linux x86_64 and Node.js 22. Uses `codex-vscode/extension/` as an unchanged, external input.

```sh
cd standalone
npm ci
export ACCESS_TOKEN="$(openssl rand -hex 32)"
export CODEX_WORKSPACE=/absolute/path/to/project
npm start
```

Open `http://127.0.0.1:8787` and enter the access token. Authenticate Codex on the server before using chat.

- [Configuration, remote access and authentication](docs/operations.md)
- [Architecture and compatibility status](docs/compatibility.md)
- [Verification and asset upgrades](docs/maintenance.md)
