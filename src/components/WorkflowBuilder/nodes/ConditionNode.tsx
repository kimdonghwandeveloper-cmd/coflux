import { Handle, Position } from '@xyflow/react';
import { Filter } from 'lucide-react';

export const ConditionNode = ({ data, isConnectable }: any) => {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '2px solid #805ad5',
      borderRadius: '12px',
      padding: '16px',
      width: '280px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    }}>
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{ width: '12px', height: '12px', background: '#805ad5', border: '2px solid var(--bg-primary)' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div style={{ background: '#805ad5', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
          <Filter size={16} />
        </div>
        <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Condition</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Condition Type</label>
        <select 
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
          value={data.type}
          onChange={(e) => {
            const val = e.target.value;
            data.onChange(val === 'content_length_gt' ? { type: val, value: 50 } : { type: val });
          }}
          className="nodrag"
        >
          <option value="always">Always Pass</option>
          <option value="content_length_gt">Content Length &gt;</option>
        </select>

        {data.type === 'content_length_gt' && (
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>Minimum Characters</label>
            <input 
              type="number"
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', marginTop: '4px' }}
              value={data.value || 50}
              onChange={(e) => data.onChange({ ...data, value: parseInt(e.target.value) || 0 })}
              className="nodrag"
            />
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={{ width: '12px', height: '12px', background: '#805ad5', border: '2px solid var(--bg-primary)' }}
      />
    </div>
  );
};
