import { Moon, Sun, X } from 'lucide-react';
import { WorkspaceData } from '../App';

export const SettingsModal = ({ 
  theme, 
  toggleTheme, 
  activeWorkspace,
  onUpdateWorkspace,
  onClose 
}: { 
  theme: string, 
  toggleTheme: () => void,
  activeWorkspace: WorkspaceData | undefined,
  onUpdateWorkspace: (ws: WorkspaceData) => void,
  onClose: () => void
}) => {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'slideUpFade 0.15s ease-out forwards' }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', width: '480px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.2)', border: '1px solid var(--border-color)' }}
        onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid var(--border-color)' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Settings</h2>
          <div onClick={onClose} style={{ cursor: 'pointer', padding: '4px' }}>
            <X size={18} color="var(--text-secondary)" />
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Appearance */}
          <div style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Appearance</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <span style={{ fontSize: '14px' }}>Theme</span>
              <div onClick={toggleTheme} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '6px 12px', borderRadius: '6px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                <span style={{ fontSize: '13px' }}>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
              </div>
            </div>
          </div>

          {/* Workspace */}
          {activeWorkspace && (
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Workspace</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0' }}>
                <span style={{ fontSize: '14px', minWidth: '80px' }}>Name</span>
                <input 
                  value={activeWorkspace.name}
                  onChange={e => onUpdateWorkspace({ ...activeWorkspace, name: e.target.value, icon: e.target.value.charAt(0).toUpperCase() })}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' }}
                />
              </div>
            </div>
          )}

          {/* About */}
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>About</h3>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              <p style={{ margin: '4px 0' }}>Coflux v0.1.0</p>
              <p style={{ margin: '4px 0' }}>P2P AI Bridge System</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
