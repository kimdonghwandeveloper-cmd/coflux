import { create } from 'zustand';
import { Task, CustomFieldDefinition, DashboardWidget } from '../lib/types/core';
import { Node, Edge, applyNodeChanges, applyEdgeChanges, NodeChange, EdgeChange, OnNodesChange, OnEdgesChange, OnConnect, Connection, addEdge } from '@xyflow/react';

interface CofluxState {
  tasks: Task[];
  fieldDefinitions: CustomFieldDefinition[];
  nodes: Node[];
  edges: Edge[];
  widgets: DashboardWidget[];

  // Actions for Tasks
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Actions for Fields
  addFieldDefinition: (field: CustomFieldDefinition) => void;

  // Actions for Canvas (React Flow)
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;

  // Actions for Dashboard
  addWidget: (widget: DashboardWidget) => void;
  updateWidget: (id: string, updates: Partial<DashboardWidget>) => void;
}

export const useStore = create<CofluxState>((set, get) => ({
  tasks: [],
  fieldDefinitions: [
    { id: 'f_status', name: 'Status', type: 'status', options: ['To Do', 'In Progress', 'Done'] },
    { id: 'f_priority', name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
  ],
  nodes: [],
  edges: [],
  widgets: [],

  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
  updateTask: (id, updates) => set((state) => ({
    tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t)),
  })),
  deleteTask: (id) => set((state) => ({
    tasks: state.tasks.filter((t) => t.id !== id),
  })),

  addFieldDefinition: (field) => set((state) => ({
    fieldDefinitions: [...state.fieldDefinitions, field],
  })),

  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  addWidget: (widget) => set((state) => ({ widgets: [...state.widgets, widget] })),
  updateWidget: (id, updates) => set((state) => ({
    widgets: state.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
  })),
}));
