import { Plus, Settings, Moon, Sun } from 'lucide-react';
import { PageData } from '../App';

export const Sidebar = ({ 
  theme, 
  toggleTheme, 
  pages,
  activePageId,
  setActivePageId,
  onAddPage
}: { 
  theme: string, 
  toggleTheme: () => void,
  pages: PageData[],
  activePageId: string,
  setActivePageId: (id: string) => void,
  onAddPage: () => void
}) => {
  return (
    <div className="sidebar" style={{ paddingTop: '16px' }}>
      {/* Profile Section (Figma: M My Workspace) */}
      <div style={{ padding: '0 16px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ 
          width: '28px', height: '28px', borderRadius: '6px', 
          backgroundColor: '#000', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '14px'
        }}>
          M
        </div>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>
          My Workspace
        </div>
      </div>

      {/* Pages Header */}
      <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Pages
        </div>
        <div onClick={onAddPage} style={{ cursor: 'pointer', padding: '2px', display: 'flex' }}>
          <Plus size={16} color="var(--text-secondary)" />
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {pages.map((page) => (
          <div 
            key={page.id} 
            className={`sidebar-item ${activePageId === page.id ? 'active' : ''}`}
            onClick={() => setActivePageId(page.id)}
          >
            <span style={{ fontSize: '16px' }}>{page.icon}</span>
            {page.title}
          </div>
        ))}
      </div>

      {/* Bottom Actions */}
      <div style={{ 
        padding: '12px 16px', 
        borderTop: '1px solid var(--border-color)', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div className="sidebar-item" style={{ margin: 0, padding: '4px 8px', gap: '8px' }} title="Settings">
          <Settings size={16} color="var(--text-secondary)" />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Settings</span>
        </div>
        <div className="sidebar-item" style={{ margin: 0, padding: '8px', justifyContent: 'center' }} onClick={toggleTheme} title="Toggle Theme">
          {theme === 'light' ? <Moon size={16} color="var(--text-secondary)"/> : <Sun size={16} color="var(--text-secondary)"/>} 
        </div>
      </div>
    </div>
  );
};
