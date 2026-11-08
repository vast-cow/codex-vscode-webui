# Architecture and compatibility

The wrapper serves existing webview assets, injecting an API bridge and theme before the original module. The original extension generates the HTML and metadata. Its VS Code CSP is replaced with a browser policy because its webview origin differs from the service origin. Assets themselves are unchanged.

A dedicated Node child intercepts only `require('vscode')`, supplies the compatibility API, and calls the original `activate(context)`. Existing Git, settings, worker bus, Cap'n RPC and App Server code remain in that extension. No App Server network listener is introduced. A tagged transport tree preserves Uint8Array, ArrayBuffer byte content, arrays, objects and undefined across WebSocket and child IPC; RPC and chunk ACK payloads are opaque to the wrapper.

Each page gets a random webview ID. Its socket can send only to that view; clients cannot choose a target ID inside a message. Confirmation requests carry an additional request ID, and replies are accepted only from the originating view. Async browser interactions retain view context. Unknown commands and unsupported APIs raise explicit errors. Selection, diagnostics and active editor context are empty by design.

| Function | Implementation / validation status |
| --- | --- |
| Original extension activation, bundled CLI startup | Verified in this environment, no patches |
| Existing UI and custom RPC | Verified with headless Chromium; sign-in screen renders |
| Multiple tabs, reload | Verified independent IDs and response routing; fresh ID on reload |
| Persistent wrapper state and binary transport | Unit tested |
| Chat, history, model selection, interruption | Original paths retained; account-backed end-to-end validation pending |
| Approvals | Original UI RPC retained; wrapper confirmation routing unit tested; real approval pending |
| Settings, MCP, skills, plugins | Original backend retained; wrapper settings persisted; account-backed flows pending |
| Git status/diff/operations | Original Git manager retained; real UI workflows pending; IDE diff command presents read-only inputs |
| Attachments | Browser upload and explicit server-path picker implemented; full chat attachment workflow pending |
| Configuration files | Small editing dialog for `~/.codex/config.toml` via `vscode.open`; other files read-only |
| File search and watchers | Server filesystem APIs; watcher failures logged; platform behavior requires deployment verification |
| External links and clipboard | Browser link with explicit click; clipboard permission dependent |
| Cloud integration | Account required; unverified (featured-plugin endpoint returned 401 without authentication) |
| Editor selection, diagnostics | Empty IDE context |
| CodeLens, independent terminals, other extensions, audio | Unavailable / outside scope |
| Extra Codex panels / custom editors | Registration tolerated; creating additional panels unsupported; use browser tabs |
| Server-side save picker, secrets storage | Explicitly unsupported |

This is a feasibility implementation, not a claim that all extension functions have been validated. No live chat was submitted and no account was authenticated during development. A separate PC, trusted deployment TLS, actual reconnect during a running turn, host crash recovery, large attachments and account-backed functionality still require the acceptance pass in maintenance.md.
