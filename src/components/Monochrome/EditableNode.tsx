import { useCallback, useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store/useStore';

export const EditableNode = ({ id, data, selected }: any) => {
  const updateNodeData = useStore((state) => state.updateNodeData);
  const [label, setLabel] = useState(data.label);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setLabel(data.label);
  }, [data.label]);

  const onBlur = () => {
    setIsEditing(false);
    updateNodeData(id, { label });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onBlur();
    }
  };

  return (
    <div className={`px-4 py-2 min-w-[120px] bg-white border-2 ${selected ? 'border-black' : 'border-gray-200'} ${data.isTask ? 'border-dashed' : ''} transition-all`}>
      <Handle type="target" position={Position.Top} className="!bg-black !w-2 !h-2" />
      
      {isEditing ? (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus
          className="w-full text-xs font-bold outline-none bg-transparent"
        />
      ) : (
        <div 
          onDoubleClick={() => setIsEditing(true)}
          className={`text-xs font-bold ${data.isTask ? 'text-black' : 'text-gray-500'} cursor-text select-none`}
        >
          {label || 'Unnamed Idea'}
          {data.isTask && (
            <div className="mt-1 text-[8px] uppercase tracking-tighter opacity-40">Linked Task</div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-black !w-2 !h-2" />
    </div>
  );
};
