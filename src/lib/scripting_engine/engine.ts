import { invoke } from "@tauri-apps/api/core";
import { analyzeScript } from "./static_analyzer";
import { handleBridgeCall, type BridgeCallMsg } from "./bridge_host";
import type { ScriptData, ExecutionResult, LogEntry } from "./types";

const EXECUTION_TIMEOUT_MS = 5_000;

export class ScriptingEngine {
  // ── Script execution ───────────────────────────────────────

  async run(
    script: ScriptData,
    onLog: (entry: LogEntry) => void
  ): Promise<ExecutionResult> {
    // Step 1: Static analysis (fast, synchronous)
    const analysis = analyzeScript(script.code);
    if (!analysis.safe) {
      return {
        success: false,
        error: `Security violation:\n${analysis.violations.join("\n")}`,
        logs: [],
      };
    }

    // Step 2: TypeScript → JavaScript
    // @babel/standalone is loaded lazily (dynamic import) so it doesn't bloat
    // the initial app bundle — it's only fetched when the Script Editor is used.
    let jsCode: string;
    try {
      const Babel = await import("@babel/standalone");
      const out = Babel.transform(script.code, {
        presets: ["typescript"],
        filename: "script.ts",
      });
      jsCode = out?.code ?? script.code;
    } catch (err) {
      return {
        success: false,
        error: `Transpile error: ${String(err)}`,
        logs: [],
      };
    }

    // Step 3: Execute inside Web Worker sandbox
    return new Promise((resolve) => {
      const worker = new Worker(
        new URL("./sandbox.worker.ts", import.meta.url),
        { type: "module" }
      );

      const logs: LogEntry[] = [];
      let settled = false;

      const finish = (result: ExecutionResult) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          worker.terminate();
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        finish({
          success: false,
          error: `Execution timed out after ${EXECUTION_TIMEOUT_MS}ms`,
          logs,
        });
      }, EXECUTION_TIMEOUT_MS);

      worker.addEventListener("message", async (event: MessageEvent) => {
        const msg = event.data;

        if (msg.type === "bridge_call") {
          // Proxy BridgeAPI calls through to Tauri IPC on main thread
          await handleBridgeCall(worker, msg as BridgeCallMsg, script.id);
          return;
        }

        if (msg.type === "log") {
          const entry: LogEntry = {
            level: msg.level,
            message: msg.message,
            timestamp: new Date().toISOString(),
          };
          logs.push(entry);
          onLog(entry);
          return;
        }

        if (msg.type === "result") {
          finish({ success: true, value: msg.value, logs });
        }

        if (msg.type === "error") {
          finish({ success: false, error: msg.message, logs });
        }
      });

      worker.addEventListener("error", (e) => {
        finish({ success: false, error: e.message ?? "Unknown worker error", logs });
      });

      worker.postMessage({ type: "execute", code: jsCode, scriptId: script.id });
    });
  }

  // ── Script CRUD (delegates to Rust/SQLite) ─────────────────

  async getScripts(): Promise<ScriptData[]> {
    return await invoke<ScriptData[]>("get_user_scripts");
  }

  async saveScript(script: ScriptData): Promise<void> {
    await invoke("save_user_script", { script });
  }

  async deleteScript(id: string): Promise<void> {
    await invoke("delete_user_script", { scriptId: id });
  }
}

export const scriptingEngine = new ScriptingEngine();
