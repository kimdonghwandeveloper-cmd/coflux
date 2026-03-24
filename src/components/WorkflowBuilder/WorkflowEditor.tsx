import { useState, useCallback, useMemo } from "react";
import { ArrowLeft, Save, Plus, AlertCircle, Trash2 } from "lucide-react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  Panel,
  NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WorkflowDefinitionSchema, type WorkflowData } from "../../lib/workflow_engine/types";
import { TriggerNode } from "./nodes/TriggerNode";
import { ConditionNode } from "./nodes/ConditionNode";
import { ActionNode } from "./nodes/ActionNode";

interface WorkflowEditorProps {
  workflow: WorkflowData | null;
  onSave: (wf: WorkflowData) => void;
  onCancel: () => void;
}

const nodeTypes: NodeTypes = {
  triggerNode: TriggerNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
};

export const WorkflowEditor = ({ workflow, onSave, onCancel }: WorkflowEditorProps) => {
  // Parsing init state with backwards compatibility for old JSON definitions
  const initNodesAndEdges = () => {
    if (!workflow) {
      return {
        nodes: [{ id: "trigger-1", type: "triggerNode", position: { x: 300, y: 50 }, data: { type: "peer_data_received", filter: { content_type: "" } } }],
        edges: [],
      };
    }

    try {
      const def = JSON.parse(workflow.definition);
      
      // If the workflow already has visual UI coordinates saved
      if (def.ui && def.ui.nodes && def.ui.nodes.length > 0) {
        return { nodes: def.ui.nodes, edges: def.ui.edges || [] };
      }

      // Legacy auto-layout generator
      const nodes: Node[] = [];
      const edges: Edge[] = [];
      let yOffset = 50;

      nodes.push({ id: "trigger-1", type: "triggerNode", position: { x: 300, y: yOffset }, data: def.trigger });
      yOffset += 240;

      let lastId = "trigger-1";
      (def.conditions || []).forEach((c: any, i: number) => {
        const id = `cond-${i}`;
        nodes.push({ id, type: "conditionNode", position: { x: 300, y: yOffset }, data: c });
        edges.push({ id: `e-${lastId}-${id}`, source: lastId, target: id });
        lastId = id;
        yOffset += 240;
      });

      (def.actions || []).forEach((a: any, i: number) => {
        const id = `action-${i}`;
        nodes.push({ id, type: "actionNode", position: { x: 300, y: yOffset }, data: a });
        edges.push({ id: `e-${lastId}-${id}`, source: lastId, target: id });
        lastId = id;
        yOffset += 240;
      });

      return { nodes, edges };
    } catch {
      return {
        nodes: [{ id: "trigger-1", type: "triggerNode", position: { x: 300, y: 50 }, data: { type: "peer_data_received", filter: {} } }],
        edges: [],
      };
    }
  };

  const initialElements = useMemo(() => initNodesAndEdges(), [workflow]);
  const [nodes, setNodes] = useState<Node[]>(initialElements.nodes);
  const [edges, setEdges] = useState<Edge[]>(initialElements.edges);
  const [name, setName] = useState(workflow?.name || "Untitled Workflow");
  const [error, setError] = useState<string | null>(null);

  // Hooking data changes back to React Flow
  const onNodesChange = useCallback((changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params: Connection | Edge) => setEdges((eds) => addEdge(params, eds)), []);

  // Update node data helper mapped inside the node via `onChange` prop
  const updateNodeData = useCallback((id: string, newData: any) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...newData } } : n)));
  }, []);

  // Sync data.onChange binding
  const mappedNodes = useMemo(() => {
    return nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onChange: (newData: any) => updateNodeData(n.id, newData),
      }
    }));
  }, [nodes, updateNodeData]);

  const addNode = (type: "conditionNode" | "actionNode") => {
    const id = `node-${crypto.randomUUID()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 300 + Math.random() * 50, y: 300 + Math.random() * 50 },
      data: type === "conditionNode" ? { type: "always" } : { type: "notify_desktop", params: { title: "Alert", body: "Executed!" } },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleSave = () => {
    setError(null);
    if (!name.trim()) { setError("Workflow name is required."); return; }

    // Topological DAG compiler: Traverse from the trigger node
    const triggers = nodes.filter(n => n.type === "triggerNode");
    if (triggers.length !== 1) { setError("Workflow must have exactly exactly 1 Trigger node."); return; }

    const conditions: any[] = [];
    const actions: any[] = [];
    
    let currentId = triggers[0].id;

    // A simple edge traversal for strict chain verification
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) { setError("Cycle detected in the workflow graph."); return; }
      visited.add(currentId);
      
      const outgoingEdges = edges.filter(e => e.source === currentId);
      if (outgoingEdges.length > 1) { setError("Branching nodes are not supported yet. Connect them in a single line."); return; }
      if (outgoingEdges.length === 0) break;
      
      const nextNode = nodes.find(n => n.id === outgoingEdges[0].target);
      if (!nextNode) break;

      if (nextNode.type === "conditionNode") {
        if (actions.length > 0) { setError("Condition nodes must run before Action nodes."); return; }
        // Strip out the onChange function before serializing
        const cleanData = { ...(nextNode.data as any) };
        delete cleanData.onChange;
        conditions.push(cleanData);
      } else if (nextNode.type === "actionNode") {
        const cleanData = { ...(nextNode.data as any) };
        delete cleanData.onChange;
        actions.push(cleanData);
      }
      
      currentId = nextNode.id;
    }

    // Support standalone un-connected nodes if they don't want strict drawing? No, strict DAG compilation is safer.
    if (actions.length === 0) { setError("Workflow must have at least 1 Action node connected to the trigger."); return; }

    const triggerData = { ...(triggers[0].data as any) };
    delete triggerData.onChange;

    const definition = {
      id: workflow ? JSON.parse(workflow.definition).id : crypto.randomUUID(),
      name: name.trim(),
      enabled: true,
      trigger: triggerData,
      conditions,
      actions,
      ui: {
        nodes: nodes.map(n => {
           const cleanData = { ...(n.data as any) };
           delete cleanData.onChange;
           return { ...n, data: cleanData };
        }),
        edges
      }
    };

    const parsed = WorkflowDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      const err = parsed.error.issues[0];
      setError(`Validation: ${err.path.join(".")} — ${err.message}`);
      return;
    }

    const now = new Date().toISOString();
    const wfData: WorkflowData = {
      id: workflow?.id ?? crypto.randomUUID(),
      name: name.trim(),
      enabled: workflow?.enabled ?? true,
      definition: JSON.stringify(parsed.data),
      createdAt: workflow?.createdAt ?? now,
      updatedAt: now,
    };

    onSave(wfData);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Top Header Navigation */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-primary)" }}>
         <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
           <button onClick={onCancel} style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "13px" }}>
              <ArrowLeft size={16} /> Back
           </button>
           <input
             value={name}
             onChange={(e) => setName(e.target.value)}
             placeholder="Workflow Name"
             style={{ background: "transparent", border: "none", color: "var(--text-primary)", fontSize: "16px", fontWeight: 700, outline: "none", minWidth: "250px" }}
           />
         </div>
         <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
           {error && <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--error)", fontSize: "12px", maxWidth: "250px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}><AlertCircle size={14} /> {error}</div>}
           <button onClick={handleSave} style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--accent)", color: "white", padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
             <Save size={16} /> Save Active Flow
           </button>
         </div>
      </div>

      {/* React Flow Visual Canvas */}
      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={mappedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{ style: { strokeWidth: 3, stroke: "var(--text-secondary)" }, animated: true }}
          >
            <Background color="var(--border-color)" gap={20} size={2} />
            <Controls />
            
            <Panel position="bottom-center" style={{ background: "var(--bg-primary)", padding: "12px", borderRadius: "12px", border: "1px solid var(--border-color)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", display: "flex", gap: "12px" }}>
              <button 
                onClick={() => addNode("conditionNode")}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", background: "transparent", border: "1px solid #805ad5", color: "#805ad5", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
              >
                <Plus size={14} /> Add Condition
              </button>
              <button 
                onClick={() => addNode("actionNode")}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", background: "transparent", border: "1px solid #38a169", color: "#38a169", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
              >
                <Plus size={14} /> Add Action
              </button>
              <div style={{ width: "1px", background: "var(--border-color)", margin: "0 4px" }} />
              <button 
                onClick={() => setNodes(nodes.filter(n => n.selected !== true))}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", background: "rgba(229,62,62,0.1)", border: "none", color: "var(--error)", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}
              >
                <Trash2 size={14} /> Delete Selected Node
              </button>
            </Panel>
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </div>
  );
};
