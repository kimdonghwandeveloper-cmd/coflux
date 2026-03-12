import { useState, useEffect } from 'react';
// @ts-ignore
import RGL, { WidthProvider } from 'react-grid-layout';

const GridLayout = WidthProvider(RGL);
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Moon, Sun, Link, Copy, Check, Activity } from 'lucide-react';

const layoutSchema = [
  { i: 'signaler', x: 0, y: 0, w: 4, h: 4, minW: 3, minH: 3 },
  { i: 'status', x: 4, y: 0, w: 8, h: 2, minW: 4, minH: 2 }
];

export const Canvas = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [offer, setOffer] = useState('');
  const [connState, setConnState] = useState('Disconnected');
  const [copied, setCopied] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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
        width={1000}
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
                  className="notion-btn" 
                  onClick={() => webrtcClient.sendMessage(`ping_${Date.now()}`)}
                >
                  <Activity size={16} /> Test Ping
                </button>
                {latency !== null && (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--success)' }}>
                    <strong>Latency:</strong> {latency} ms
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </GridLayout>
    </div>
  );
};
