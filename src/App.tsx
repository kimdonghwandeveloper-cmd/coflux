import { useState, useEffect } from 'react';
import './App.css';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
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
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const [workspaces, setWorkspaces] = useState<WorkspaceData[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

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

        const wsPages = loadedPages.filter(p => (p.workspaceId || 'default') === wsId);
        if (wsPages.length === 0) {
          const defaultPage: PageData = { id: '1', title: 'Getting Started', icon: '🚀', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: wsId, parentId: null };
          await invoke('save_page', { page: defaultPage });
          setPages([...loadedPages, defaultPage]);
          setActivePageId('1');
        } else {
          setActivePageId(wsPages[0].id);
        }
      } catch (e) {
        console.error("Failed to load from DB:", e);
        setPages([{ id: '1', title: 'Error Loading DB', icon: '⚠️', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: 'default', parentId: null }]);
        setActivePageId('1');
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Filter pages for the active workspace
  const workspacePages = pages.filter(p => (p.workspaceId || 'default') === activeWorkspaceId);

  const handleSwitchWorkspace = (wsId: string) => {
    setActiveWorkspaceId(wsId);
    const wsPages = pages.filter(p => (p.workspaceId || 'default') === wsId);
    if (wsPages.length > 0) {
      setActivePageId(wsPages[0].id);
    } else {
      setActivePageId(null);
    }
  };

  return (
    <div className="app-container">
      {sidebarOpen && (
        <Sidebar 
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
          pages={workspacePages}
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
            const newPage: PageData = { id: newId, title: 'Untitled', icon: '📄', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: activeWorkspaceId, parentId: null };
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
              // Cascade: remove from local state too (backend already cascades)
              const deletedIds = new Set<string>();
              const collectChildren = (pid: string) => { deletedIds.add(pid); pages.filter(p => p.parentId === pid).forEach(c => collectChildren(c.id)); };
              collectChildren(id);
              const newPages = pages.filter(p => !deletedIds.has(p.id));
              setPages(newPages);
              if (deletedIds.has(activePageId || '')) {
                const remaining = newPages.filter(p => (p.workspaceId || 'default') === activeWorkspaceId);
                setActivePageId(remaining.length > 0 ? remaining[0].id : null);
              }
            } catch (e) { console.error(e); }
          }}
        />
      )}

      <div className="main-content">
        <div className="top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!sidebarOpen && (
              <button 
                className="notion-btn" 
                style={{ padding: '6px', border: 'none', background: 'transparent' }}
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={20} color="var(--text-secondary)" />
              </button>
            )}
            <div className="search-container">
              <Search size={16} color="var(--text-secondary)" />
              <input type="text" className="search-input" placeholder="Search..." />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', color: 'var(--text-secondary)', fontSize: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={16} />
              <span>3 members</span>
            </div>
            <Bell size={18} style={{ cursor: 'pointer' }} />
            <button 
              className="notion-btn" 
              style={{ border: 'none', background: 'transparent', gap: '6px', color: chatOpen ? 'var(--accent)' : 'var(--text-primary)' }}
              onClick={() => setChatOpen(!chatOpen)}
            >
              <Sparkles size={16} fill={chatOpen ? 'currentColor' : 'none'} />
              AI Assistant
            </button>
          </div>
        </div>

        {chatOpen && (
          <div style={{ position: 'absolute', top: '70px', right: '24px', zIndex: 100, width: '360px', height: '500px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUpFade 0.3s ease-out forwards' }}>
            <AiChatWidget connState="Connected!" />
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
            childPages={pages.filter(p => p.parentId === activePageId)}
            onAddSubPage={async () => {
              const newId = Date.now().toString();
              const newPage: PageData = { id: newId, title: 'Untitled', icon: '📄', updatedAt: new Date().toLocaleDateString(), coverImage: null, isFavorite: false, workspaceId: activeWorkspaceId, parentId: activePageId };
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
    </div>
  );
}

export default App;
