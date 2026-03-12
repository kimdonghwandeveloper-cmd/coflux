import { useState, useEffect } from 'react';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BotMessageSquare, X, ChevronDown } from 'lucide-react';
import { AiChatWidget } from './AiChatWidget';

export const Canvas = () => {
  const [offer, setOffer] = useState('');
  const [connState, setConnState] = useState('Disconnected');
  const [copied, setCopied] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [userStatus, setUserStatus] = useState('Active');
  const [autoPing, setAutoPing] = useState(false);
  
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Poll User OS Activity
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

  // Auto Ping Network Failover Loop
  useEffect(() => {
    let pingInterval: any;
    if (autoPing && connState === 'Connected!') {
      pingInterval = setInterval(() => {
        if (userStatus !== 'Away') {
           webrtcClient.sendMessage(`ping_${Date.now()}`).catch(console.error);
        } else {
           setLatency(null);
        }
      }, 2000);
    }
    return () => clearInterval(pingInterval);
  }, [autoPing, connState, userStatus]);

  useEffect(() => {
    let unlistenOpen: UnlistenFn;
    let unlistenMsg: UnlistenFn;

    const setupListeners = async () => {
      unlistenOpen = await listen('webrtc-open', () => {
        setConnState('Connected!');
      });

      unlistenMsg = await listen<string>('webrtc-msg', (event) => {
        const text = event.payload;
        if (text.startsWith('ping_')) {
          webrtcClient.sendMessage(text.replace('ping_', 'pong_'));
        } else if (text.startsWith('pong_')) {
          const sentTime = parseInt(text.replace('pong_', ''), 10);
          setLatency(Date.now() - sentTime);
        }
      });
    };

    setupListeners();

    return () => {
      if (unlistenOpen) unlistenOpen();
      if (unlistenMsg) unlistenMsg();
    };
  }, []);

  const handleGenerateOffer = async () => {
    try {
      setConnState('Generating SDP...');
      const sdp = await webrtcClient.generateOffer();
      setOffer(sdp);
      setConnState('Offer Generated (Copied to Clipboard)');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      setConnState(`Error: ${e.message || e}`);
    }
  };

  const handleAcceptOffer = async () => {
    try {
      const sdpText = await webrtcClient.readClipboardSdp();
      setConnState('Accepting Offer...');
      await webrtcClient.acceptOffer(sdpText);
      setConnState('Answer Generated (Copied to Clipboard)');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      setConnState(`Error: ${e.message || e}`);
    }
  };

  const handleAcceptAnswer = async () => {
    try {
      const sdpText = await webrtcClient.readClipboardSdp();
      setConnState('Connecting...');
      await webrtcClient.acceptAnswer(sdpText);
      setConnState('Connected!');
    } catch (e: any) {
      setConnState(`Error: ${e.message || e}`);
    }
  };

  const TopMenuBtn = ({ label, menuKey, children }: any) => (
    <div style={{ position: 'relative' }}>
      <button 
        className="top-menu-btn"
        onClick={() => setActiveMenu(activeMenu === menuKey ? null : menuKey)}
        style={{ 
          background: activeMenu === menuKey ? 'var(--bg-secondary)' : 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          padding: '4px 12px',
          fontSize: '13px',
          cursor: 'pointer',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px'
        }}
      >
        {label} <ChevronDown size={12} />
      </button>
      {activeMenu === menuKey && (
        <div className="top-menu-dropdown" style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: '6px',
          padding: '8px',
          zIndex: 100,
          minWidth: '240px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, position: 'relative' }}>
      {/* Top Menu Bar */}
      <div style={{ 
        display: 'flex', 
        padding: '0 16px 8px', 
        borderBottom: '1px solid var(--border-color)',
        gap: '4px'
      }}>
        <TopMenuBtn label="SDP Signaling" menuKey="sdp">
          <button className="notion-btn" onClick={handleGenerateOffer}>1. Generate Offer</button>
          <button className="notion-btn" onClick={handleAcceptOffer}>2. Accept Offer</button>
          <button className="notion-btn" onClick={handleAcceptAnswer}>3. Accept Answer</button>
          {copied && <span style={{ fontSize: '12px', color: 'var(--success)', alignSelf: 'center' }}>Copied to clipboard!</span>}
          {offer && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '4px' }}>SDP Length: {offer.length} chars</div>}
        </TopMenuBtn>

        <TopMenuBtn label="Network Status" menuKey="network">
          <div style={{ padding: '4px 8px', fontSize: '13px' }}>
            <span style={{ color: connState.includes('Connected') ? 'var(--success)' : 'var(--text-primary)' }}>
              ● {connState}
            </span>
          </div>
          {connState === 'Connected!' && (
            <button className="notion-btn" onClick={() => setAutoPing(!autoPing)}>
              {autoPing ? 'Stop' : 'Start'} Auto Ping
            </button>
          )}
          {latency !== null && (
            <div style={{ padding: '4px 8px', fontSize: '13px', color: 'var(--success)' }}>Latency: {latency} ms</div>
          )}
        </TopMenuBtn>

        <TopMenuBtn label={`Activity: ${userStatus}`} menuKey="activity">
          <div style={{ padding: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            System state is currently {userStatus}.
            {userStatus === 'Away' && ' Heavy P2P tasks are suspended (Zero-cost failover).'}
          </div>
        </TopMenuBtn>
      </div>

      {/* Main Empty Canvas (Notion Page Body) */}
      <div style={{ padding: '40px 60px', flex: 1, overflowY: 'auto' }} onClick={() => setActiveMenu(null)}>
        <h1 style={{ fontSize: '40px', fontWeight: 700, margin: '0 0 16px 0', letterSpacing: '-0.02em', outline: 'none' }} contentEditable suppressContentEditableWarning>
          Untitled
        </h1>
        <div style={{ fontSize: '16px', color: 'var(--text-secondary)', minHeight: '100px', outline: 'none' }} contentEditable suppressContentEditableWarning>
          Press Enter to continue with an empty page, or type '/' for commands.
        </div>
      </div>

      {/* Floating AI Chat Widget */}
      <div style={{ position: 'absolute', bottom: '24px', right: '24px', zIndex: 50 }}>
        {chatOpen && (
          <div style={{ 
            width: '360px', 
            height: '480px', 
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'slideUpFade 0.3s ease-out forwards'
          }}>
            <div style={{ 
              padding: '12px 16px', 
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontWeight: 600,
              fontSize: '14px'
            }}>
              AI Router Chat (P2P Handover)
              <button onClick={() => setChatOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
              <AiChatWidget connState={connState} />
            </div>
          </div>
        )}
        
        <button 
          onClick={() => setChatOpen(!chatOpen)}
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '28px',
            background: 'var(--accent)',
            color: 'var(--bg-primary)',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            float: 'right',
            transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {chatOpen ? <X size={24} /> : <BotMessageSquare size={24} />}
        </button>
      </div>

      {/* Floating Widget Animations */}
      <style>{`
        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .top-menu-btn:hover {
          background: var(--bg-secondary) !important;
          color: var(--text-primary) !important;
        }
      `}</style>
    </div>
  );
};
