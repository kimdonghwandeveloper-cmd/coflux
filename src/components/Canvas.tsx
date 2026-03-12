import { useState, useEffect, useRef } from 'react';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import "@blocknote/mantine/style.css";
import { PageData } from '../App';
import { Trash2, Image as ImageIcon, Wifi } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';

// Sub-component wrapper because `useCreateBlockNote` hook depends on provider
const CollaborativeEditor = ({ provider, currentTheme }: { provider: any, currentTheme: 'light' | 'dark' }) => {
  const editor = useCreateBlockNote({
    collaboration: {
      provider,
      fragment: provider.doc.getXmlFragment("blocknote"),
      user: { name: "Coflux User", color: "#2e2e2e" }
    }
  });

  return <BlockNoteView editor={editor} theme={currentTheme} />;
};

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const [provider, setProvider] = useState<any>(null);

  // Initialize Y.Doc directly from SQLite Rust Database (Local Persistence)
  useEffect(() => {
    let ydoc: Y.Doc;
    
    const initYjs = async () => {
      ydoc = new Y.Doc();
      
      try {
        const updates: number[][] = await invoke('get_yjs_updates', { pageId: activePage.id });
        ydoc.transact(() => {
          updates.forEach(u => {
            Y.applyUpdate(ydoc, new Uint8Array(u));
          });
        });
      } catch (e) { console.error("Failed to load yjs updates", e); }

      // Hook up local writes
      ydoc.on('update', async (update: Uint8Array, origin: any) => {
        try {
          // Save locally
          await invoke('save_yjs_update', { pageId: activePage.id, updateBlob: Array.from(update) });
          // If we are actively editing, broadcast remote sync
          if (origin !== 'remote') {
            const base64Str = btoa(String.fromCharCode.apply(null, Array.from(update)));
            webrtcClient.sendMessage(`crdt|${activePage.id}|${base64Str}`).catch(() => {});
          }
        } catch (e) { console.error("Update Hook Error:", e); }
      });

      const awareness = new Awareness(ydoc);
      // Construct a minimal provider interface expected by y-prosemirror / blocknote
      setProvider({
        doc: ydoc,
        awareness,
        on: () => {},
        off: () => {}
      });
    };

    setProvider(null);
    initYjs();

    return () => {
      if (ydoc) ydoc.destroy();
    };
  }, [activePage.id]);

  // Handle WebRTC listeners
  useEffect(() => {
    let unlistenOpen: UnlistenFn;
    let unlistenMsg: UnlistenFn;

    const setupListeners = async () => {
      unlistenOpen = await listen('webrtc-open', () => {
        setConnState('Connected!');
      });

      unlistenMsg = await listen<string>('webrtc-msg', (event) => {
        const text = event.payload;
        if (text.startsWith('crdt|')) {
           const parts = text.split('|');
           const pageId = parts[1];
           const base64Str = parts[2];
           // If the payload matches current page, apply Yjs CRDT
           if (pageId === activePage.id && provider?.doc) {
               try {
                  const binaryStr = atob(base64Str);
                  const len = binaryStr.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                     bytes[i] = binaryStr.charCodeAt(i);
                  }
                  Y.applyUpdate(provider.doc, bytes, 'remote');
               } catch(e) { console.error("CRDT Merge Failed:", e); }
           }
        }
      });
    };
    setupListeners();

    return () => { 
      if (unlistenOpen) unlistenOpen(); 
      if (unlistenMsg) unlistenMsg();
    };
  }, [activePage.id, provider]);

  const handleGenerateOffer = async () => {
    const sdp = await webrtcClient.generateOffer();
    setOffer(sdp);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const handleAcceptOffer = async () => {
    const sdpText = await webrtcClient.readClipboardSdp();
    const answerSdp = await webrtcClient.acceptOffer(sdpText);
    setOffer(answerSdp);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const handleAcceptAnswer = async () => {
    const sdpText = await webrtcClient.readClipboardSdp();
    await webrtcClient.acceptAnswer(sdpText);
    setConnState('Connected!');
  };

  const handleAddCover = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{
          name: 'Image',
          extensions: ['png', 'jpeg', 'jpg', 'webp']
        }]
      });
      
      if (!selectedPath || typeof selectedPath !== 'string') return;

      // Read raw bytes using plugin-fs
      const fileBytes = await readFile(selectedPath);
      
      // Convert raw Uint8Array to Blob then Object URL
      const blob = new Blob([fileBytes]);
      const imageUrl = URL.createObjectURL(blob);

      // Create an image element to resize it off-screen
      const img = new Image();
      img.onload = () => {
         const maxWidth = 1200;
         let width = img.width;
         let height = img.height;
         
         if (width > maxWidth) {
           height = Math.round((height * maxWidth) / width);
           width = maxWidth;
         }

         const canvas = document.createElement('canvas');
         canvas.width = width;
         canvas.height = height;
         const ctx = canvas.getContext('2d');
         if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress as JPEG to save SQLite space and P2P bandwidth
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            onUpdatePage({ ...activePage, coverImage: compressedBase64 });
         }
         URL.revokeObjectURL(imageUrl); // Free memory
      };
      img.src = imageUrl;
      
    } catch (e) {
       console.error("Failed to set cover image:", e);
    }
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

      {/* Notion-style Cover Banner Region */}
      {activePage.coverImage && (
        <div style={{ 
          width: '100%', 
          height: '240px', 
          backgroundImage: `url(${activePage.coverImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative'
        }}>
           <button 
             className="notion-btn" 
             onClick={handleAddCover}
             style={{ position: 'absolute', bottom: '16px', right: '80px', background: 'rgba(255,255,255,0.8)', color: '#000', border: 'none', padding: '4px 8px', fontSize: '12px' }}
           >
             Change cover
           </button>
        </div>
      )}

      {/* When Cover Exists, pull the icon up to overlap */}
      <div style={{ padding: activePage.coverImage ? '0 80px 40px' : '60px 80px 40px', maxWidth: '900px', margin: '0 auto' }}>
        
        {/* Page Icon (Emoji) */}
        <div style={{ position: 'relative' }}>
          <div 
              style={{ 
                  fontSize: '78px', 
                  marginBottom: '16px', 
                  lineHeight: 1.1,
                  marginTop: activePage.coverImage ? '-40px' : '0',
                  position: 'relative',
                  zIndex: 2,
                  display: 'inline-block',
                  cursor: 'pointer',
                  filter: showEmojiPicker ? 'brightness(0.8)' : 'none',
                  transition: 'filter 0.2s',
                  userSelect: 'none'
              }}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
              {activePage.icon}
          </div>

          {/* Emoji Picker Popover */}
          {showEmojiPicker && (
            <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, boxShadow: '0 8px 30px rgba(0,0,0,0.15)', borderRadius: '12px' }}>
              <EmojiPicker 
                theme={currentTheme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                onEmojiClick={(emojiData) => {
                  onUpdatePage({ ...activePage, icon: emojiData.emoji });
                  setShowEmojiPicker(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Action Controls (Add cover, icon...) */}
        {!activePage.coverImage && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', opacity: 0.6 }}>
            <button className="notion-btn" onClick={handleAddCover} style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)', padding: '4px 0', fontSize: '13px' }}>
              <ImageIcon size={14} style={{ marginRight: '4px' }} /> Add cover
            </button>
          </div>
        )}
        
        {/* Title Input */}
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
          <button className="notion-btn" onClick={() => onDeletePage(activePage.id)} style={{ border: 'none', background: 'transparent', color: 'var(--error)', padding: '4px 0' }}>
            <Trash2 size={16} /> Delete Page
          </button>
        </div>

        <div style={{ marginLeft: '-50px' }}>
          {provider ? <CollaborativeEditor provider={provider} currentTheme={currentTheme} /> : <div>Loading page data...</div>}
        </div>
      </div>
    </div>
  );
};
