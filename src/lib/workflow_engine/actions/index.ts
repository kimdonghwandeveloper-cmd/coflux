import type { Action, EventContext } from "../types";
import { notifyDesktop } from "./notify";
import { saveToDb } from "./save_db";
import { sendPeerMessage } from "./send_peer";
import { logEvent } from "./log_event";
import { runScript } from "./run_script";

// Action factory — dispatches to the correct handler based on action.type.
// Only ALLOWED_ACTIONS are reachable here; no eval or dynamic dispatch.

const ALLOWED_ACTIONS = [
  "notify_desktop",
  "save_to_db",
  "send_peer_message",
  "log_event",
  "run_script",
] as const;

export type AllowedActionType = (typeof ALLOWED_ACTIONS)[number];

export async function executeAction(
  action: Action,
  ctx: EventContext,
  workflowId: string
): Promise<void> {
  switch (action.type) {
    case "notify_desktop":
      await notifyDesktop(action.params, ctx);
      break;
    case "save_to_db":
      await saveToDb(action.params, ctx, workflowId);
      break;
    case "send_peer_message":
      await sendPeerMessage(action.params, ctx);
      break;
    case "log_event":
      await logEvent(action.params, ctx, workflowId);
      break;
    case "run_script":
      await runScript(action.params, ctx, workflowId);
      break;
    default:
      // TypeScript exhaustiveness check — this branch is unreachable
      action satisfies never;
  }
}
