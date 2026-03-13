import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { workflowEngine } from "./lib/workflow_engine/engine";

workflowEngine.init().catch((err) =>
  console.error("[WorkflowEngine] Failed to initialize:", err)
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
