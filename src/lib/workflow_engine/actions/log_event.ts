import { invoke } from "@tauri-apps/api/core";
import type { EventContext, WorkflowLogEntry } from "../types";

// Writes a structured entry to workflow_logs for audit/debug purposes.

export async function logEvent(
  params: { message?: string } | undefined,
  ctx: EventContext,
  workflowId: string
): Promise<void> {
  const detail = params?.message
    ? `${params.message} | ${JSON.stringify(ctx.payload)}`
    : JSON.stringify(ctx.payload);

  const log: WorkflowLogEntry = {
    workflowId,
    triggerType: ctx.triggerType,
    status: "success",
    detail,
    executedAt: new Date().toISOString(),
  };

  await invoke("log_workflow_execution", { log });
}
