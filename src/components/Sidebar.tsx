import { useState, useRef, useEffect } from 'react';
import { Plus, Settings, Moon, Sun, MoreHorizontal, Star, Trash2 } from 'lucide-react';
import { PageData } from '../App';

export const Sidebar = ({ 
  theme, 
  toggleTheme, 
  pages,
  activePageId,
  setActivePageId,
  onAddPage,
  onUpdatePage,
  onDeletePage
}: { 
  theme: string, 
  toggleTheme: () => void,
  pages: PageData[],
  activePageId: string,
  setActivePageId: (id: string) => void,
  onAddPage: () => void,
  onUpdatePage: (p: PageData) => void,
  onDeletePage: (id: string) => void
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const favoritePages = pages.filter(p => p.isFavorite);
  const privatePages = pages.filter(p => !p.isFavorite);

  const renderPageItem = (page: PageData) => (
    <div 
      key={page.id} 
      className={`sidebar-item ${activePageId === page.id ? 'active' : ''}`}
      onClick={() => setActivePageId(page.id)}
      style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', paddingRight: '4px' }}
      onMouseLeave={() => { /* optional hover state clearing */ }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
        <span style={{ fontSize: '16px' }}>{page.icon}</span>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page.title}</span>
      </div>
      
      {/* ... Button container */}
      <div 
        className="sidebar-item-actions"
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuId(openMenuId === page.id ? null : page.id);
        }}
        style={{ padding: '2px', borderRadius: '4px', cursor: 'pointer', display: 'flex' }}
      >
        <MoreHorizontal size={16} color="var(--text-secondary)" />
      </div>

      {/* Context Menu Popover */}
      {openMenuId === page.id && (
        <div 
          ref={menuRef}
          style={{
            position: 'absolute',
            top: '28px',
            right: '8px',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            borderRadius: '6px',
            zIndex: 100,
            padding: '4px',
            width: '200px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
          onClick={e => e.stopPropagation()}
        >
          <div 
            className="sidebar-item" 
            style={{ margin: 0, padding: '6px 8px' }}
            onClick={(e) => {
              e.stopPropagation();
              onUpdatePage({ ...page, isFavorite: !page.isFavorite });
              setOpenMenuId(null);
            }}
          >
            <Star size={14} fill={page.isFavorite ? 'currentColor' : 'none'} color={page.isFavorite ? 'var(--accent)' : 'var(--text-secondary)'} />
            <span style={{ fontSize: '13px' }}>{page.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
          </div>
          
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />

          <div 
            className="sidebar-item" 
            style={{ margin: 0, padding: '6px 8px', color: 'var(--error)' }}
            onClick={(e) => {
              e.stopPropagation();
              onDeletePage(page.id);
              setOpenMenuId(null);
            }}
          >
            <Trash2 size={14} />
            <span style={{ fontSize: '13px' }}>Delete</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="sidebar" style={{ paddingTop: '16px' }}>
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

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {favoritePages.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ padding: '0 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Favorites
            </div>
            {favoritePages.map(renderPageItem)}
          </div>
        )}

        <div>
          <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Private
            </div>
            <div onClick={onAddPage} style={{ cursor: 'pointer', padding: '2px', display: 'flex' }}>
              <Plus size={16} color="var(--text-secondary)" />
            </div>
          </div>
          {privatePages.map(renderPageItem)}
        </div>
      </div>

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
