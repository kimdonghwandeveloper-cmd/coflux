// First line of defense: static pattern scan before the Worker even starts.
// The Worker's global-shadowing technique is the primary isolation layer;
// this scan provides an early, readable error message for obvious violations.

export interface AnalysisResult {
  safe: boolean;
  violations: string[];
}

const FORBIDDEN: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\beval\s*\(/, description: "eval() is not allowed" },
  { pattern: /new\s+Function\s*\(/, description: "new Function() is not allowed" },
  { pattern: /\bimportScripts\s*\(/, description: "importScripts() is not allowed" },
  { pattern: /__TAURI__/, description: "__TAURI__ access is not allowed" },
  { pattern: /\binvoke\s*\(/, description: "invoke() is not allowed — use bridge API" },
  { pattern: /\brequire\s*\(/, description: "require() is not allowed" },
  { pattern: /\bprocess\.env\b/, description: "process.env access is not allowed" },
  { pattern: /\bBuffer\s*\./, description: "Buffer access is not allowed" },
  {
    pattern: /import\s+.*\s+from\s+['"`]/,
    description: "ES module imports are not allowed in scripts",
  },
];

export function analyzeScript(code: string): AnalysisResult {
  const violations: string[] = [];
  for (const { pattern, description } of FORBIDDEN) {
    if (pattern.test(code)) violations.push(description);
  }
  return { safe: violations.length === 0, violations };
}
