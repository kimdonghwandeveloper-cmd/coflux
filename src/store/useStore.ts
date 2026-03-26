import { create } from 'zustand';
import { Task, CustomFieldDefinition, DashboardWidget } from '../lib/types/core';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, OnNodesChange, OnEdgesChange, OnConnect, Connection, addEdge } from '@xyflow/react';

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

  // Actions for Dashboard
  addWidget: (widget: DashboardWidget) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
}

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

  addTask: (scopeId, task) => set((state) => ({
    tasksByScope: {
      ...state.tasksByScope,
      [scopeId]: [...(state.tasksByScope[scopeId] || []), task]
    }
  })),

  updateTask: (scopeId, id, updates) => set((state) => ({
    tasksByScope: {
      ...state.tasksByScope,
      [scopeId]: (state.tasksByScope[scopeId] || []).map((t) => (t.id === id ? { ...t, ...updates } : t))
    }
  })),

  deleteTask: (scopeId, id) => set((state) => ({
    tasksByScope: {
      ...state.tasksByScope,
      [scopeId]: (state.tasksByScope[scopeId] || []).filter((t) => t.id !== id)
    }
  })),

  addFieldDefinition: (field) => set((state) => ({
    fieldDefinitions: [...state.fieldDefinitions, field],
  })),

  onNodesChange: (scopeId, changes) => {
    const canvas = get().getCanvas(scopeId);
    set((state) => ({
      canvasByScope: {
        ...state.canvasByScope,
        [scopeId]: {
          ...canvas,
          nodes: applyNodeChanges(changes, canvas.nodes)
        }
      }
    }));
  },

  onEdgesChange: (scopeId, changes) => {
    const canvas = get().getCanvas(scopeId);
    set((state) => ({
      canvasByScope: {
        ...state.canvasByScope,
        [scopeId]: {
          ...canvas,
          edges: applyEdgeChanges(changes, canvas.edges)
        }
      }
    }));
  },

  onConnect: (scopeId, connection) => {
    const canvas = get().getCanvas(scopeId);
    set((state) => ({
      canvasByScope: {
        ...state.canvasByScope,
        [scopeId]: {
          ...canvas,
          edges: addEdge(connection, canvas.edges)
        }
      }
    }));
  },

  setNodes: (scopeId, nodes) => set((state) => ({
    canvasByScope: {
      ...state.canvasByScope,
      [scopeId]: { ...(state.canvasByScope[scopeId] || { edges: [] }), nodes }
    }
  })),

  setEdges: (scopeId, edges) => set((state) => ({
    canvasByScope: {
      ...state.canvasByScope,
      [scopeId]: { ...(state.canvasByScope[scopeId] || { nodes: [] }), edges }
    }
  })),

  addNode: (scopeId, node) => set((state) => {
    const canvas = get().getCanvas(scopeId);
    return {
      canvasByScope: {
        ...state.canvasByScope,
        [scopeId]: { ...canvas, nodes: [...canvas.nodes, node] }
      }
    };
  }),

  updateNodeData: (scopeId, nodeId, data) => set((state) => {
    const canvas = get().getCanvas(scopeId);
    const nodes = canvas.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n));
    const node = nodes.find((n) => n.id === nodeId);
    
    let tasks = state.tasksByScope[scopeId] || [];
    if (node?.data.taskId && data.label) {
      tasks = tasks.map((t) => (t.id === node.data.taskId ? { ...t, title: data.label } : t));
    }
    
    return {
      canvasByScope: { ...state.canvasByScope, [scopeId]: { ...canvas, nodes } },
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

    get().addTask(scopeId, newTask);

    set((state) => ({
      canvasByScope: {
        ...state.canvasByScope,
        [scopeId]: {
          ...canvas,
          nodes: canvas.nodes.map((n) => 
            n.id === nodeId 
              ? { ...n, data: { ...n.data, taskId: newTask.id, isTask: true } } 
              : n
          )
        }
      }
    }));
  },

  addWidget: (widget) => set((state) => ({ widgets: [...state.widgets, widget] })),
  updateWidget: (id, updates) => set((state) => ({
    widgets: state.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
  })),
}));
