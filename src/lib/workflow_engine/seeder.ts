import { invoke } from "@tauri-apps/api/core";
import { PRESETS } from "./presets";
import type { WorkflowData } from "./types";

// Inserts preset workflows on first launch only.
// Runs only when the workflows table is completely empty —
// if a user deletes presets they are NOT re-inserted on next launch.

export async function seedPresets(): Promise<void> {
  try {
    const existing = await invoke<WorkflowData[]>("get_workflows");
    if (existing.length > 0) return;

    const now = new Date().toISOString();

    for (const def of PRESETS) {
      const wf: WorkflowData = {
        id: def.id,
        name: def.name,
        enabled: def.enabled,
        definition: JSON.stringify(def),
        createdAt: now,
        updatedAt: now,
      };
      await invoke("save_workflow", { workflow: wf });
    }

    console.log(`[Seeder] Inserted ${PRESETS.length} preset workflows.`);
  } catch (err) {
    console.error("[Seeder] Failed to seed presets:", err);
  }
}
