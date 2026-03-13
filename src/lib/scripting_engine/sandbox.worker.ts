/// <reference lib="webworker" />
// Runs in a Web Worker — completely isolated from the main thread.
// No DOM, no window.__TAURI__, no Node.js APIs are accessible here.

type BridgeCallMsg = { type: "bridge_call"; id: number; method: string; args: unknown[] };
type BridgeResponseMsg = { type: "bridge_response"; id: number; result?: unknown; error?: string };
type ExecuteMsg = { type: "execute"; code: string; scriptId: string };

let _callId = 0;
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function proxyCall(method: string, args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++_callId;
    _pending.set(id, { resolve, reject });
    self.postMessage({ type: "bridge_call", id, method, args } satisfies BridgeCallMsg);
  });
}

// BridgeAPI exposed to user scripts (spec-aligned whitelist)
const bridge = {
  clipboard: {
    read: () => proxyCall("clipboard.read", []),
    onchange: (_cb: (content: string) => void) => {
      bridge.log.warn("clipboard.onchange is not supported in direct execution mode");
    },
  },
  peers: {
    list: () => proxyCall("peers.list", []),
    send: (peerId: string, message: string) => proxyCall("peers.send", [peerId, message]),
    onMessage: (_cb: (from: string, message: string) => void) => {
      bridge.log.warn("peers.onMessage is not supported in direct execution mode");
    },
  },
  ai: {
    summarize: (text: string) => proxyCall("ai.summarize", [text]),
    classify: (text: string, categories: string[]) =>
      proxyCall("ai.classify", [text, categories]),
    scan: (payload: string) => proxyCall("ai.scan", [payload]),
  },
  storage: {
    get: (key: string) => proxyCall("storage.get", [key]),
    set: (key: string, value: string) => proxyCall("storage.set", [key, value]),
    delete: (key: string) => proxyCall("storage.delete", [key]),
  },
  notify: {
    send: (title: string, body: string) => proxyCall("notify.send", [title, body]),
    sendToMobile: (title: string, body: string) =>
      proxyCall("notify.sendToMobile", [title, body]),
  },
  log: {
    info: (message: string) => self.postMessage({ type: "log", level: "info", message }),
    warn: (message: string) => self.postMessage({ type: "log", level: "warn", message }),
    error: (message: string) => self.postMessage({ type: "log", level: "error", message }),
  },
} as const;

// Globals to shadow inside user code scope.
// Listed as parameter names — user code receives `undefined` for all of these.
const BLOCKED_GLOBALS = [
  "eval",
  "Function",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "crypto",
  "performance",
  "location",
  "navigator",
  "self",
  "globalThis",
  "window",
  "document",
] as const;

self.addEventListener("message", async (event: MessageEvent<BridgeResponseMsg | ExecuteMsg>) => {
  const msg = event.data;

  // Route bridge responses back to pending Promises
  if (msg.type === "bridge_response") {
    const p = _pending.get(msg.id);
    if (p) {
      _pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    }
    return;
  }

  if (msg.type === "execute") {
    // Save Function reference BEFORE shadowing it in user scope
    const _Fn = Function;

    try {
      // Build sandboxed executor:
      // User code runs inside a function where all BLOCKED_GLOBALS are
      // shadowed by parameters receiving `undefined` — they cannot reach
      // the real globals even though the Worker has them.
      const fn = new _Fn(
        "bridge",
        ...BLOCKED_GLOBALS,
        `"use strict";\n${msg.code}`
      );

      const result = await fn(bridge, ...BLOCKED_GLOBALS.map(() => undefined));
      self.postMessage({ type: "result", value: result ?? null });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err) });
    }
  }
});
