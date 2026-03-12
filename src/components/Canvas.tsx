import { useState, useEffect } from 'react';
import RGL, { WidthProvider } from 'react-grid-layout/legacy';

const GridLayout = WidthProvider(RGL);
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Moon, Sun, Link, Copy, Check, Activity } from 'lucide-react';
import { AiChatWidget } from './AiChatWidget';

const layoutSchema = [
  { i: 'signaler', x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'status', x: 4, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'activity', x: 8, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'chat', x: 0, y: 4, w: 8, h: 7, minW: 5, minH: 5 }
];

export const Canvas = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [offer, setOffer] = useState('');
  const [connState, setConnState] = useState('Disconnected');
  const [copied, setCopied] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [userStatus, setUserStatus] = useState('Active');
  const [autoPing, setAutoPing] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
        // [PHASE 2 ZERO-COST LOGIC]: Pause network failover loops if user is Away
        if (userStatus !== 'Away') {
           webrtcClient.sendMessage(`ping_${Date.now()}`).catch(console.error);
        } else {
           setLatency(null); // Clear latency to show it's paused
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

  return (
    <div style={{ padding: '20px', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontWeight: 600 }}>Coflux P2P Workspace</h2>
        <button 
          className="notion-btn" 
          onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />} 
          Theme
        </button>
      </div>
      
      <GridLayout 
        className="layout" 
        layout={layoutSchema} 
        cols={12} 
        rowHeight={30} 
        draggableHandle=".widget-header"
      >
        <div key="signaler">
          <div className="widget-header">
            <span>SDP Signaling</span>
          </div>
          <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
              Serverless Clipboard-based P2P connection exchange.
            </p>
            <button className="notion-btn primary" onClick={handleGenerateOffer}>
              <Link size={16} /> 1. Generate Offer
            </button>
            <button className="notion-btn" onClick={handleAcceptOffer}>
              <Copy size={16} /> 2. Accept Offer (from clipboard)
            </button>
            <button className="notion-btn primary" onClick={handleAcceptAnswer}>
              <Check size={16} /> 3. Accept Answer (from clipboard)
            </button>
            
            {offer && (
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                <strong>Last SDP Length:</strong> {offer.length} chars
              </div>
            )}
            {copied && <p style={{ fontSize: '12px', color: 'var(--success)', margin: 0 }}>Copied to clipboard!</p>}
          </div>
        </div>

        <div key="status">
          <div className="widget-header">
            <span>Network Status</span>
          </div>
          <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ 
                display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', 
                backgroundColor: connState === 'Connected!' ? 'var(--success)' : (connState.includes('Error') ? 'var(--error)' : 'var(--accent)'),
                marginRight: '8px'
              }}></span>
              <strong>{connState}</strong>
            </div>

            {connState === 'Connected!' && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <button 
                  className={`notion-btn ${autoPing ? 'primary' : ''}`}
                  onClick={() => setAutoPing(!autoPing)}
                >
                  <Activity size={16} /> {autoPing ? 'Stop Auto Ping' : 'Start Auto Ping'}
                </button>
                {latency !== null && userStatus !== 'Away' && (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--success)' }}>
                    <strong>Latency:</strong> {latency} ms
                  </p>
                )}
                {autoPing && userStatus === 'Away' && (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <em>Network Paused (Away mode)</em>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div key="activity">
          <div className="widget-header">
            <span>User Activity (Phase 2)</span>
          </div>
          <div className="widget-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ 
               padding: '20px', 
               borderRadius: '50%', 
               backgroundColor: userStatus === 'Active' ? 'var(--success)' : 'var(--text-secondary)',
               color: 'white',
               fontWeight: 'bold',
               fontSize: '18px',
               marginBottom: '10px',
               transition: 'background-color 0.5s ease'
            }}>
              {userStatus}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
              {userStatus === 'Active' 
                ? "Monitoring global mouse/keyboard events via rdev." 
                : "Idle threshold reached. Failover and heavy network tasks are suspended to preserve hardware resources (Zero-cost)."}
            </p>
          </div>
        </div>

        <div key="chat">
          <div className="widget-header">
            <span>AI Router Chat (P2P Handover & SQLite)</span>
          </div>
          <div className="widget-body" style={{ height: 'calc(100% - 30px)' }}>
            <AiChatWidget connState={connState} />
          </div>
        </div>
      </GridLayout>
    </div>
  );
};
