import { useState, useEffect } from 'react';
import './App.css';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { Menu, Search, Users, Bell, Sparkles } from 'lucide-react';
import { AiChatWidget } from './components/AiChatWidget';

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

  const [pages, setPages] = useState<PageData[]>([
    { id: '1', title: 'Getting Started', icon: '🚀', updatedAt: 'Mar 12, 2026' },
    { id: '2', title: 'Team Meetings', icon: '📅', updatedAt: 'Mar 12, 2026' },
    { id: '3', title: 'Project Documentation', icon: '📚', updatedAt: 'Mar 12, 2026' },
  ]);
  const [activePageId, setActivePageId] = useState('1');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-container">
      {sidebarOpen && (
        <Sidebar 
          theme={theme} 
          toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
          pages={pages}
          activePageId={activePageId}
          setActivePageId={setActivePageId}
          onAddPage={() => {
            const newId = Date.now().toString();
            setPages([...pages, { id: newId, title: 'Untitled', icon: '📄', updatedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }]);
            setActivePageId(newId);
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

        <Canvas 
          currentTheme={theme} 
          activePage={pages.find(p => p.id === activePageId) || pages[0]}
          onUpdatePage={(updated: PageData) => {
            setPages(pages.map(p => p.id === updated.id ? updated : p));
          }}
          onDeletePage={(id: string) => {
            const newPages = pages.filter(p => p.id !== id);
            setPages(newPages);
            if (activePageId === id && newPages.length > 0) setActivePageId(newPages[0].id);
          }}
        />
      </div>
    </div>
  );
}

export default App;
