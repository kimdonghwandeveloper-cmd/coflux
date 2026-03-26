import { create } from 'zustand';
import { Task, CustomFieldDefinition, DashboardWidget } from '../lib/types/core';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, Connection, addEdge } from '@xyflow/react';
import { invoke } from '@tauri-apps/api/core';

interface ScopedCanvas {
  nodes: Node[];
  edges: Edge[];
}

interface CofluxState {
  tasksByScope: Record<string, Task[]>;
  canvasByScope: Record<string, ScopedCanvas>;
  fieldDefinitions: CustomFieldDefinition[];
  widgets: DashboardWidget[];

  // Helpers
  getTasks: (scopeId: string) => Task[];
  getCanvas: (scopeId: string) => ScopedCanvas;

  // Actions for Tasks
  addTask: (scopeId: string, task: Task) => void;
  updateTask: (scopeId: string, id: string, updates: Partial<Task>) => void;
  deleteTask: (scopeId: string, id: string) => void;

  // Actions for Fields
  addFieldDefinition: (field: CustomFieldDefinition) => void;

  // Actions for Canvas (React Flow)
  onNodesChange: (scopeId: string, changes: NodeChange[]) => void;
  onEdgesChange: (scopeId: string, changes: EdgeChange[]) => void;
  onConnect: (scopeId: string, connection: Connection) => void;
  setNodes: (scopeId: string, nodes: Node[]) => void;
  setEdges: (scopeId: string, edges: Edge[]) => void;
  addNode: (scopeId: string, node: Node) => void;
  updateNodeData: (scopeId: string, nodeId: string, data: any) => void;
  convertNodeToTask: (scopeId: string, nodeId: string) => void;

  // Persistence
  loadScopeData: (scopeId: string, dataType: 'tasks' | 'canvas') => Promise<void>;
}

// Internal helper to save to SQLite
const saveToDb = async (scopeId: string, dataType: 'tasks' | 'canvas', data: any) => {
  try {
    await invoke('coflux_save_scoped_data', {
      scopeId,
      dataType,
      dataJson: JSON.stringify(data)
    });
  } catch (err) {
    console.error(`Failed to save ${dataType} for scope ${scopeId}:`, err);
  }
};

export const useStore = create<CofluxState>((set, get) => ({
  tasksByScope: {},
  canvasByScope: {},
  fieldDefinitions: [
    { id: 'f_status', name: 'Status', type: 'status', options: ['To Do', 'In Progress', 'Done'] },
    { id: 'f_priority', name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
  ],
  widgets: [],

  getTasks: (scopeId) => get().tasksByScope[scopeId] || [],
  getCanvas: (scopeId) => get().canvasByScope[scopeId] || { nodes: [], edges: [] },

  loadScopeData: async (scopeId, dataType) => {
    try {
      const json = await invoke<string | null>('coflux_get_scoped_data', { scopeId, dataType });
      if (json) {
        const data = JSON.parse(json);
        if (dataType === 'tasks') {
          set((state) => ({ tasksByScope: { ...state.tasksByScope, [scopeId]: data } }));
        } else {
          set((state) => ({ canvasByScope: { ...state.canvasByScope, [scopeId]: data } }));
        }
      }
    } catch (err) {
      console.error(`Failed to load ${dataType} for scope ${scopeId}:`, err);
    }
  },

  addTask: (scopeId, task) => {
    set((state) => {
      const newTasks = [...(state.tasksByScope[scopeId] || []), task];
      saveToDb(scopeId, 'tasks', newTasks);
      return { tasksByScope: { ...state.tasksByScope, [scopeId]: newTasks } };
    });
  },

  updateTask: (scopeId, id, updates) => {
    set((state) => {
      const newTasks = (state.tasksByScope[scopeId] || []).map((t) => (t.id === id ? { ...t, ...updates } : t));
      saveToDb(scopeId, 'tasks', newTasks);
      return { tasksByScope: { ...state.tasksByScope, [scopeId]: newTasks } };
    });
  },

  deleteTask: (scopeId, id) => {
    set((state) => {
      const newTasks = (state.tasksByScope[scopeId] || []).filter((t) => t.id !== id);
      saveToDb(scopeId, 'tasks', newTasks);
      return { tasksByScope: { ...state.tasksByScope, [scopeId]: newTasks } };
    });
  },

  addFieldDefinition: (field) => set((state) => ({
    fieldDefinitions: [...state.fieldDefinitions, field],
  })),

  onNodesChange: (scopeId, changes) => {
    const canvas = get().getCanvas(scopeId);
    set((state) => {
      const newCanvas = { ...canvas, nodes: applyNodeChanges(changes, canvas.nodes) };
      saveToDb(scopeId, 'canvas', newCanvas);
      return { canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas } };
    });
  },

  onEdgesChange: (scopeId, changes) => {
    const canvas = get().getCanvas(scopeId);
    set((state) => {
      const newCanvas = { ...canvas, edges: applyEdgeChanges(changes, canvas.edges) };
      saveToDb(scopeId, 'canvas', newCanvas);
      return { canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas } };
    });
  },

  onConnect: (scopeId, connection) => {
    const canvas = get().getCanvas(scopeId);
    set((state) => {
      const newCanvas = { ...canvas, edges: addEdge(connection, canvas.edges) };
      saveToDb(scopeId, 'canvas', newCanvas);
      return { canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas } };
    });
  },

  setNodes: (scopeId, nodes) => set((state) => {
    const newCanvas = { ...(state.canvasByScope[scopeId] || { edges: [] }), nodes };
    saveToDb(scopeId, 'canvas', newCanvas);
    return { canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas } };
  }),

  setEdges: (scopeId, edges) => set((state) => {
    const newCanvas = { ...(state.canvasByScope[scopeId] || { nodes: [] }), edges };
    saveToDb(scopeId, 'canvas', newCanvas);
    return { canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas } };
  }),

  addNode: (scopeId, node) => set((state) => {
    const canvas = get().getCanvas(scopeId);
    const newCanvas = { ...canvas, nodes: [...canvas.nodes, node] };
    saveToDb(scopeId, 'canvas', newCanvas);
    return { canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas } };
  }),

  updateNodeData: (scopeId, nodeId, data) => set((state) => {
    const canvas = get().getCanvas(scopeId);
    const nodes = canvas.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
    const node = nodes.find((n) => n.id === nodeId);
    
    let tasks = state.tasksByScope[scopeId] || [];
    if (node?.data.taskId && data.label) {
      tasks = tasks.map((t) => (t.id === node.data.taskId ? { ...t, title: data.label } : t));
    }
    
    const newCanvas = { ...canvas, nodes };
    saveToDb(scopeId, 'canvas', newCanvas);
    saveToDb(scopeId, 'tasks', tasks);
    
    return {
      canvasByScope: { ...state.canvasByScope, [scopeId]: newCanvas },
      tasksByScope: { ...state.tasksByScope, [scopeId]: tasks }
    };
  }),

  convertNodeToTask: (scopeId, nodeId) => {
    const canvas = get().getCanvas(scopeId);
    const node = canvas.nodes.find((n) => n.id === nodeId);
    if (!node || node.data.taskId) return;

    const newTask: Task = {
      id: `task_${Date.now()}`,
      title: node.data.label as string || 'New Task from Whiteboard',
      description: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      customFields: { f_status: 'To Do' },
    };

    const nextTasks = [...(get().tasksByScope[scopeId] || []), newTask];
    const nextNodes = canvas.nodes.map((n) => 
      n.id === nodeId 
        ? { ...n, data: { ...n.data, taskId: newTask.id, isTask: true } } 
        : n
    );
    const nextCanvas = { ...canvas, nodes: nextNodes };

    saveToDb(scopeId, 'tasks', nextTasks);
    saveToDb(scopeId, 'canvas', nextCanvas);

    set((state) => ({
      tasksByScope: { ...state.tasksByScope, [scopeId]: nextTasks },
      canvasByScope: { ...state.canvasByScope, [scopeId]: nextCanvas }
    }));
  },

  addWidget: (widget: DashboardWidget) => set((state) => ({ widgets: [...state.widgets, widget] })),
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => set((state) => ({
    widgets: state.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
  })),
}));
