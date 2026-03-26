import { useState, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { Database as DbIcon, Link as LinkIcon } from 'lucide-react';

const getContrastColor = (hexColor: string | undefined, isDarkMode: boolean) => {
  if (!hexColor) return isDarkMode ? '#ffffff' : '#000000';
  
  // If no hex color, just return based on theme
  if (!hexColor.startsWith('#')) return isDarkMode ? '#ffffff' : '#000000';

  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
};

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
    <div 
      className={`
        relative px-5 py-3 min-w-[160px] 
        ${!data.color ? 'bg-white/80 dark:bg-black/80' : ''}
        backdrop-blur-xl border-2 transition-all duration-300 ease-out
        ${selected ? 'border-accent shadow-2xl scale-105 z-10' : 'border-border shadow-lg'}
        ${data.isTask ? 'border-dashed' : ''}
      `}
      style={{ 
        backgroundColor: data.color || undefined,
      }}
    >
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
            style={{ color: getContrastColor(data.color, document.documentElement.classList.contains('dark')) }}
            className="w-full text-xs font-black outline-none bg-transparent"
          />
        ) : (
          <div 
            onDoubleClick={() => setIsEditing(true)}
            style={{ color: getContrastColor(data.color, document.documentElement.classList.contains('dark')) }}
            className={`text-xs font-black tracking-tight leading-tight cursor-text select-none opacity-90`}
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
