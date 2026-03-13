import { invoke } from "@tauri-apps/api/core";
import type { EventContext } from "../types";

// Sends a message to all connected peers via the existing WebRTC DataChannel.
// No new IPC surface — reuses the send_message command from webrtc_core.rs.

export async function sendPeerMessage(
  params: { message: string },
  _ctx: EventContext
): Promise<void> {
  await invoke("send_message", { msg: params.message });
}
