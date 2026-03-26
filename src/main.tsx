import React from "react";
import ReactDOM from "react-dom/client";
import App from "./CofluxApp";
import "./index.css";
import { workflowEngine } from "./lib/workflow_engine/engine";
import { seedPresets } from "./lib/workflow_engine/seeder";

workflowEngine.init()
  .then(() => seedPresets())
  .then(() => workflowEngine.reload())
  .catch((err) => console.error("[WorkflowEngine] Startup failed:", err));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
