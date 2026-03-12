import { FileText, Plus, Settings, Moon, Sun, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export const Sidebar = ({ 
  theme, 
  toggleTheme, 
  userStatus 
}: { 
  theme: string, 
  toggleTheme: () => void,
  userStatus: string
}) => {
  const [pages, setPages] = useState(['General Workspace', 'AI Handover Logs', 'Team Ideas']);

  return (
    <div className="sidebar" style={{ paddingTop: '20px' }}>
      {/* Profile Section */}
      <div style={{ padding: '0 16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ 
          width: '32px', height: '32px', borderRadius: '4px', 
          backgroundColor: 'var(--accent)', color: 'var(--bg-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 'bold', fontSize: '14px'
        }}>
          C
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Coflux Engine</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {userStatus === 'Away' ? '⚫ Away' : '🟢 Active'}
          </div>
        </div>
      </div>

      {/* Workspaces / Pages */}
      <div style={{ padding: '0 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Private
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {pages.map((page, idx) => (
          <div key={idx} className="sidebar-item" style={{ fontSize: '13px' }}>
            <ChevronRight size={14} color="var(--text-secondary)" />
            <FileText size={14} color="var(--text-secondary)" />
            {page}
          </div>
        ))}
        
        <div 
          className="sidebar-item" 
          style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
          onClick={() => setPages([...pages, 'New Page'])}
        >
          <Plus size={16} /> Add a page
        </div>
      </div>

      {/* Bottom Actions (Icons Only) */}
      <div style={{ 
        padding: '12px 16px', 
        borderTop: '1px solid var(--border-color)', 
        display: 'flex', 
        gap: '8px' 
      }}>
        <div className="sidebar-item" style={{ margin: 0, padding: '8px', justifyContent: 'center' }} title="Settings">
          <Settings size={18} color="var(--text-secondary)" />
        </div>
        <div className="sidebar-item" style={{ margin: 0, padding: '8px', justifyContent: 'center' }} onClick={toggleTheme} title="Toggle Theme">
          {theme === 'light' ? <Moon size={18} color="var(--text-secondary)"/> : <Sun size={18} color="var(--text-secondary)"/>} 
        </div>
      </div>
    </div>
  );
};
