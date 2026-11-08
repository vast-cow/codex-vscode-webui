(() => {
  // Temporary diagnostic: skip excessive JS modulepreload requests at startup.
  // Keep CSS stylesheets and actual module imports intact.
  const originalAppendChild = document.head.appendChild;
  document.head.appendChild = function (node) {
    if (node instanceof HTMLLinkElement && node.rel === "modulepreload") {
      return node;
    }
    return originalAppendChild.call(this, node);
  };

  const pack = (v) =>
    v === undefined
      ? ["u"]
      : v instanceof Uint8Array
        ? ["b", btoa(Array.from(v, (x) => String.fromCharCode(x)).join(""))]
        : v instanceof ArrayBuffer
          ? pack(new Uint8Array(v))
          : Array.isArray(v)
            ? ["a", v.map(pack)]
            : v !== null && typeof v === "object"
              ? ["o", Object.entries(v).map(([k, x]) => [k, pack(x)])]
              : ["v", v];
  const unpack = (v) => {
    switch (v[0]) {
      case "u":
        return undefined;
      case "b":
        return Uint8Array.from(atob(v[1]), (x) => x.charCodeAt(0));
      case "a":
        return v[1].map(unpack);
      case "o":
        return Object.fromEntries(v[1].map(([k, x]) => [k, unpack(x)]));
      case "v":
        return v[1];
      default:
        throw Error("Invalid transport value");
    }
  };
  let state;
  try {
    state = JSON.parse(sessionStorage.getItem("codex-state"));
  } catch {}
  const queue = [];
  let opened = false;
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/?id=${window.__webviewId}`,
  );
  window.acquireVsCodeApi = () => ({
    getState: () => state,
    setState: (v) => {
      state = v;
      sessionStorage.setItem("codex-state", JSON.stringify(v));
      return v;
    },
    postMessage: (m) => {
      const data = JSON.stringify(pack({ kind: "message", value: m }));
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
      else if (!opened) queue.push(data);
      else throw Error("Connection lost; reload to reconnect");
    },
  });
  ws.onopen = () => {
    opened = true;
    for (const item of queue) ws.send(item);
    queue.length = 0;
  };
  ws.onmessage = (e) => {
    const m = unpack(JSON.parse(e.data));
    if (m.type === "message") {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: m.message,
          origin: location.origin,
        }),
      );
    } else if (m.type === "reload") location.reload();
    else if (m.type === "external") {
      const u = new URL(m.url);
      if (["https:", "http:"].includes(u.protocol)) {
        const link = document.createElement("a");
        link.href = u.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Open authentication or external link";
        show(link);
      }
    } else if (m.type === "confirm") {
      const d = document.createElement("dialog");
      d.append(document.createTextNode(m.message));
      for (const choice of [...m.choices, "Cancel"]) {
        const button = document.createElement("button");
        button.textContent = choice;
        button.onclick = () => {
          respond(m, choice === "Cancel" ? undefined : choice);
          d.remove();
        };
        d.append(button);
      }
      d.oncancel = () => respond(m, undefined);
      document.body.append(d);
      d.showModal();
    } else if (m.type === "pick") {
      const d = document.createElement("dialog");
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      const upload = document.createElement("button");
      upload.textContent = "Upload from browser (16 MiB per file)";
      upload.onclick = async () => {
        const files = Array.from(input.files);
        if (files.some((f) => f.size > 16 * 1024 * 1024)) {
          alert("Maximum file size is 16 MiB");
          return;
        }
        respond(
          m,
          await Promise.all(
            files.map(async (f) => ({
              name: f.name,
              bytes: new Uint8Array(await f.arrayBuffer()),
            })),
          ),
        );
        d.remove();
      };
      const server = document.createElement("button");
      server.textContent = "Select a server path";
      server.onclick = () => {
        const p = prompt("Absolute server file path:");
        respond(m, p ? [p] : undefined);
        d.remove();
      };
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.onclick = () => {
        respond(m, undefined);
        d.remove();
      };
      d.oncancel = () => respond(m, undefined);
      d.append(input, upload, server, cancel);
      document.body.append(d);
      d.showModal();
    } else if (m.type === "edit") {
      const d = document.createElement("dialog");
      const text = document.createElement("textarea");
      text.value = m.text;
      text.style.cssText = "width:70vw;height:65vh;display:block";
      const save = document.createElement("button");
      save.textContent = "Save configuration";
      save.onclick = () => {
        respond(m, text.value);
        d.remove();
      };
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.onclick = () => {
        respond(m, undefined);
        d.remove();
      };
      d.oncancel = () => respond(m, undefined);
      d.append(document.createTextNode(m.path), text, save, cancel);
      document.body.append(d);
      d.showModal();
    } else if (m.type === "notice") show(m.message);
    else if (m.type === "preview") {
      const pre = document.createElement("pre");
      pre.textContent = m.path + "\n\n" + m.text;
      show(pre);
      respond(m, undefined);
    } else if (m.type === "clipboard")
      navigator.clipboard.writeText(m.text).catch(() => show(m.text));
  };
  function respond(m, value) {
    ws.send(
      JSON.stringify(pack({ kind: "response", requestId: m.requestId, value })),
    );
  }
  function show(content) {
    const dialog = document.createElement("dialog");
    const close = document.createElement("button");
    close.textContent = "Close";
    close.onclick = () => dialog.remove();
    dialog.append(
      close,
      typeof content === "string" ? document.createTextNode(content) : content,
    );
    document.body.append(dialog);
    dialog.showModal();
  }
  ws.onclose = () => {
    const notice = document.createElement("div");
    notice.className = "connection-notice";
    notice.textContent = "Connection lost. Server work continues. ";
    const reload = document.createElement("button");
    reload.textContent = "Reconnect";
    reload.onclick = () => location.reload();
    notice.append(reload);
    document.body.append(notice);
  };
})();
