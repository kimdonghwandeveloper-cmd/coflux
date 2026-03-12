import { useState, useEffect } from 'react';
import './App.css';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { webrtcClient } from './lib/webrtc_client';
import { Menu } from 'lucide-react';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [userStatus, setUserStatus] = useState('Active');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Poll User OS Activity globally to share with Sidebar and Canvas
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await webrtcClient.getUserStatus();
        setUserStatus(status);
      } catch (e) {
        console.error(e);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-container">
      <Sidebar 
        theme={theme} 
        toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        userStatus={userStatus} 
      />
      <div className="main-content">
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="notion-btn" 
            style={{ padding: '6px', border: 'none', background: 'transparent' }}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Sidebar"
          >
            <Menu size={20} color="var(--text-secondary)" />
          </button>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Coflux Workspace / General Workspace</div>
        </div>
        <Canvas />
      </div>
    </div>
  );
}

export default App;
