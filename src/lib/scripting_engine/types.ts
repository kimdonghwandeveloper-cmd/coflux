import { z } from "zod";

export const ScriptDataSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ScriptData = z.infer<typeof ScriptDataSchema>;

export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
}

export interface ExecutionResult {
  success: boolean;
  value?: unknown;
  error?: string;
  logs: LogEntry[];
}
