import { useState, useEffect } from 'react';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import { PageData } from '../App';
import { Trash2, Image as ImageIcon, Wifi } from 'lucide-react';

export const Canvas = ({ 
  currentTheme, 
  activePage, 
  onUpdatePage, 
  onDeletePage 
}: { 
  currentTheme: 'light' | 'dark',
  activePage: PageData,
  onUpdatePage: (p: PageData) => void,
  onDeletePage: (id: string) => void
}) => {
  const [offer, setOffer] = useState('');
  const [connState, setConnState] = useState('Disconnected');
  const [copied, setCopied] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);

  // Initialize BlockNote Core
  const editor = useCreateBlockNote();

  // Handle WebRTC listeners
  useEffect(() => {
    let unlistenOpen: UnlistenFn;
    const setupListeners = async () => {
      unlistenOpen = await listen('webrtc-open', () => {
        setConnState('Connected!');
      });
    };
    setupListeners();
    return () => { if (unlistenOpen) unlistenOpen(); };
  }, []);

  const handleGenerateOffer = async () => {
    const sdp = await webrtcClient.generateOffer();
    setOffer(sdp);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const handleAcceptOffer = async () => {
    const sdpText = await webrtcClient.readClipboardSdp();
    await webrtcClient.acceptOffer(sdpText);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const handleAcceptAnswer = async () => {
    const sdpText = await webrtcClient.readClipboardSdp();
    await webrtcClient.acceptAnswer(sdpText);
    setConnState('Connected!');
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
      
      {/* Network Debug Bar (Floating Bottom Right) */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10 }}>
        <button 
          className="notion-btn" 
          onClick={() => setShowNetwork(!showNetwork)}
          style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0, justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
        >
          <Wifi size={16} color={connState === 'Connected!' ? 'var(--success)' : 'var(--text-secondary)'} />
        </button>
        {showNetwork && (
          <div style={{ position: 'absolute', bottom: '44px', right: 0, background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', width: '240px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status: {connState}</div>
            <button className="notion-btn" onClick={handleGenerateOffer} style={{ fontSize: '11px', padding: '4px' }}>1. Generate Offer</button>
            <button className="notion-btn" onClick={handleAcceptOffer} style={{ fontSize: '11px', padding: '4px' }}>2. Accept Offer</button>
            <button className="notion-btn" onClick={handleAcceptAnswer} style={{ fontSize: '11px', padding: '4px' }}>3. Accept Answer</button>
            {copied && <div style={{ fontSize: '10px', color: 'var(--success)' }}>Copied! Length: {offer.length}</div>}
          </div>
        )}
      </div>

      <div style={{ padding: '60px 80px 40px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px', lineHeight: 1 }}>{activePage.icon}</div>
        
        <input 
          value={activePage.title}
          onChange={e => onUpdatePage({...activePage, title: e.target.value})}
          placeholder="Page Title"
          style={{ 
            fontSize: '40px', 
            fontWeight: 700, 
            margin: '0 0 12px 0', 
            letterSpacing: '-0.02em', 
            outline: 'none', 
            color: 'var(--text-primary)', 
            background: 'transparent', 
            border: 'none', 
            width: '100%',
            fontFamily: 'inherit'
          }} 
        />
        
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '6px' }}>
           Updated {activePage.updatedAt}
        </div>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '24px', 
          borderBottom: '1px solid var(--border-color)', 
          paddingBottom: '12px',
          gap: '16px'
        }}>
          <button className="notion-btn" style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', padding: '4px 0' }}>
            <ImageIcon size={16} /> Add image
          </button>
          <button className="notion-btn" onClick={() => onDeletePage(activePage.id)} style={{ border: 'none', background: 'transparent', color: 'var(--error)', padding: '4px 0' }}>
            <Trash2 size={16} /> Delete
          </button>
        </div>

        <div style={{ marginLeft: '-50px' }}>
          <BlockNoteView editor={editor} theme={currentTheme} />
        </div>
      </div>
    </div>
  );
};
