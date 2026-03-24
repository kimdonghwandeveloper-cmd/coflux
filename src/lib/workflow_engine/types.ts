import { z } from "zod";

// ── Trigger Schemas ──────────────────────────────────────────

export const PeerDataReceivedTriggerSchema = z.object({
  type: z.literal("peer_data_received"),
  filter: z
    .object({
      content_type: z.string().optional(),
    })
    .optional(),
});

export const UserStatusChangedTriggerSchema = z.object({
  type: z.literal("user_status_changed"),
  filter: z
    .object({
      to_status: z.enum(["Active", "Away"]).optional(),
    })
    .optional(),
});

export const TriggerSchema = z.discriminatedUnion("type", [
  PeerDataReceivedTriggerSchema,
  UserStatusChangedTriggerSchema,
]);

// ── Condition Schemas ────────────────────────────────────────

export const AlwaysConditionSchema = z.object({
  type: z.literal("always"),
});

export const ContentLengthGtConditionSchema = z.object({
  type: z.literal("content_length_gt"),
  value: z.number().int().positive(),
});

export const ConditionSchema = z.discriminatedUnion("type", [
  AlwaysConditionSchema,
  ContentLengthGtConditionSchema,
]);

// ── Action Schemas ───────────────────────────────────────────

// Allowed action types (Stage 1 whitelist — no user scripting)
export const NotifyDesktopActionSchema = z.object({
  type: z.literal("notify_desktop"),
  params: z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(500),
  }),
});

export const SaveToDbActionSchema = z.object({
  type: z.literal("save_to_db"),
  params: z.object({
    collection: z.string().optional(),
  }),
});

export const SendPeerMessageActionSchema = z.object({
  type: z.literal("send_peer_message"),
  params: z.object({
    message: z.string().min(1).max(1000),
  }),
});

export const LogEventActionSchema = z.object({
  type: z.literal("log_event"),
  params: z
    .object({
      message: z.string().optional(),
    })
    .optional(),
});

export const RunScriptActionSchema = z.object({
  type: z.literal("run_script"),
  params: z.object({
    code: z.string().min(1),
  }),
});

export const ActionSchema = z.discriminatedUnion("type", [
  NotifyDesktopActionSchema,
  SaveToDbActionSchema,
  SendPeerMessageActionSchema,
  LogEventActionSchema,
  RunScriptActionSchema,
]);

// ── Workflow Definition Schema ───────────────────────────────

export const WorkflowDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  trigger: TriggerSchema,
  conditions: z.array(ConditionSchema).default([]),
  actions: z.array(ActionSchema).min(1),
  ui: z
    .object({
      nodes: z.array(z.any()),
      edges: z.array(z.any()),
    })
    .optional(),
});

// ── IPC Data Schema (Rust ↔ TypeScript) ─────────────────────

export const WorkflowDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  definition: z.string(), // JSON-serialized WorkflowDefinition
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WorkflowLogEntrySchema = z.object({
  id: z.number().nullable().optional(),
  workflowId: z.string(),
  triggerType: z.string(),
  status: z.enum(["success", "error", "skipped"]),
  detail: z.string().nullable().optional(),
  executedAt: z.string(),
});

// ── Event Context ────────────────────────────────────────────
// The data that flows through the pipeline at execution time

export const EventContextSchema = z.object({
  triggerType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  timestamp: z.string(),
});

// ── TypeScript Types ─────────────────────────────────────────

export type Trigger = z.infer<typeof TriggerSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
export type WorkflowData = z.infer<typeof WorkflowDataSchema>;
export type WorkflowLogEntry = z.infer<typeof WorkflowLogEntrySchema>;
export type EventContext = z.infer<typeof EventContextSchema>;
