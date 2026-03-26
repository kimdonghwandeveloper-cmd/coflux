import { useCallback, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { Database as DbIcon, Link as LinkIcon } from 'lucide-react';

export const EditableNode = ({ id, data, selected }: any) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [label, setLabel] = useState(data.label);
  const [isEditing, setIsEditing] = useState(false);
  const scopeId = data.scopeId || 'global';

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  const onBlur = () => {
    setIsEditing(false);
    updateNodeData(scopeId, id, { label });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onBlur();
    }
  };

  return (
    <div className={`
      relative px-5 py-3 min-w-[160px] 
      bg-white/80 dark:bg-black/80 backdrop-blur-xl
      border-2 transition-all duration-300 ease-out
      ${selected ? 'border-accent shadow-2xl scale-105 z-10' : 'border-border shadow-lg'}
      ${data.isTask ? 'border-dashed' : ''}
    `}>
      <Handle type="target" position={Position.Top} className="!bg-accent !border-none !w-1.5 !h-1.5" />
      
      <div className="flex flex-col gap-1">
        {data.isTask && (
          <div className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-secondary opacity-60 mb-1">
            <LinkIcon size={8} /> Linked Task
          </div>
        )}

        {isEditing ? (
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            autoFocus
            className="w-full text-xs font-black outline-none bg-transparent text-primary"
          />
        ) : (
          <div 
            onDoubleClick={() => setIsEditing(true)}
            className={`text-xs font-black tracking-tight leading-tight ${data.isTask ? 'text-primary' : 'text-secondary'} cursor-text select-none`}
          >
            {label || 'New Concept'}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-accent !border-none !w-1.5 !h-1.5" />
      
      {data.isTask && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-accent text-bg-primary rounded-full flex items-center justify-center shadow-md">
          <DbIcon size={10} />
        </div>
      )}
    </div>
  );
};
