import type { EventContext } from "../types";

// Desktop notification via the browser Notification API.
// Tauri webview exposes this API on all platforms.
// Falls back silently if the user has denied the permission.

export async function notifyDesktop(
  params: { title: string; body: string },
  _ctx: EventContext
): Promise<void> {
  if (!("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    new Notification(params.title, { body: params.body });
  }
}
