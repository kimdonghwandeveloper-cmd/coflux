import { useState, useRef, useEffect } from 'react';
import { Plus, Settings, Moon, Sun, MoreHorizontal, Star, Trash2, ChevronDown } from 'lucide-react';
import { PageData, WorkspaceData } from '../App';

export const Sidebar = ({ 
  theme, 
  toggleTheme, 
  pages,
  activePageId,
  setActivePageId,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onAddWorkspace,
  onAddPage,
  onUpdatePage,
  onDeletePage
}: { 
  theme: string, 
  toggleTheme: () => void,
  pages: PageData[],
  activePageId: string,
  setActivePageId: (id: string) => void,
  workspaces: WorkspaceData[],
  activeWorkspaceId: string,
  onSwitchWorkspace: (id: string) => void,
  onAddWorkspace: (name: string) => void,
  onAddPage: () => void,
  onUpdatePage: (p: PageData) => void,
  onDeletePage: (id: string) => void
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenuId(null);
      if (wsRef.current && !wsRef.current.contains(event.target as Node)) setShowWsDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
  
  // Only show root-level pages in sidebar (sub-pages are inside their parent page)
  const rootPages = pages.filter(p => !p.parentId);
  const favoritePages = rootPages.filter(p => p.isFavorite);
  const privatePages = rootPages.filter(p => !p.isFavorite);

  const renderPageItem = (page: PageData) => (
    <div 
      key={page.id} 
      className={`sidebar-item ${activePageId === page.id ? 'active' : ''}`}
      onClick={() => setActivePageId(page.id)}
      style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', paddingRight: '4px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
        <span style={{ fontSize: '16px' }}>{page.icon}</span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page.title}</span>
      </div>
      
      <div 
        className="sidebar-item-actions"
        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === page.id ? null : page.id); }}
        style={{ padding: '2px', borderRadius: '4px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
      >
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>

      {openMenuId === page.id && (
        <div 
          ref={menuRef}
          style={{ position: 'absolute', top: '28px', right: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '6px', zIndex: 100, padding: '4px', width: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="sidebar-item" style={{ margin: 0, padding: '6px 8px' }}
            onClick={(e) => { e.stopPropagation(); onUpdatePage({ ...page, isFavorite: !page.isFavorite }); setOpenMenuId(null); }}>
            <Star size={14} fill={page.isFavorite ? 'currentColor' : 'none'} color={page.isFavorite ? 'var(--accent)' : 'var(--text-secondary)'} />
            <span style={{ fontSize: '13px' }}>{page.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
          </div>
          
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

          <div className="sidebar-item" style={{ margin: 0, padding: '6px 8px', color: 'var(--error)' }}
            onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); setOpenMenuId(null); }}>
            <Trash2 size={14} />
            <span style={{ fontSize: '13px' }}>Delete</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="sidebar" style={{ paddingTop: '16px' }}>
      {/* Workspace Selector */}
      <div style={{ padding: '0 16px 24px', position: 'relative' }} ref={wsRef}>
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px 0' }}
          onClick={() => setShowWsDropdown(!showWsDropdown)}
        >
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>
            {activeWs?.icon || 'M'}
          </div>
          <div style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>{activeWs?.name || 'My Workspace'}</div>
          <ChevronDown size={14} color="var(--text-secondary)" />
        </div>

        {showWsDropdown && (
          <div style={{ position: 'absolute', top: '52px', left: '16px', right: '16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '8px', zIndex: 200, padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {workspaces.map(ws => (
              <div key={ws.id} className="sidebar-item"
                style={{ margin: 0, padding: '6px 8px', fontWeight: ws.id === activeWorkspaceId ? 600 : 400, background: ws.id === activeWorkspaceId ? 'var(--border-color)' : 'transparent' }}
                onClick={() => { onSwitchWorkspace(ws.id); setShowWsDropdown(false); }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '4px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{ws.icon}</div>
                <span style={{ fontSize: '13px' }}>{ws.name}</span>
              </div>
            ))}
            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
            <div style={{ display: 'flex', gap: '4px', padding: '4px' }}>
              <input type="text" value={newWsName} onChange={e => setNewWsName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newWsName.trim()) { onAddWorkspace(newWsName.trim()); setNewWsName(''); setShowWsDropdown(false); } }}
                placeholder="New workspace..."
                style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }} />
              <div onClick={() => { if (newWsName.trim()) { onAddWorkspace(newWsName.trim()); setNewWsName(''); setShowWsDropdown(false); } }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                <Plus size={16} color="var(--text-secondary)" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {favoritePages.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ padding: '0 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Favorites</div>
            {favoritePages.map(renderPageItem)}
          </div>
        )}

        <div>
          <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Private</div>
            <div onClick={onAddPage} style={{ cursor: 'pointer', padding: '2px', display: 'flex' }}>
              <Plus size={16} color="var(--text-secondary)" />
            </div>
          </div>
          {privatePages.map(renderPageItem)}
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
