import { useState, useEffect } from 'react';
import './App.css';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { Menu, Search, Users, Bell, Sparkles } from 'lucide-react';
import { AiChatWidget } from './components/AiChatWidget';
import { invoke } from '@tauri-apps/api/core';

export interface PageData {
  id: string;
  title: string;
  icon: string;
  updatedAt: string;
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);

  const [pages, setPages] = useState<PageData[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);

  // Load from SQLite DB on mount
  useEffect(() => {
    async function loadPages() {
      try {
        const loadedPages: PageData[] = await invoke('get_pages');
        if (loadedPages.length === 0) {
          // Initialize default workspace if empty
          const defaultPage = { id: '1', title: 'Getting Started', icon: '🚀', updatedAt: new Date().toLocaleDateString() };
          await invoke('save_page', { page: defaultPage });
          setPages([defaultPage]);
          setActivePageId('1');
        } else {
          setPages(loadedPages);
          setActivePageId(loadedPages[0].id);
        }
      } catch (e) {
        console.error("Failed to load pages from DB:", e);
        // Fallback so the app doesn't white-screen if the DB fails
        setPages([{ id: '1', title: 'Error Loading DB', icon: '⚠️', updatedAt: new Date().toLocaleDateString() }]);
        setActivePageId('1');
      }
    }
    loadPages();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      {sidebarOpen && activePageId && (
        <Sidebar 
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
          pages={pages}
          activePageId={activePageId}
          setActivePageId={setActivePageId}
          onAddPage={async () => {
            const newId = Date.now().toString();
            const newPage = { id: newId, title: 'Untitled', icon: '📄', updatedAt: new Date().toLocaleDateString() };
            try {
              await invoke('save_page', { page: newPage });
              setPages([...pages, newPage]);
              setActivePageId(newId);
            } catch (e) { console.error(e); }
          }}
        />
      )}

      <div className="main-content">
        {/* Figma Top Bar */}
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

        {/* Floating AI Chat Overlay */}
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
            onDeletePage={async (id: string) => {
              try {
                await invoke('delete_page', { pageId: id });
                const newPages = pages.filter(p => p.id !== id);
                setPages(newPages);
                if (activePageId === id && newPages.length > 0) setActivePageId(newPages[0].id);
              } catch (e) { console.error(e); }
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
