import { useState, useEffect, useRef } from "react";
import { X, Play, Plus, Trash2, Save, Terminal, Code2, Loader, Info, ChevronRight } from "lucide-react";
import { scriptingEngine } from "../../lib/scripting_engine/engine";
import type { ScriptData, LogEntry, ExecutionResult } from "../../lib/scripting_engine/types";
import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
// We'll use a CSS-in-JS object to safely inject Prism styles if not already present

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

// Minimal Prism Tomorrow-like theme for dark/light compatibility
const prismStyles = `
  .prism-code {
    pointer-events: none;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.6;
    margin: 0;
    padding: 0;
  }
  .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #909090; }
  .token.punctuation { color: #999; }
  .token.namespace { opacity: .7; }
  .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #c678dd; }
  .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #98c379; }
  .token.operator, .token.entity, .token.url, .language-css .token.string, .style .token.string { color: #d19a66; }
  .token.atrule, .token.attr-value, .token.keyword { color: #61afef; }
  .token.function, .token.class-name { color: #e5c07b; }
  .token.regex, .token.important, .token.variable { color: #e06c75; }
`;

export const ScriptEditorModal = ({ onClose }: { onClose: () => void }) => {
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [code, setCode] = useState(STARTER_CODE);
  const [name, setName] = useState("Untitled Script");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showHelp, setShowHelp] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Custom Undo/Redo stack for the code state
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastSavedCode = useRef(STARTER_CODE);

  // Helper to push to history
  const pushToHistory = (newCode: string) => {
    if (newCode === lastSavedCode.current) return;
    undoStack.current.push(lastSavedCode.current);
    if (undoStack.current.length > 50) undoStack.current.shift(); // Limit stack size
    redoStack.current = []; // Clear redo on new change
    lastSavedCode.current = newCode;
  };

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

  const handleUndo = () => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(code);
    lastSavedCode.current = prev;
    setCode(prev);
  };

  const handleRedo = () => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(code);
    lastSavedCode.current = next;
    setCode(next);
  };

  const handleCodeChange = (newVal: string) => {
    // For standard typing, we might want to debounce history pushing,
    // but for now, we'll push on "significant" pauses or handled keys.
    setCode(newVal);
  };

  // Push to history on blur to capture typing chunks
  const handleBlur = () => {
    pushToHistory(code);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Undo/Redo
    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      pushToHistory(code);
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      const newValue = code.substring(0, start) + "  " + code.substring(end);
      
      setCode(newValue);
      lastSavedCode.current = newValue; // Sync to avoid double push
      setTimeout(() => {
        const target = e.target as HTMLTextAreaElement;
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }

    if (e.key === "Enter") {
      e.preventDefault();
      pushToHistory(code);
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      
      // Find indentation of current line
      const lines = code.substring(0, start).split("\n");
      const currentLine = lines[lines.length - 1];
      const indentMatch = currentLine.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : "";
      
      const newValue = code.substring(0, start) + "\n" + indent + code.substring(end);
      setCode(newValue);
      lastSavedCode.current = newValue;

      setTimeout(() => {
        const target = e.target as HTMLTextAreaElement;
        target.selectionStart = target.selectionEnd = start + 1 + indent.length;
      }, 0);
    }
  };

  const highlightedCode = Prism.highlight(code, Prism.languages.javascript, 'javascript');

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
        className="glass-panel"
        style={{
          borderRadius: "12px",
          width: "960px",
          height: "75vh",
          display: "flex",
          flexDirection: "column",
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
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div 
              onClick={() => setShowHelp(!showHelp)} 
              title="API Documentation"
              style={{ cursor: "pointer", padding: "4px", borderRadius: "4px", background: showHelp ? "var(--accent)" : "transparent", display: "flex", transition: "all 0.2s" }}
            >
              <Info size={18} color={showHelp ? "white" : "var(--text-secondary)"} />
            </div>
            <div onClick={onClose} style={{ cursor: "pointer", padding: "4px" }}>
              <X size={18} color="var(--text-secondary)" />
            </div>
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
                onClick={() => setShowHelp(!showHelp)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 10px",
                  borderRadius: "5px",
                  border: "1px solid var(--border-color)",
                  background: showHelp ? "rgba(var(--accent-rgb, 99,102,241),0.1)" : "transparent",
                  color: showHelp ? "var(--accent)" : "var(--text-secondary)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
              >
                <Info size={13} /> Guide
              </button>
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

            {/* Code Editor with Syntax Highlighting Overlay */}
            <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <style>{prismStyles}</style>
              <textarea
                value={code}
                onChange={(e) => handleCodeChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                spellCheck={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "14px 16px",
                  fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
                  fontSize: "13px",
                  lineHeight: "1.6",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  background: "transparent",
                  color: "transparent",
                  caretColor: "var(--text-primary)",
                  zIndex: 2,
                  tabSize: 2,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  width: "100%",
                  height: "100%",
                }}
              />
              <pre
                aria-hidden="true"
                className="prism-code"
                style={{
                  position: "absolute",
                  inset: 0,
                  padding: "14px 16px",
                  zIndex: 1,
                  background: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  margin: 0,
                }}
                dangerouslySetInnerHTML={{ __html: highlightedCode + "\n" }}
              />
            </div>

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

          {/* Help Panel (Slide-in) */}
          {showHelp && (
            <div
              style={{
                width: "320px",
                flexShrink: 0,
                borderLeft: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                background: "var(--bg-secondary)",
                animation: "slideRightFade 0.2s ease-out forwards",
              }}
            >
              <div style={{ padding: "16px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>Bridge API Guide</span>
                <button onClick={() => setShowHelp(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "20px" }}>
                <section>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--accent)" }}>Getting Started</h4>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                    Your scripts run in a secure sandbox. Use the global <code style={{ color: "var(--text-primary)" }}>bridge</code> object to interact with the system.
                  </p>
                </section>

                <section>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--accent)" }}>Clipboard</h4>
                  <div style={{ fontSize: "12px", fontFamily: "monospace", background: "var(--bg-primary)", padding: "8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    await bridge.clipboard.read()
                  </div>
                </section>

                <section>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--accent)" }}>P2P (Peers)</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>List connected peers:</div>
                    <div style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-primary)", padding: "6px", borderRadius: "4px" }}>
                      await bridge.peers.list()
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Send message:</div>
                    <div style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-primary)", padding: "6px", borderRadius: "4px" }}>
                      await bridge.peers.send(peerId, "msg")
                    </div>
                  </div>
                </section>

                <section>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--accent)" }}>AI & Tools</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Summarize text:</div>
                    <div style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-primary)", padding: "6px", borderRadius: "4px" }}>
                      await bridge.ai.summarize(text)
                    </div>
                  </div>
                </section>

                <section>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--accent)" }}>Notifications</h4>
                  <div style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-primary)", padding: "6px", borderRadius: "4px" }}>
                    await bridge.notify.send("Title", "Body")
                  </div>
                </section>

                <section>
                  <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--accent)" }}>Isolated Storage</h4>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Save data between runs:</div>
                  <div style={{ fontSize: "11px", fontFamily: "monospace", background: "var(--bg-primary)", padding: "6px", borderRadius: "4px" }}>
                    await bridge.storage.set("key", "val")<br/>
                    await bridge.storage.get("key")
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
