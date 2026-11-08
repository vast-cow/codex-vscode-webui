# Operations

Run commands from `standalone/`. `npm ci` installs the wrapper dependencies; it does not install or modify the supplied extension. Assets must match `standalone/assets-manifest.json`.

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `ACCESS_TOKEN` | Required | At least 24 characters; generate a random secret |
| `CODEX_ASSETS` | `../codex-vscode/extension` | Path to the complete matching extension distribution |
| `CODEX_WORKSPACE` | Current directory | Server working folder; set an absolute project path |
| `CODEX_STATE` | `.state` | Persistent wrapper settings, state and uploads |
| `HOST` | `0.0.0.0` | Listening interface |
| `PORT` | `8787` | Listening port |
| `TLS_CERT`, `TLS_KEY` | Unset | PEM certificate and private key; set both to enable HTTPS |
| `PUBLIC_ORIGIN` | Derived from host and port (wildcard IPv4 uses `127.0.0.1`) | Exact browser origin, e.g. `https://codex.example.lan:8787` |

The server binds to all IPv4 interfaces by default. For LAN/VPN access, set `PUBLIC_ORIGIN` to the exact browser URL, e.g. `http://192.168.1.10:8787`. To enable HTTPS, set both TLS paths and use an HTTPS origin with a certificate trusted by every client. The service checks Host and Origin, authenticates static files and WebSocket upgrades, and uses an HttpOnly SameSite cookie (Secure with TLS). This is a single-user service with full access to that user's working environment, not a multi-tenant sandbox. Do not expose the App Server port or substitute a separately installed CLI.

Codex authentication is separate from wrapper access. On the server, run the matching binary:

```sh
../codex-vscode/extension/bin/linux-x86_64/codex login --device-auth
```

Follow the binary's device login instructions. Use the same OS account and `CODEX_HOME` when starting the service. The UI's device-code sign-in is also available; remote OAuth localhost callbacks are unsuitable. Account-backed chat and cloud operations require valid credentials and account eligibility.

One service owns one extension-host process and its bundled App Server. Multiple tabs share account and workspace state but have independent webview/RPC identities. Restart the service to change workspace. Wrapper state lives in `CODEX_STATE`; Codex credentials, configuration and history remain in the server's normal Codex home. Preserve both across restarts. Service restart invalidates wrapper login sessions.

A lost browser connection does not restart the host or resend operations. Click Reconnect to create a new webview and reconstruct the UI using persisted server state. The old view is disposed. In-flight responses are not replayed. Check thread history before manually retrying a send. During a host failure, the service fails closed; restart it and reconnect.

The file picker explicitly distinguishes browser uploads from absolute server paths. Uploads are stored privately under `CODEX_STATE/uploads`, with a 16 MiB per-file limit and 32 MiB transport frame limit (including base64 overhead). Keep upload batches small. Uploads are retained until manually removed when no longer needed. Configuration editing is limited to the server user's `~/.codex/config.toml`; other code references open as read-only text. Browser clipboard support requires a secure context and permission.

If startup fails, run `npm run probe`. An asset mismatch requires reviewing the upgrade procedure; missing TLS, weak token, missing workspace files, unsupported APIs and App Server failures are reported rather than silently treated as success. Initial UI startup loads thousands of existing modules and may take tens of seconds. Project trust remains controlled by Codex's server-side configuration.
