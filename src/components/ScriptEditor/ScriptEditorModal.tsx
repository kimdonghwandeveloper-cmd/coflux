import { useState, useEffect, useRef } from "react";
import { X, Play, Plus, Trash2, Save, Terminal, Code2, Loader } from "lucide-react";
import { scriptingEngine } from "../../lib/scripting_engine/engine";
import type { ScriptData, LogEntry, ExecutionResult } from "../../lib/scripting_engine/types";

const STARTER_CODE = `// bridge API is available as 'bridge'
// Example: log system info and send to peers
bridge.log.info("Script started");

const peers = await bridge.peers.list();
bridge.log.info(\`Connected peers: \${peers.length}\`);

if (peers.length > 0) {
  await bridge.notify.send("Script Running", "Hello from your workflow script!");
}

bridge.log.info("Done");
`;

const LOG_COLORS: Record<string, string> = {
  info: "var(--text-primary)",
  warn: "#d69e2e",
  error: "#e53e3e",
};

export const ScriptEditorModal = ({ onClose }: { onClose: () => void }) => {
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [code, setCode] = useState(STARTER_CODE);
  const [name, setName] = useState("Untitled Script");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scriptingEngine.getScripts().then((list) => {
      setScripts(list);
      if (list.length > 0) loadScript(list[0]);
    });
  }, []);

  // Auto-scroll console on new logs
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const loadScript = (s: ScriptData) => {
    setActiveId(s.id);
    setName(s.name);
    setCode(s.code);
    setResult(null);
    setLogs([]);
  };

  const handleNew = () => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const newScript: ScriptData = {
      id,
      name: "Untitled Script",
      code: STARTER_CODE,
      createdAt: now,
      updatedAt: now,
    };
    setScripts((prev) => [newScript, ...prev]);
    setActiveId(id);
    setName(newScript.name);
    setCode(newScript.code);
    setResult(null);
    setLogs([]);
  };

  const handleSave = async () => {
    const now = new Date().toISOString();
    const existing = scripts.find((s) => s.id === activeId);
    const script: ScriptData = {
      id: activeId ?? crypto.randomUUID(),
      name,
      code,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await scriptingEngine.saveScript(script);
    // Update local state in-place — preserves unsaved scripts in the list
    setScripts((prev) =>
      prev.some((s) => s.id === script.id)
        ? prev.map((s) => (s.id === script.id ? script : s))
        : [...prev, script]
    );
    setActiveId(script.id);
  };

  const handleDelete = async (id: string) => {
    // Update local state directly — avoids DB re-fetch wiping unsaved scripts
    const updated = scripts.filter((s) => s.id !== id);
    setScripts(updated);

    // Best-effort DB delete (no-op if script was never saved)
    scriptingEngine.deleteScript(id).catch(() => {});

    if (activeId === id) {
      if (updated.length > 0) loadScript(updated[0]);
      else handleNew();
    }
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setResult(null);
    setLogs([]);

    const now = new Date().toISOString();
    const script: ScriptData = {
      id: activeId ?? crypto.randomUUID(),
      name,
      code,
      createdAt: now,
      updatedAt: now,
    };

    const out = await scriptingEngine.run(script, (entry) => {
      setLogs((prev) => [...prev, entry]);
    });

    setResult(out);
    setRunning(false);
  };

  const activeScript = scripts.find((s) => s.id === activeId);
  const isDirty = activeScript ? activeScript.code !== code || activeScript.name !== name : true;

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
        style={{
          background: "var(--bg-primary)",
          borderRadius: "12px",
          width: "960px",
          height: "75vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
          border: "1px solid var(--border-color)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-color)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Code2 size={18} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Script Editor</h2>
            <span
              style={{
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "4px",
                background: "rgba(var(--accent-rgb, 99,102,241),0.12)",
                color: "var(--accent)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Sandbox
            </span>
          </div>
          <div onClick={onClose} style={{ cursor: "pointer", padding: "4px" }}>
            <X size={18} color="var(--text-secondary)" />
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left: Script list */}
          <div
            style={{
              width: "220px",
              flexShrink: 0,
              borderRight: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--text-secondary)",
                }}
              >
                Scripts
              </span>
              <div onClick={handleNew} style={{ cursor: "pointer", padding: "2px" }}>
                <Plus size={14} color="var(--text-secondary)" />
              </div>
            </div>

            <div style={{ overflow: "auto", flex: 1, padding: "6px" }}>
              {scripts.length === 0 && (
                <div style={{ padding: "12px 8px", fontSize: "12px", color: "var(--text-secondary)", textAlign: "center" }}>
                  No scripts yet
                </div>
              )}
              {scripts.map((s) => (
                <div
                  key={s.id}
                  onClick={() => loadScript(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: activeId === s.id ? "var(--bg-secondary)" : "transparent",
                    border: activeId === s.id ? "1px solid var(--border-color)" : "1px solid transparent",
                    marginBottom: "2px",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: "13px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </span>
                  <div
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    style={{ padding: "2px", opacity: 0.5, flexShrink: 0 }}
                  >
                    <Trash2 size={12} color="var(--text-secondary)" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Editor + Console */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Editor toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-color)",
                flexShrink: 0,
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  flex: 1,
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--text-primary)",
                }}
              />
              {isDirty && (
                <button
                  onClick={handleSave}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "5px 10px",
                    borderRadius: "5px",
                    border: "1px solid var(--border-color)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  <Save size={12} /> Save
                </button>
              )}
              <button
                onClick={handleRun}
                disabled={running}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "5px 14px",
                  borderRadius: "5px",
                  border: "none",
                  background: running ? "var(--border-color)" : "var(--accent)",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: running ? "not-allowed" : "pointer",
                }}
              >
                {running ? <Loader size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Play size={12} fill="white" />}
                {running ? "Running..." : "Run"}
              </button>
            </div>

            {/* Code textarea */}
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                padding: "14px 16px",
                fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                fontSize: "13px",
                lineHeight: "1.6",
                border: "none",
                outline: "none",
                resize: "none",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                tabSize: 2,
              }}
            />

            {/* Console output */}
            <div
              style={{
                height: "180px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 12px",
                  borderBottom: "1px solid var(--border-color)",
                  background: "var(--bg-secondary)",
                  flexShrink: 0,
                }}
              >
                <Terminal size={12} color="var(--text-secondary)" />
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Console
                </span>
                {result && (
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: result.success ? "#38a169" : "#e53e3e",
                    }}
                  >
                    {result.success ? "✓ Success" : "✗ Error"}
                  </span>
                )}
              </div>
              <div
                ref={consoleRef}
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "8px 12px",
                  fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  fontSize: "12px",
                  lineHeight: "1.6",
                  background: "var(--bg-secondary)",
                }}
              >
                {logs.length === 0 && !result && (
                  <span style={{ color: "var(--text-secondary)", opacity: 0.5 }}>
                    Output will appear here...
                  </span>
                )}
                {logs.map((entry, i) => (
                  <div key={i} style={{ color: LOG_COLORS[entry.level] ?? "inherit" }}>
                    <span style={{ opacity: 0.4, fontSize: "10px", marginRight: "8px" }}>
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    [{entry.level.toUpperCase()}] {entry.message}
                  </div>
                ))}
                {result?.error && (
                  <div style={{ color: "#e53e3e", marginTop: "4px" }}>
                    ✗ {result.error}
                  </div>
                )}
                {result?.success && result.value !== null && result.value !== undefined && (
                  <div style={{ color: "#38a169", marginTop: "4px" }}>
                    → {JSON.stringify(result.value)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
