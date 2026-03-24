import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { WorkflowList } from "./WorkflowList";
import { WorkflowEditor } from "./WorkflowEditor";
import { workflowEngine } from "../../lib/workflow_engine/engine";
import { PRESETS } from "../../lib/workflow_engine/presets";
import type { WorkflowData } from "../../lib/workflow_engine/types";

type ModalView = "list" | "editor";

interface WorkflowBuilderModalProps {
  onClose: () => void;
}

export const WorkflowBuilderModal = ({ onClose }: WorkflowBuilderModalProps) => {
  const [view, setView] = useState<ModalView>("list");
  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = async () => {
    try {
      const list = await invoke<WorkflowData[]>("get_workflows");
      setWorkflows(list);
    } catch (e) {
      console.error("[WorkflowBuilder] Failed to load workflows:", e);
    }
  };

  const handleSave = async (wf: WorkflowData) => {
    try {
      await invoke("save_workflow", { workflow: wf });
      await loadWorkflows();
      await workflowEngine.reload();
      setView("list");
      setEditingId(null);
    } catch (e) {
      console.error("[WorkflowBuilder] Failed to save:", e);
    }
  };

  const handleToggle = async (wf: WorkflowData) => {
    const updated: WorkflowData = { ...wf, enabled: !wf.enabled, updatedAt: new Date().toISOString() };
    try {
      await invoke("save_workflow", { workflow: updated });
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? updated : w)));
      await workflowEngine.reload();
    } catch (e) {
      console.error("[WorkflowBuilder] Failed to toggle:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("delete_workflow", { workflowId: id });
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      await workflowEngine.reload();
    } catch (e) {
      console.error("[WorkflowBuilder] Failed to delete:", e);
    }
  };

  // Opens the editor pre-filled with a copy of the selected preset.
  // The copy gets a new UUID so the original preset entry is not overwritten.
  const handleNewFromPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    const now = new Date().toISOString();
    const copy: WorkflowData = {
      id: crypto.randomUUID(),
      name: `${preset.name} (복사본)`,
      enabled: preset.enabled,
      definition: JSON.stringify({ ...preset, id: crypto.randomUUID(), name: `${preset.name} (복사본)` }),
      createdAt: now,
      updatedAt: now,
    };
    // Temporarily inject into list so WorkflowEditor can load it
    setWorkflows((prev) => [...prev, copy]);
    setEditingId(copy.id);
    setView("editor");
  };

  const editingWorkflow = editingId ? workflows.find((w) => w.id === editingId) ?? null : null;
  const title = view === "list" ? "Workflows" : editingId ? "Edit Workflow" : "New Workflow";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "slideUpFade 0.15s ease-out forwards",
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          borderRadius: "12px",
          width: "720px",
          maxHeight: "80vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-color)",
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>{title}</h2>
          <div onClick={onClose} style={{ cursor: "pointer", padding: "4px" }}>
            <X size={18} color="var(--text-secondary)" />
          </div>
        </div>

        {/* Body */}
        <div style={{ overflow: "auto", flex: 1 }}>
          {view === "list" ? (
            <WorkflowList
              workflows={workflows}
              onNew={() => { setEditingId(null); setView("editor"); }}
              onNewFromPreset={handleNewFromPreset}
              onEdit={(id) => { setEditingId(id); setView("editor"); }}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ) : (
            <WorkflowEditor
              workflow={editingWorkflow}
              onSave={handleSave}
              onCancel={() => { setView("list"); setEditingId(null); }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
