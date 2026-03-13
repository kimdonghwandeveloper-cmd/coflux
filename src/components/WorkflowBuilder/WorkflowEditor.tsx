import { useState } from "react";
import { Plus, ArrowLeft, AlertCircle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { BlockCard } from "./BlockCard";
import { WorkflowDefinitionSchema, type WorkflowData } from "../../lib/workflow_engine/types";

// ── Internal editor types (with _uid for dnd-kit) ────────────

type EditorTrigger =
  | { type: "peer_data_received"; filter?: { content_type?: string } }
  | { type: "user_status_changed"; filter?: { to_status?: "Active" | "Away" | "" } };

type EditorCondition =
  | { _uid: string; type: "always" }
  | { _uid: string; type: "content_length_gt"; value: number };

type EditorAction =
  | { _uid: string; type: "notify_desktop"; params: { title: string; body: string } }
  | { _uid: string; type: "save_to_db"; params: { collection: string } }
  | { _uid: string; type: "send_peer_message"; params: { message: string } }
  | { _uid: string; type: "log_event"; params: { message: string } };

interface EditorState {
  name: string;
  trigger: EditorTrigger;
  conditions: EditorCondition[];
  actions: EditorAction[];
}

// ── Defaults ─────────────────────────────────────────────────

const defaultTrigger = (type: EditorTrigger["type"]): EditorTrigger => {
  if (type === "user_status_changed")
    return { type, filter: { to_status: "" } };
  return { type: "peer_data_received", filter: { content_type: "" } };
};

const defaultCondition = (): EditorCondition => ({
  _uid: crypto.randomUUID(),
  type: "always",
});

const defaultAction = (): EditorAction => ({
  _uid: crypto.randomUUID(),
  type: "notify_desktop",
  params: { title: "New Event", body: "A workflow event was triggered." },
});

// ── Helpers ───────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid var(--border-color)",
  background: "var(--bg-primary)",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = { ...inputStyle };

const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <span style={{ fontSize: "12px", color: "var(--text-secondary)", minWidth: "70px", flexShrink: 0 }}>
      {label}
    </span>
    <div style={{ flex: 1 }}>{children}</div>
  </div>
);

// ── Condition form ────────────────────────────────────────────

const ConditionFields = ({
  cond,
  onChange,
}: {
  cond: EditorCondition;
  onChange: (c: EditorCondition) => void;
}) => (
  <>
    <FieldRow label="Type">
      <select
        style={selectStyle}
        value={cond.type}
        onChange={(e) => {
          const t = e.target.value as EditorCondition["type"];
          onChange(
            t === "content_length_gt"
              ? { _uid: cond._uid, type: "content_length_gt", value: 100 }
              : { _uid: cond._uid, type: "always" }
          );
        }}
      >
        <option value="always">Always (no condition)</option>
        <option value="content_length_gt">Content Length &gt;</option>
      </select>
    </FieldRow>
    {cond.type === "content_length_gt" && (
      <FieldRow label="Min chars">
        <input
          type="number"
          style={inputStyle}
          value={cond.value}
          min={1}
          onChange={(e) =>
            onChange({ ...cond, value: Math.max(1, parseInt(e.target.value) || 1) })
          }
        />
      </FieldRow>
    )}
  </>
);

// ── Action form ───────────────────────────────────────────────

const ActionFields = ({
  action,
  onChange,
}: {
  action: EditorAction;
  onChange: (a: EditorAction) => void;
}) => {
  const changeType = (t: EditorAction["type"]) => {
    const uid = action._uid;
    if (t === "notify_desktop")
      onChange({ _uid: uid, type: t, params: { title: "New Event", body: "Event triggered." } });
    else if (t === "save_to_db")
      onChange({ _uid: uid, type: t, params: { collection: "" } });
    else if (t === "send_peer_message")
      onChange({ _uid: uid, type: t, params: { message: "" } });
    else
      onChange({ _uid: uid, type: "log_event", params: { message: "" } });
  };

  return (
    <>
      <FieldRow label="Type">
        <select style={selectStyle} value={action.type} onChange={(e) => changeType(e.target.value as EditorAction["type"])}>
          <option value="notify_desktop">Desktop Notification</option>
          <option value="save_to_db">Save to Database</option>
          <option value="send_peer_message">Send to Peer</option>
          <option value="log_event">Log Event</option>
        </select>
      </FieldRow>

      {action.type === "notify_desktop" && (
        <>
          <FieldRow label="Title">
            <input
              style={inputStyle}
              value={action.params.title}
              onChange={(e) => onChange({ ...action, params: { ...action.params, title: e.target.value } })}
            />
          </FieldRow>
          <FieldRow label="Body">
            <input
              style={inputStyle}
              value={action.params.body}
              onChange={(e) => onChange({ ...action, params: { ...action.params, body: e.target.value } })}
            />
          </FieldRow>
        </>
      )}

      {action.type === "save_to_db" && (
        <FieldRow label="Collection">
          <input
            style={inputStyle}
            placeholder="default"
            value={action.params.collection}
            onChange={(e) => onChange({ ...action, params: { collection: e.target.value } })}
          />
        </FieldRow>
      )}

      {action.type === "send_peer_message" && (
        <FieldRow label="Message">
          <input
            style={inputStyle}
            value={action.params.message}
            onChange={(e) => onChange({ ...action, params: { message: e.target.value } })}
          />
        </FieldRow>
      )}

      {action.type === "log_event" && (
        <FieldRow label="Label">
          <input
            style={inputStyle}
            placeholder="optional label"
            value={action.params.message}
            onChange={(e) => onChange({ ...action, params: { message: e.target.value } })}
          />
        </FieldRow>
      )}
    </>
  );
};

// ── Section header ────────────────────────────────────────────

const SectionHeader = ({ label, color }: { label: string; color: string }) => (
  <div
    style={{
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "1px",
      color,
      marginBottom: "8px",
    }}
  >
    {label}
  </div>
);

// ── Main editor ───────────────────────────────────────────────

interface WorkflowEditorProps {
  workflow: WorkflowData | null;
  onSave: (wf: WorkflowData) => void;
  onCancel: () => void;
}

export const WorkflowEditor = ({ workflow, onSave, onCancel }: WorkflowEditorProps) => {
  const initState = (): EditorState => {
    if (workflow) {
      try {
        const def = JSON.parse(workflow.definition);
        return {
          name: workflow.name,
          trigger: def.trigger ?? { type: "peer_data_received", filter: {} },
          conditions: (def.conditions ?? []).map((c: object) => ({ ...c, _uid: crypto.randomUUID() })),
          actions: (def.actions ?? []).map((a: object) => ({ ...a, _uid: crypto.randomUUID() })),
        };
      } catch {
        // fall through to defaults
      }
    }
    return {
      name: "",
      trigger: { type: "peer_data_received", filter: { content_type: "" } },
      conditions: [],
      actions: [defaultAction()],
    };
  };

  const [state, setState] = useState<EditorState>(initState);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateCondition = (uid: string, updated: EditorCondition) =>
    setState((s) => ({ ...s, conditions: s.conditions.map((c) => (c._uid === uid ? updated : c)) }));

  const removeCondition = (uid: string) =>
    setState((s) => ({ ...s, conditions: s.conditions.filter((c) => c._uid !== uid) }));

  const updateAction = (uid: string, updated: EditorAction) =>
    setState((s) => ({ ...s, actions: s.actions.map((a) => (a._uid === uid ? updated : a)) }));

  const removeAction = (uid: string) =>
    setState((s) => ({ ...s, actions: s.actions.filter((a) => a._uid !== uid) }));

  const handleDragEnd = (list: "conditions" | "actions") => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setState((s) => {
      const items = s[list] as Array<{ _uid: string }>;
      const oldIdx = items.findIndex((i) => i._uid === active.id);
      const newIdx = items.findIndex((i) => i._uid === over.id);
      return { ...s, [list]: arrayMove(items, oldIdx, newIdx) };
    });
  };

  const handleSave = () => {
    setError(null);
    if (!state.name.trim()) { setError("Workflow name is required."); return; }
    if (state.actions.length === 0) { setError("At least one action is required."); return; }

    // Strip _uid before serializing
    const definition = {
      id: workflow ? JSON.parse(workflow.definition).id : crypto.randomUUID(),
      name: state.name.trim(),
      enabled: true,
      trigger: state.trigger,
      conditions: state.conditions.map(({ _uid: _, ...rest }) => rest),
      actions: state.actions.map(({ _uid: _, ...rest }) => rest),
    };

    const parsed = WorkflowDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setError(`Validation: ${first.path.join(".")} — ${first.message}`);
      return;
    }

    const now = new Date().toISOString();
    const wfData: WorkflowData = {
      id: workflow?.id ?? crypto.randomUUID(),
      name: state.name.trim(),
      enabled: workflow?.enabled ?? true,
      definition: JSON.stringify(parsed.data),
      createdAt: workflow?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(wfData);
  };

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Name */}
      <div>
        <label style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
          Workflow Name
        </label>
        <input
          style={{ ...inputStyle, fontSize: "15px", fontWeight: 500 }}
          placeholder="e.g. Code received → notify"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
        />
      </div>

      {/* WHEN */}
      <div>
        <SectionHeader label="When" color="var(--accent)" />
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <FieldRow label="Event">
            <select
              style={selectStyle}
              value={state.trigger.type}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  trigger: defaultTrigger(e.target.value as EditorTrigger["type"]),
                }))
              }
            >
              <option value="peer_data_received">Peer Data Received</option>
              <option value="user_status_changed">User Status Changed</option>
            </select>
          </FieldRow>

          {state.trigger.type === "peer_data_received" && (
            <FieldRow label="Content type">
              <input
                style={inputStyle}
                placeholder="any (optional)"
                value={state.trigger.filter?.content_type ?? ""}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    trigger: { ...s.trigger, filter: { content_type: e.target.value } } as EditorTrigger,
                  }))
                }
              />
            </FieldRow>
          )}

          {state.trigger.type === "user_status_changed" && (
            <FieldRow label="To status">
              <select
                style={selectStyle}
                value={(state.trigger as { type: "user_status_changed"; filter?: { to_status?: string } }).filter?.to_status ?? ""}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    trigger: {
                      ...s.trigger,
                      filter: { to_status: e.target.value as "Active" | "Away" | "" },
                    } as EditorTrigger,
                  }))
                }
              >
                <option value="">Any transition</option>
                <option value="Active">Becomes Active</option>
                <option value="Away">Becomes Away</option>
              </select>
            </FieldRow>
          )}
        </div>
      </div>

      {/* IF */}
      <div>
        <SectionHeader label="If" color="#805ad5" />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd("conditions")}
        >
          <SortableContext
            items={state.conditions.map((c) => c._uid)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
              {state.conditions.map((cond) => (
                <BlockCard
                  key={cond._uid}
                  uid={cond._uid}
                  label={cond.type === "always" ? "Always" : `Content length > ${(cond as { value: number }).value}`}
                  accent="#805ad5"
                  onDelete={() => removeCondition(cond._uid)}
                >
                  <ConditionFields
                    cond={cond}
                    onChange={(updated) => updateCondition(cond._uid, updated)}
                  />
                </BlockCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          onClick={() => setState((s) => ({ ...s, conditions: [...s.conditions, defaultCondition()] }))}
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}
        >
          <Plus size={13} /> Add Condition
        </button>
      </div>

      {/* THEN */}
      <div>
        <SectionHeader label="Then" color="#38a169" />
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd("actions")}
        >
          <SortableContext
            items={state.actions.map((a) => a._uid)}
            strategy={verticalListSortingStrategy}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
              {state.actions.map((action) => (
                <BlockCard
                  key={action._uid}
                  uid={action._uid}
                  label={action.type.replace(/_/g, " ")}
                  accent="#38a169"
                  onDelete={() => removeAction(action._uid)}
                >
                  <ActionFields
                    action={action}
                    onChange={(updated) => updateAction(action._uid, updated)}
                  />
                </BlockCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          onClick={() => setState((s) => ({ ...s, actions: [...s.actions, defaultAction()] }))}
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-secondary)", background: "transparent", border: "none", cursor: "pointer", padding: "4px 0" }}
        >
          <Plus size={13} /> Add Action
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "6px", background: "rgba(229,62,62,0.08)", border: "1px solid rgba(229,62,62,0.3)", color: "#e53e3e", fontSize: "13px" }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Footer buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "4px", borderTop: "1px solid var(--border-color)" }}>
        <button
          onClick={onCancel}
          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "transparent", color: "var(--text-secondary)", fontSize: "13px", cursor: "pointer" }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          onClick={handleSave}
          style={{ padding: "8px 20px", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
        >
          Save Workflow
        </button>
      </div>
    </div>
  );
};
