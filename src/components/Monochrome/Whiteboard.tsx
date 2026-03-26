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
import { Plus, Database as DbIcon, MousePointer2 } from 'lucide-react';
import { EditableNode } from './EditableNode';

const nodeTypes = {
  editable: EditableNode,
};

export const Whiteboard = () => {
  const { 
    nodes, 
    edges, 
    onNodesChange, 
    onEdgesChange, 
    onConnect, 
    addNode, 
    convertNodeToTask 
  } = useStore();

  const [menuVisible, setMenuVisible] = useState<{ id: string, x: number, y: number } | null>(null);

  const addNewNode = useCallback(() => {
    const id = `node_${Date.now()}`;
    const newNode = {
      id,
      type: 'editable',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: 'New Concept', isTask: false },
    };
    addNode(newNode);
  }, [addNode]);

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: any) => {
    event.preventDefault();
    setMenuVisible({ id: node.id, x: event.clientX, y: event.clientY });
  }, []);

  const handleConvertToTask = () => {
    if (menuVisible) {
      convertNodeToTask(menuVisible.id);
      setMenuVisible(null);
    }
  };

  return (
    <div className="flex-1 w-full h-full relative bg-white dark:bg-black">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={() => setMenuVisible(null)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#e5e5e5" />
        <Controls showInteractive={false} className="!bg-white !border-black !rounded-none shadow-sm" />
        <MiniMap nodeStrokeColor="#000" nodeColor="#fff" maskColor="rgba(0,0,0,0.05)" />
        
        <Panel position="top-left" className="flex gap-2">
          <button 
            onClick={addNewNode}
            className="flex items-center gap-2 px-3 py-1.5 bg-black text-white text-xs font-bold uppercase tracking-wider hover:bg-gray-800 transition-colors"
          >
            <Plus size={14} /> Add Idea
          </button>
        </Panel>

        <Panel position="top-right">
          <div className="bg-white/80 backdrop-blur-sm border border-black p-2 text-[10px] font-mono text-gray-500 uppercase">
             Canvas Mode / Hybrid Architecture
          </div>
        </Panel>
      </ReactFlow>

      {/* Context Menu */}
      {menuVisible && (
        <div 
          className="fixed z-50 bg-white border border-black shadow-xl p-1 min-w-[160px]"
          style={{ top: menuVisible.y, left: menuVisible.x }}
        >
          <button 
            onClick={handleConvertToTask}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold hover:bg-gray-100 transition-colors"
          >
            <DbIcon size={14} /> Convert to Task
          </button>
          <button 
            onClick={() => setMenuVisible(null)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <MousePointer2 size={14} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
};
