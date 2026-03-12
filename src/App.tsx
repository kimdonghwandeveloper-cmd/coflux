import { useState, useEffect, useRef } from 'react';
import './App.css';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { SettingsModal } from './components/SettingsModal';
import { Menu, Search, Users, Bell, Sparkles } from 'lucide-react';
import { AiChatWidget } from './components/AiChatWidget';
import { invoke } from '@tauri-apps/api/core';

export interface WorkspaceData {
  id: string;
  name: string;
  icon: string;
  createdAt: string;
}

export interface PageData {
  id: string;
  title: string;
  icon: string;
  updatedAt: string;
  coverImage?: string | null;
  isFavorite?: boolean | null;
  workspaceId?: string | null;
  parentId?: string | null;
  isDeleted?: boolean | null;
  sortOrder?: number | null;
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load workspaces and pages from SQLite DB on mount
  useEffect(() => {
    async function loadData() {
      try {
        const loadedWs: WorkspaceData[] = await invoke('get_workspaces');
        setWorkspaces(loadedWs);
        const wsId = loadedWs.length > 0 ? loadedWs[0].id : 'default';
        setActiveWorkspaceId(wsId);

        const loadedPages: PageData[] = await invoke('get_pages');
        setPages(loadedPages);

        const wsPages = loadedPages.filter(p => (p.workspaceId || 'default') === wsId && !p.isDeleted);
        if (wsPages.length === 0) {
          const defaultPage: PageData = { id: '1', title: 'Getting Started', icon: '🚀', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: wsId, parentId: null, isDeleted: false };
          await invoke('save_page', { page: defaultPage });
          setPages([...loadedPages, defaultPage]);
          setActivePageId('1');
        } else {
          setActivePageId(wsPages[0].id);
        }
      } catch (e) {
        console.error("Failed to load from DB:", e);
        setPages([{ id: '1', title: 'Error Loading DB', icon: '⚠️', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: 'default', parentId: null, isDeleted: false }]);
        setActivePageId('1');
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Filter pages for the active workspace (excluding deleted)
  const workspacePages = pages.filter(p => (p.workspaceId || 'default') === activeWorkspaceId && !p.isDeleted);
  const trashedPages = pages.filter(p => (p.workspaceId || 'default') === activeWorkspaceId && p.isDeleted);

  // Search results: filter all non-deleted pages by title
  const searchResults = searchQuery.trim()
    ? pages.filter(p => !p.isDeleted && p.title.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
    : [];

  const handleSwitchWorkspace = (wsId: string) => {
    setActiveWorkspaceId(wsId);
    const wsPages = pages.filter(p => (p.workspaceId || 'default') === wsId && !p.isDeleted);
    setActivePageId(wsPages.length > 0 ? wsPages[0].id : null);
  };

  return (
    <div className="app-container">
      {sidebarOpen && (
        <Sidebar 
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
          pages={workspacePages}
          trashedPages={trashedPages}
          activePageId={activePageId || ''}
          setActivePageId={setActivePageId}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId || 'default'}
          onSwitchWorkspace={handleSwitchWorkspace}
          onAddWorkspace={async (name: string) => {
            const newId = Date.now().toString();
            const ws: WorkspaceData = { id: newId, name, icon: name.charAt(0).toUpperCase(), createdAt: new Date().toLocaleDateString() };
            try {
              await invoke('save_workspace', { workspace: ws });
              setWorkspaces([...workspaces, ws]);
              handleSwitchWorkspace(newId);
            } catch (e) { console.error(e); }
          }}
          onAddPage={async () => {
            const newId = Date.now().toString();
            const newPage: PageData = { id: newId, title: 'Untitled', icon: '📄', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: activeWorkspaceId, parentId: null, isDeleted: false, sortOrder: pages.length };
            try {
              await invoke('save_page', { page: newPage });
              setPages([...pages, newPage]);
              setActivePageId(newId);
            } catch (e) { console.error(e); }
          }}
          onUpdatePage={async (updated: PageData) => {
            try {
              await invoke('save_page', { page: updated });
              setPages(pages.map(p => p.id === updated.id ? updated : p));
            } catch (e) { console.error(e); }
          }}
          onDeletePage={async (id: string) => {
            try {
              await invoke('delete_page', { pageId: id });
              // Soft delete: mark as deleted in local state
              const markDeleted = (pid: string) => {
                setPages(prev => prev.map(p => p.id === pid || p.parentId === pid ? { ...p, isDeleted: true } : p));
              };
              markDeleted(id);
              if (activePageId === id) {
                const remaining = workspacePages.filter(p => p.id !== id);
                setActivePageId(remaining.length > 0 ? remaining[0].id : null);
              }
            } catch (e) { console.error(e); }
          }}
          onRestorePage={async (id: string) => {
            try {
              await invoke('restore_page', { pageId: id });
              setPages(prev => prev.map(p => p.id === id ? { ...p, isDeleted: false } : p));
            } catch (e) { console.error(e); }
          }}
          onPermanentlyDeletePage={async (id: string) => {
            try {
              await invoke('permanently_delete_page', { pageId: id });
              setPages(prev => prev.filter(p => p.id !== id && p.parentId !== id));
            } catch (e) { console.error(e); }
          }}
          onOpenSettings={() => setSettingsOpen(true)}
          onReorderPages={async (reorderedIds: string[]) => {
            const updated = pages.map(p => {
              const idx = reorderedIds.indexOf(p.id);
              return idx >= 0 ? { ...p, sortOrder: idx } : p;
            });
            setPages(updated);
            for (const p of updated.filter(pp => reorderedIds.includes(pp.id))) {
              try { await invoke('save_page', { page: p }); } catch (e) { console.error(e); }
            }
          }}
        />
      )}

      <div className="main-content">
        <div className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!sidebarOpen && (
              <button className="notion-btn" style={{ padding: '6px', border: 'none', background: 'transparent' }} onClick={() => setSidebarOpen(true)}>
                <Menu size={20} color="var(--text-secondary)" />
              </button>
            )}
            {/* Search with dropdown */}
            <div ref={searchRef} style={{ position: 'relative' }}>
              <div className="search-container">
                <Search size={16} color="var(--text-secondary)" />
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                />
              </div>
              {searchFocused && searchQuery.trim() && (
                <div style={{ position: 'absolute', top: '40px', left: 0, width: '320px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 300, padding: '4px', maxHeight: '300px', overflow: 'auto' }}>
                  {searchResults.length > 0 ? searchResults.map(p => (
                    <div key={p.id} className="sidebar-item" style={{ margin: 0, padding: '8px 12px' }}
                      onClick={() => { setActivePageId(p.id); setSearchQuery(''); setSearchFocused(false); if (p.workspaceId && p.workspaceId !== activeWorkspaceId) handleSwitchWorkspace(p.workspaceId); }}>
                      <span style={{ fontSize: '15px' }}>{p.icon}</span>
                      <span style={{ fontSize: '13px' }}>{p.title}</span>
                    </div>
                  )) : (
                    <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>No results found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={16} />
              <span>3 members</span>
            </div>
            <Bell size={18} style={{ cursor: 'pointer' }} />
            <button className="notion-btn" style={{ border: 'none', background: 'transparent', gap: '6px', color: chatOpen ? 'var(--accent)' : 'var(--text-primary)' }} onClick={() => setChatOpen(!chatOpen)}>
              <Sparkles size={16} fill={chatOpen ? 'currentColor' : 'none'} />
              AI Assistant
            </button>
          </div>
        </div>

        {chatOpen && (
          <div style={{ position: 'absolute', top: '70px', right: '24px', zIndex: 100, width: '360px', height: '500px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUpFade 0.3s ease-out forwards' }}>
            <AiChatWidget connState="Connected!" pageTitle={pages.find(p => p.id === activePageId)?.title} />
          </div>
        )}

        {activePageId && pages.length > 0 && (
          <Canvas 
            currentTheme={theme} 
            activePage={pages.find(p => p.id === activePageId) || pages[0]}
            onUpdatePage={async (updated: PageData) => {
              try {
                await invoke('save_page', { page: updated });
                setPages(pages.map(p => p.id === updated.id ? updated : p));
              } catch (e) { console.error(e); }
            }}
            childPages={pages.filter(p => p.parentId === activePageId && !p.isDeleted)}
            onAddSubPage={async () => {
              const newId = Date.now().toString();
              const newPage: PageData = { id: newId, title: 'Untitled', icon: '📄', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: activeWorkspaceId, parentId: activePageId, isDeleted: false };
              try {
                await invoke('save_page', { page: newPage });
                setPages([...pages, newPage]);
                setActivePageId(newId);
              } catch (e) { console.error(e); }
            }}
            onNavigateToPage={(id: string) => setActivePageId(id)}
          />
        )}
      </div>

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal 
          theme={theme}
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          activeWorkspace={workspaces.find(w => w.id === activeWorkspaceId)}
          onUpdateWorkspace={async (ws: WorkspaceData) => {
            try {
              await invoke('save_workspace', { workspace: ws });
              setWorkspaces(workspaces.map(w => w.id === ws.id ? ws : w));
            } catch (e) { console.error(e); }
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
