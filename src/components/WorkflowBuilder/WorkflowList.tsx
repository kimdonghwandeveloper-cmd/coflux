import { useState } from "react";
import { Plus, Pencil, Trash2, Zap, ChevronDown } from "lucide-react";
import type { WorkflowData, WorkflowDefinition } from "../../lib/workflow_engine/types";
import { WorkflowDefinitionSchema } from "../../lib/workflow_engine/types";
import { PRESETS } from "../../lib/workflow_engine/presets";

interface WorkflowListProps {
  workflows: WorkflowData[];
  onNew: () => void;
  onNewFromPreset: (presetId: string) => void;
  onEdit: (id: string) => void;
  onToggle: (wf: WorkflowData) => void;
  onDelete: (id: string) => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  peer_data_received: "Peer Data Received",
  user_status_changed: "User Status Changed",
};

function parseDef(raw: string): WorkflowDefinition | null {
  try {
    const result = WorkflowDefinitionSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const Toggle = ({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: () => void;
}) => (
  <div
    onClick={onChange}
    style={{
      width: "36px",
      height: "20px",
      borderRadius: "10px",
      background: enabled ? "var(--accent)" : "var(--border-color)",
      cursor: "pointer",
      position: "relative",
      transition: "background 0.2s",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: "2px",
        left: enabled ? "18px" : "2px",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: "white",
        transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }}
    />
  </div>
);

export const WorkflowList = ({
  workflows,
  onNew,
  onNewFromPreset,
  onEdit,
  onToggle,
  onDelete,
}: WorkflowListProps) => {
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  return (
    <div style={{ padding: "20px 24px" }}>
      {workflows.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            padding: "48px 0",
            color: "var(--text-secondary)",
          }}
        >
          <Zap size={32} style={{ opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: "14px" }}>No workflows yet</p>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.7 }}>
            Create one to automate your P2P events
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {workflows.map((wf) => {
            const def = parseDef(wf.definition);
            return (
              <div
                key={wf.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  opacity: wf.enabled ? 1 : 0.55,
                }}
              >
                {/* Name + trigger badge */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {wf.name}
                  </div>
                  {def && (
                    <div
                      style={{
                        marginTop: "4px",
                        display: "inline-block",
                        fontSize: "11px",
                        padding: "2px 7px",
                        borderRadius: "4px",
                        background: "var(--accent)",
                        color: "white",
                        opacity: 0.8,
                      }}
                    >
                      {TRIGGER_LABELS[def.trigger.type] ?? def.trigger.type}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <Toggle enabled={wf.enabled} onChange={() => onToggle(wf)} />

                <div
                  onClick={() => onEdit(wf.id)}
                  style={{ cursor: "pointer", padding: "4px", borderRadius: "4px" }}
                >
                  <Pencil size={15} color="var(--text-secondary)" />
                </div>

                <div
                  onClick={() => onDelete(wf.id)}
                  style={{ cursor: "pointer", padding: "4px", borderRadius: "4px" }}
                >
                  <Trash2 size={15} color="var(--error, #e53e3e)" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom action row */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onNew}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 14px",
            borderRadius: "6px",
            border: "1px dashed var(--border-color)",
            background: "transparent",
            color: "var(--text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
            justifyContent: "center",
          }}
        >
          <Plus size={14} />
          New Workflow
        </button>

        {/* Preset picker */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setPresetMenuOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "13px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Zap size={13} />
            프리셋
            <ChevronDown size={12} />
          </button>

          {presetMenuOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 6px)",
                right: 0,
                width: "260px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                zIndex: 10,
                padding: "4px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  padding: "6px 10px 4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--text-secondary)",
                }}
              >
                프리셋으로 시작
              </div>
              {PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => {
                    onNewFromPreset(preset.id);
                    setPresetMenuOpen(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--bg-secondary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {preset.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
