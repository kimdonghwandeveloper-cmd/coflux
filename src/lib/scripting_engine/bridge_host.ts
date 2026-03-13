// Main-thread handler for bridge_call messages coming from the Worker.
// Executes real Tauri IPC and returns results — the Worker never touches IPC directly.

import { invoke } from "@tauri-apps/api/core";

export interface BridgeCallMsg {
  type: "bridge_call";
  id: number;
  method: string;
  args: unknown[];
}

export async function handleBridgeCall(
  worker: Worker,
  msg: BridgeCallMsg,
  scriptId: string
): Promise<void> {
  try {
    const result = await dispatch(msg.method, msg.args, scriptId);
    worker.postMessage({ type: "bridge_response", id: msg.id, result });
  } catch (err) {
    worker.postMessage({ type: "bridge_response", id: msg.id, error: String(err) });
  }
}

async function dispatch(
  method: string,
  args: unknown[],
  scriptId: string
): Promise<unknown> {
  switch (method) {
    // ── Clipboard ──────────────────────────────────────────
    case "clipboard.read":
      return await invoke<string>("read_clipboard_sdp");

    // ── Peers ──────────────────────────────────────────────
    case "peers.list":
      return await invoke<unknown[]>("list_peers");

    case "peers.send": {
      const [, message] = args as [string, string];
      await invoke("send_message", { msg: message });
      return true;
    }

    // ── AI (stubs — local model not yet connected) ─────────
    case "ai.summarize":
      return `[AI stub] ${String(args[0]).substring(0, 80)}...`;

    case "ai.classify":
      return (args[1] as string[])[0] ?? "unknown";

    case "ai.scan":
      return { safe: true, score: 0, reason: "stub" };

    // ── Script-isolated storage ────────────────────────────
    case "storage.get":
      return await invoke<string | null>("script_storage_get", {
        scriptId,
        key: args[0] as string,
      });

    case "storage.set":
      await invoke("script_storage_set", {
        scriptId,
        key: args[0] as string,
        value: args[1] as string,
      });
      return null;

    case "storage.delete":
      await invoke("script_storage_delete", {
        scriptId,
        key: args[0] as string,
      });
      return null;

    // ── Notifications ──────────────────────────────────────
    case "notify.send": {
      const [title, body] = args as [string, string];
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body });
      }
      return null;
    }

    case "notify.sendToMobile":
      // Stub — mobile push not yet connected
      return null;

    default:
      throw new Error(`Unknown bridge method: ${method}`);
  }
}
