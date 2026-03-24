import { Handle, Position } from '@xyflow/react';
import { Zap } from 'lucide-react';

export const TriggerNode = ({ data, isConnectable }: any) => {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '2px solid var(--accent)',
      borderRadius: '12px',
      padding: '16px',
      width: '280px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div style={{ background: 'var(--accent)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
          <Zap size={16} />
        </div>
        <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Trigger</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Event Type</label>
        <select 
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
          value={data.type}
          onChange={(e) => data.onChange({ ...data, type: e.target.value })}
          className="nodrag"
        >
          <option value="peer_data_received">Peer Data Received</option>
          <option value="user_status_changed">User Status Changed</option>
        </select>

        {data.type === 'peer_data_received' && (
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>Content Filter (optional)</label>
            <input 
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', marginTop: '4px' }}
              placeholder="e.g. text/plain"
              value={data.filter?.content_type || ''}
              onChange={(e) => data.onChange({ ...data, filter: { content_type: e.target.value } })}
              className="nodrag"
            />
          </div>
        )}

        {data.type === 'user_status_changed' && (
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '8px' }}>Status Target</label>
            <select 
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', marginTop: '4px' }}
              value={data.filter?.to_status || ''}
              onChange={(e) => data.onChange({ ...data, filter: { to_status: e.target.value } })}
              className="nodrag"
            >
              <option value="">Any Status</option>
              <option value="Active">Active</option>
              <option value="Away">Away</option>
            </select>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={{ width: '12px', height: '12px', background: 'var(--accent)', border: '2px solid var(--bg-primary)' }}
      />
    </div>
  );
};
