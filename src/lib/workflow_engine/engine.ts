import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  WorkflowDefinitionSchema,
  WorkflowDataSchema,
  type WorkflowDefinition,
  type Trigger,
  type Condition,
  type EventContext,
  type WorkflowLogEntry,
} from "./types";
import { executeAction } from "./actions";

export class WorkflowEngine {
  private workflows: WorkflowDefinition[] = [];
  private unlisteners: Array<() => void> = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.loadWorkflows();
    await this.attachListeners();
    this.initialized = true;
    console.log(
      `[WorkflowEngine] Initialized with ${this.workflows.length} active workflow(s).`
    );
  }

  // Reload workflows from DB and re-attach listeners (call after saving/deleting a workflow).
  async reload(): Promise<void> {
    this.detachListeners();
    this.initialized = false;
    await this.init();
  }

  destroy(): void {
    this.detachListeners();
    this.workflows = [];
    this.initialized = false;
  }

  // ── Private ──────────────────────────────────────────────

  private async loadWorkflows(): Promise<void> {
    const rawList = await invoke<unknown[]>("get_workflows");

    this.workflows = rawList
      .map((raw) => {
        const parsed = WorkflowDataSchema.safeParse(raw);
        if (!parsed.success) return null;

        const defParsed = WorkflowDefinitionSchema.safeParse(
          JSON.parse(parsed.data.definition)
        );
        if (!defParsed.success) {
          console.warn(
            `[WorkflowEngine] Invalid workflow definition for id "${(raw as { id?: string }).id}":`,
            defParsed.error.issues
          );
          return null;
        }
        return defParsed.data;
      })
      .filter((w): w is WorkflowDefinition => w !== null && w.enabled);
  }

  private async attachListeners(): Promise<void> {
    // Trigger: peer_data_received
    // Source: webrtc_core.rs emits "webrtc-msg" after security.rs scan passes
    const unlistenPeer = await listen<string>("webrtc-msg", (event) => {
      this.dispatch("peer_data_received", { content: event.payload });
    });
    this.unlisteners.push(unlistenPeer);

    // Trigger: user_status_changed
    // Source: os_hooks.rs emits "user-status-changed" on Active/Away transitions
    const unlistenStatus = await listen<string>(
      "user-status-changed",
      (event) => {
        this.dispatch("user_status_changed", { status: event.payload });
      }
    );
    this.unlisteners.push(unlistenStatus);
  }

  private detachListeners(): void {
    this.unlisteners.forEach((fn) => fn());
    this.unlisteners = [];
  }

  private dispatch(
    triggerType: string,
    payload: Record<string, unknown>
  ): void {
    const ctx: EventContext = {
      triggerType,
      payload,
      timestamp: new Date().toISOString(),
    };

    const matching = this.workflows.filter(
      (w) => w.trigger.type === triggerType
    );

    for (const workflow of matching) {
      this.runWorkflow(workflow, ctx).catch((err) => {
        console.error(
          `[WorkflowEngine] Error in workflow "${workflow.id}":`,
          err
        );
        this.writeErrorLog(workflow.id, ctx, String(err));
      });
    }
  }

  private async runWorkflow(
    workflow: WorkflowDefinition,
    ctx: EventContext
  ): Promise<void> {
    if (!this.passesTriggerFilter(workflow.trigger, ctx)) return;
    if (!this.evaluateConditions(workflow.conditions, ctx)) {
      await this.writeSkippedLog(workflow.id, ctx);
      return;
    }

    for (const action of workflow.actions) {
      await executeAction(action, ctx, workflow.id);
    }
  }

  private passesTriggerFilter(trigger: Trigger, ctx: EventContext): boolean {
    if (
      trigger.type === "user_status_changed" &&
      trigger.filter?.to_status !== undefined
    ) {
      return ctx.payload["status"] === trigger.filter.to_status;
    }
    // peer_data_received: content_type filter reserved for future content detection
    return true;
  }

  private evaluateConditions(
    conditions: Condition[],
    ctx: EventContext
  ): boolean {
    for (const condition of conditions) {
      if (condition.type === "content_length_gt") {
        const content = String(ctx.payload["content"] ?? "");
        if (content.length <= condition.value) return false;
      }
      // "always" always passes — no check needed
    }
    return true;
  }

  private async writeSkippedLog(
    workflowId: string,
    ctx: EventContext
  ): Promise<void> {
    const log: WorkflowLogEntry = {
      workflowId,
      triggerType: ctx.triggerType,
      status: "skipped",
      detail: "Conditions not met",
      executedAt: new Date().toISOString(),
    };
    await invoke("log_workflow_execution", { log }).catch(() => {});
  }

  private async writeErrorLog(
    workflowId: string,
    ctx: EventContext,
    error: string
  ): Promise<void> {
    const log: WorkflowLogEntry = {
      workflowId,
      triggerType: ctx.triggerType,
      status: "error",
      detail: error,
      executedAt: new Date().toISOString(),
    };
    await invoke("log_workflow_execution", { log }).catch(() => {});
  }
}

// Singleton export for use throughout the app
export const workflowEngine = new WorkflowEngine();
