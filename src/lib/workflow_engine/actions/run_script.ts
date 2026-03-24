import type { EventContext } from "../types";
import { scriptingEngine } from "../../scripting_engine/engine";

export async function runScript(
  params: { code: string },
  ctx: EventContext,
  workflowId: string
): Promise<void> {
  // We wrap the user's code to inject the workflow context dynamically
  const codeWithCtx = `
// Injected workflow context
const context = ${JSON.stringify(ctx)};

// User script
${params.code}
`;

  const dummyScript = {
    id: `wfnode-${workflowId}`,
    name: "Workflow Code Node",
    code: codeWithCtx,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await scriptingEngine.run(dummyScript, (logEntry) => {
      // We can forward script logs to the console or specialized log view
      console.log(`[Workflow Script - ${workflowId}]`, logEntry.message);
    });
  } catch (err) {
    console.error(`[Workflow Script Error - ${workflowId}]`, err);
    throw err; // Rethrow to let the workflow engine handle logging the failure
  }
}
