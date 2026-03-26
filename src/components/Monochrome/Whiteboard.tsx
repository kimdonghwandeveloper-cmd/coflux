import { useCallback, useState } from 'react';
import {
  ReactFlow,
  Panel,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../../store/useStore';
import { Plus, Database as DbIcon, MousePointer2, Layers } from 'lucide-react';
import { EditableNode } from './EditableNode';

const nodeTypes = {
  editable: EditableNode,
};

export const Whiteboard = ({ scopeId = 'global' }: { scopeId?: string }) => {
  const { 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addNode, 
    convertNodeToTask,
    getCanvas
  } = useStore();

  const { nodes, edges } = getCanvas(scopeId);

  const [menuVisible, setMenuVisible] = useState<{ id: string, x: number, y: number } | null>(null);

  const addNewNode = useCallback(() => {
    const id = `node_${Date.now()}`;
    const newNode = {
      id,
      type: 'editable',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: 'New Concept', isTask: false, scopeId },
    };
    addNode(scopeId, newNode);
  }, [addNode, scopeId]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
    event.preventDefault();
    setMenuVisible({ id: node.id, x: event.clientX, y: event.clientY });
  }, []);

  const handleConvertToTask = () => {
    if (menuVisible) {
      convertNodeToTask(scopeId, menuVisible.id);
      setMenuVisible(null);
    }
  };

  return (
    <div className="flex-1 w-full h-full relative bg-transparent overflow-hidden animate-in fade-in duration-1000">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => onNodesChange(scopeId, changes)}
        onEdgesChange={(changes) => onEdgesChange(scopeId, changes)}
        onConnect={(connection) => onConnect(scopeId, connection)}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => setMenuVisible(null)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background variant={BackgroundVariant.Lines} gap={20} size={0.5} color="rgba(0,0,0,0.03)" />
        <Controls 
          showInteractive={false} 
          className="!bg-white/80 !backdrop-blur-md !border-black/10 !rounded-xl !shadow-2xl !p-1 overflow-hidden" 
        />
        <MiniMap 
          nodeStrokeColor="#000" 
          nodeColor="#fff" 
          maskColor="rgba(0,0,0,0.05)" 
          className="!bg-white/50 !backdrop-blur-sm !border-black/5 !rounded-xl overflow-hidden"
        />
        
        <Panel position="top-left" className="flex gap-2">
          <button 
            onClick={addNewNode}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-gray-800 transition-all shadow-2xl hover:scale-105 active:scale-95"
          >
            <Plus size={16} /> Add Idea
          </button>
        </Panel>

        <Panel position="top-right">
          <div className="glass-panel px-4 py-2 text-[9px] font-black text-secondary uppercase tracking-[0.3em] flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
             <Layers size={12} /> {scopeId === 'global' ? 'Global Canvas' : `Scope: ${scopeId}`}
          </div>
        </Panel>
      </ReactFlow>

      {/* Context Menu */}
      {menuVisible && (
        <div 
          className="fixed z-50 glass-panel p-1 min-w-[180px] animate-in zoom-in-95 duration-200"
          style={{ top: menuVisible.y, left: menuVisible.x }}
        >
          <button 
            onClick={handleConvertToTask}
            className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all group"
          >
            <DbIcon size={14} className="group-hover:scale-110 transition-transform" /> Convert to Task
          </button>
          <div className="h-px bg-border my-1 mx-2"></div>
          <button 
            onClick={() => setMenuVisible(null)}
            className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-secondary hover:bg-secondary/10 transition-all"
          >
            <MousePointer2 size={14} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
};
