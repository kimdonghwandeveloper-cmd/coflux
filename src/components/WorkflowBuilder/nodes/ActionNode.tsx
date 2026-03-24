import { Handle, Position } from '@xyflow/react';
import { Play } from 'lucide-react';

export const ActionNode = ({ data, isConnectable }: any) => {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '2px solid #38a169',
      borderRadius: '12px',
      padding: '16px',
      width: '280px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    }}>
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        style={{ width: '12px', height: '12px', background: '#38a169', border: '2px solid var(--bg-primary)' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
        <div style={{ background: '#38a169', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
          <Play size={16} />
        </div>
        <strong style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Action</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Action Type</label>
        <select 
          style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
          value={data.type}
          onChange={(e) => {
            const val = e.target.value;
            let newParams = {};
            if (val === 'notify_desktop') newParams = { title: 'Notification', body: '...' };
            if (val === 'save_to_db') newParams = { collection: '' };
            if (val === 'send_peer_message') newParams = { message: '' };
            if (val === 'log_event') newParams = { message: '' };
            // Script Editor Node support
            if (val === 'run_script') newParams = { code: '// write your JS code\n' };
            data.onChange({ type: val, params: newParams });
          }}
          className="nodrag"
        >
          <option value="notify_desktop">Desktop Notification</option>
          <option value="save_to_db">Save to DB</option>
          <option value="send_peer_message">Send Peer Message</option>
          <option value="log_event">Log Event</option>
          <option value="run_script">Run Code (Script)</option>
        </select>

        {data.type === 'notify_desktop' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input 
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
              placeholder="Title"
              value={data.params?.title || ''}
              onChange={(e) => data.onChange({ ...data, params: { ...data.params, title: e.target.value } })}
              className="nodrag"
            />
            <input 
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
              placeholder="Body text"
              value={data.params?.body || ''}
              onChange={(e) => data.onChange({ ...data, params: { ...data.params, body: e.target.value } })}
              className="nodrag"
            />
          </div>
        )}

        {data.type === 'save_to_db' && (
          <input 
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
            placeholder="Collection Name (optional)"
            value={data.params?.collection || ''}
            onChange={(e) => data.onChange({ ...data, params: { collection: e.target.value } })}
            className="nodrag"
          />
        )}

        {data.type === 'send_peer_message' && (
          <textarea 
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', minHeight: '60px' }}
            placeholder="Message payload"
            value={data.params?.message || ''}
            onChange={(e) => data.onChange({ ...data, params: { message: e.target.value } })}
            className="nodrag"
          />
        )}

        {data.type === 'run_script' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>Secure Script Sandbox</label>
            <textarea 
              style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#1e1e1e', color: '#d4d4d4', outline: 'none', resize: 'vertical', minHeight: '120px', fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.5 }}
              placeholder="// Write Javascript here"
              spellCheck={false}
              value={data.params?.code || ''}
              onChange={(e) => data.onChange({ ...data, params: { code: e.target.value } })}
              className="nodrag"
            />
          </div>
        )}

        {data.type === 'log_event' && (
          <input 
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }}
            placeholder="Optional log label"
            value={data.params?.message || ''}
            onChange={(e) => data.onChange({ ...data, params: { message: e.target.value } })}
            className="nodrag"
          />
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        style={{ width: '12px', height: '12px', background: '#38a169', border: '2px solid var(--bg-primary)' }}
      />
    </div>
  );
};
