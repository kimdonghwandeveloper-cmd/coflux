import { invoke } from "@tauri-apps/api/core";
import type { EventContext, WorkflowLogEntry } from "../types";

// Persists the event payload to workflow_logs under the specified collection.
// "save_to_db" in Stage 1 maps to a structured log entry — a dedicated
// received_items table will be added in a later stage if needed.

export async function saveToDb(
  params: { collection?: string },
  ctx: EventContext,
  workflowId: string
): Promise<void> {
  const detail = JSON.stringify({
    collection: params.collection ?? "default",
    payload: ctx.payload,
  });

  const log: WorkflowLogEntry = {
    workflowId,
    triggerType: ctx.triggerType,
    status: "success",
    detail,
    executedAt: new Date().toISOString(),
  };

  await invoke("log_workflow_execution", { log });
}
