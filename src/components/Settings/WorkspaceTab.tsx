import { WorkspaceData } from '../../App';

export function WorkspaceTab({ 
  activeWorkspace, 
  onUpdateWorkspace 
}: { 
  activeWorkspace: WorkspaceData, 
  onUpdateWorkspace: (ws: WorkspaceData) => void 
}) {
  return (
    <div>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Workspace Settings</h3>
      <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Workspace Name</label>
          <input
            value={activeWorkspace.name}
            onChange={e => onUpdateWorkspace({ ...activeWorkspace, name: e.target.value, icon: e.target.value.charAt(0).toUpperCase() })}
            style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
