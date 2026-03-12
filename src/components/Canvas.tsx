import { useState, useEffect, useCallback } from 'react';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import "@blocknote/mantine/style.css";
import { PageData } from '../App';
import { Image as ImageIcon, Wifi } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import { RiFileLine } from 'react-icons/ri';

// Sub-component wrapper because `useCreateBlockNote` hook depends on provider
const CollaborativeEditor = ({ provider, currentTheme, onAddSubPage, pageId }: { provider: any, currentTheme: 'light' | 'dark', onAddSubPage: () => void, pageId: string }) => {

  // Custom upload handler: save images to Rust DB and return a retrievable URL
  const uploadFile = useCallback(async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        try {
          await invoke('save_asset', { id: assetId, pageId, data: base64, mimeType: file.type });
        } catch (e) { console.error("Failed to save asset:", e); }
        // Return the base64 data URL directly (it's stored in DB for persistence via Yjs)
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  }, [pageId]);

  const editor = useCreateBlockNote({
    collaboration: {
      provider,
      fragment: provider.doc.getXmlFragment("blocknote"),
      user: { name: "Coflux User", color: "#2e2e2e" }
    },
    uploadFile
  });

  // Yjs UndoManager for Ctrl+Z / Ctrl+Y (ProseMirror history is disabled in collab mode)
  useEffect(() => {
    const fragment = provider.doc.getXmlFragment("blocknote");
    const undoManager = new Y.UndoManager(fragment);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoManager.undo();
      }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
        e.preventDefault();
        undoManager.redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      undoManager.destroy();
    };
  }, [provider]);

  const getCustomSlashMenuItems = useCallback((ed: any) => {
    // Filter out Heading 4, 5, 6 as they are redundant for this app
    const defaults = getDefaultReactSlashMenuItems(ed).filter(
      item => !["Heading 4", "Heading 5", "Heading 6"].includes(item.title)
    );
    
    const pageItem = {
      title: "Page",
      onItemClick: () => { onAddSubPage(); },
      aliases: ["page", "subpage", "sub-page"],
      group: "Basic blocks",
      icon: <RiFileLine size={18} />,
      subtext: "Embed a sub-page inside this page",
      key: "page",
    };
    return [...defaults, pageItem];
  }, [onAddSubPage]);

  return (
    <BlockNoteView editor={editor} theme={currentTheme} slashMenu={false}>
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) => filterSuggestionItems(getCustomSlashMenuItems(editor), query)}
      />
    </BlockNoteView>
  );
};

export const Canvas = ({ 
  currentTheme, 
  activePage, 
  onUpdatePage,
  childPages,
  onAddSubPage,
  onNavigateToPage,
  onUserCountChange,
  memberCount
}: { 
  currentTheme: 'light' | 'dark',
  activePage: PageData,
  onUpdatePage: (p: PageData) => void,
  childPages: PageData[],
  onAddSubPage: () => void,
  onNavigateToPage: (id: string) => void,
  onUserCountChange?: (count: number) => void,
  memberCount: number
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [provider, setProvider] = useState<any>(null);
  const [connState, setConnState] = useState('Disconnected');
  const [offer, setOffer] = useState('');
  const [copied, setCopied] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [remoteSdp, setRemoteSdp] = useState('');

  // Initialize Y.Doc directly from SQLite Rust Database (Local Persistence)
  useEffect(() => {
    let ydoc: Y.Doc;
    
    const initYjs = async () => {
      ydoc = new Y.Doc();

      // Load saved updates from Rust DB
      try {
        const savedUpdates: number[][] = await invoke('get_yjs_updates', { pageId: activePage.id });
        for (const updateArr of savedUpdates) {
          Y.applyUpdate(ydoc, new Uint8Array(updateArr));
        }
      } catch (e) { console.error("Failed to load Yjs updates from DB:", e); }

      // Listen for future updates and auto-save them
      ydoc.on('update', async (update: Uint8Array) => {
        try {
          await invoke('save_yjs_update', { pageId: activePage.id, updateBlob: Array.from(update) });
        } catch (e) { console.error("Failed to save Yjs update:", e); }
      });
      
      const awareness = new Awareness(ydoc);
      // Set local user info for Awareness (#3: Member display)
      awareness.setLocalStateField('user', {
        name: 'Coflux User',
        color: '#2e2e2e'
      });
      // Track active users
      const updateUsers = () => {
        const states = awareness.getStates();
        if (onUserCountChange) onUserCountChange(states.size);
      };
      awareness.on('change', updateUsers);
      updateUsers();

      setProvider({ doc: ydoc, awareness });
    };
    
    initYjs();
    return () => { if (ydoc) ydoc.destroy(); setProvider(null); };
  }, [activePage.id]);

  // --- WebRTC Connection state listener ---
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let unlistenConn: UnlistenFn | undefined;

    (async () => {
      try {
        unlisten = await listen<string>('webrtc-message', (event) => {
          console.log("Received from P2P:", event.payload);
        });
        unlistenConn = await listen<string>('webrtc-state', (event) => {
          setConnState(event.payload);
        });
      } catch {}
    })();

    return () => { unlisten?.(); unlistenConn?.(); };
  }, []);

  // ─── Cover Image logic ────────────────────────────
  const handleAddCover = async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }] });
      if (!selected) return;

      const filePath = typeof selected === 'string' ? selected : selected;
      const bytes = await readFile(filePath as any);
      const blob = new Blob([bytes], { type: 'image/png' });

      const compressedBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const scale = Math.min(1, MAX_WIDTH / img.width);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/webp', 0.75));
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(blob);
      });

      onUpdatePage({ ...activePage, coverImage: compressedBase64 });
    } catch (e) { console.error("Cover image error:", e); }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', position: 'relative' }}>
      {/* P2P Connection Status Pill + Network Panel */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 50 }}>
        <div onClick={() => setShowNetwork(!showNetwork)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <Wifi size={14} color={connState === 'Connected!' ? '#22c55e' : 'var(--text-secondary)'} />
          <span>{connState === 'Connected!' ? 'P2P Connected' : 'Local'}</span>
        </div>

        {showNetwork && (
          <div style={{ position: 'absolute', bottom: '40px', right: 0, width: '320px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', animation: 'slideUpFade 0.15s ease-out forwards' }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>P2P Connection</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Status: <span style={{ color: connState === 'Connected!' ? '#22c55e' : 'var(--error)' }}>{connState}</span>
            </div>

            {/* Step 1: Generate Offer */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step 1: Create Offer</div>
            <button className="notion-btn" style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
              onClick={async () => {
                try {
                  const o = await webrtcClient.generateOffer();
                  setOffer(o);
                } catch (e) { console.error(e); }
              }}>
              Generate Offer
            </button>

            {offer && (
              <>
                <textarea readOnly value={offer}
                  style={{ width: '100%', height: '50px', fontSize: '9px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', resize: 'none', fontFamily: 'monospace' }} />
                <button className="notion-btn" style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
                  onClick={() => { navigator.clipboard.writeText(offer); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                  {copied ? '✓ Copied!' : 'Copy to Clipboard'}
                </button>
              </>
            )}

            {/* Step 2: Accept Remote SDP */}
            <div style={{ height: '1px', background: 'var(--border-color)', margin: '2px 0' }} />
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Step 2: Accept Remote SDP</div>
            
            <textarea 
              value={remoteSdp}
              onChange={e => setRemoteSdp(e.target.value)}
              placeholder="Paste the other peer's Offer or Answer SDP here..."
              style={{ width: '100%', height: '60px', fontSize: '9px', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', resize: 'none', fontFamily: 'monospace' }} />
            
            <button className="notion-btn primary" style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
              onClick={async () => {
                const sdp = remoteSdp.trim();
                if (!sdp) return;
                try {
                  if (sdp.startsWith('{')) {
                    const parsed = JSON.parse(sdp);
                    if (parsed.type === 'offer') {
                      const answer = await webrtcClient.acceptOffer(sdp);
                      setOffer(answer);
                      setRemoteSdp('');
                    } else if (parsed.type === 'answer') {
                      await webrtcClient.acceptAnswer(sdp);
                      setRemoteSdp('');
                    }
                  }
                } catch (e) { console.error(e); }
              }}>
              Apply Pasted SDP
            </button>

            <button className="notion-btn" style={{ width: '100%', justifyContent: 'center', fontSize: '11px', opacity: 0.7 }}
              onClick={async () => {
                try {
                  const clipSdp = await webrtcClient.readClipboardSdp();
                  setRemoteSdp(clipSdp);
                } catch (e) { console.error(e); }
              }}>
              Read from Clipboard
            </button>
          </div>
        )}
      </div>
      {/* Cover Image Area */}
      {activePage.coverImage ? (
        <div style={{ position: 'relative', width: '100%', height: '200px', flexShrink: 0 }}>
          <img src={activePage.coverImage} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button onClick={handleAddCover} style={{ position: 'absolute', bottom: '12px', right: '16px', padding: '4px 12px', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Change cover</button>
          <button onClick={() => onUpdatePage({ ...activePage, coverImage: null })} style={{ position: 'absolute', bottom: '12px', right: '120px', padding: '4px 12px', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Remove</button>
        </div>
      ) : null}

      <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '32px 60px 100px', position: 'relative' }}>
        {/* Icon + Title Area */}
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ fontSize: '48px', cursor: 'pointer', marginBottom: '12px', transition: 'transform 0.15s', userSelect: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {activePage.icon}
          </div>
          {showEmojiPicker && (
            <div style={{ position: 'absolute', top: '60px', left: 0, zIndex: 50, animation: 'slideUpFade 0.15s ease-out forwards' }}>
              <EmojiPicker
                theme={currentTheme === 'dark' ? 'dark' as EmojiTheme : 'light' as EmojiTheme}
                onEmojiClick={(emojiData: { emoji: string }) => { onUpdatePage({ ...activePage, icon: emojiData.emoji }); setShowEmojiPicker(false); }}
                width={300} height={350}
              />
            </div>
          )}
        </div>

        {!activePage.coverImage && (
          <div onClick={handleAddCover} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.6 }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; }}>
            <ImageIcon size={14} /> Add cover
          </div>
        )}

        <input
          value={activePage.title}
          onChange={e => onUpdatePage({...activePage, title: e.target.value})}
          placeholder="Page Title"
          style={{ fontSize: '40px', fontWeight: 700, margin: '0 0 12px 0', letterSpacing: '-0.02em', outline: 'none', color: 'var(--text-primary)', background: 'transparent', border: 'none', width: '100%', fontFamily: 'inherit' }} 
        />
        
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>Updated {activePage.updatedAt}</span>
          {memberCount > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--accent)', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', animation: 'pulse 2s infinite' }} />
              {memberCount} members active
            </div>
          )}
        </div>

        <div style={{ marginLeft: '-50px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {provider ? <CollaborativeEditor provider={provider} currentTheme={currentTheme} onAddSubPage={onAddSubPage} pageId={activePage.id} /> : <div>Loading page data...</div>}
        </div>

        {/* Child Pages displayed as clickable Notion-style links */}
        {childPages.length > 0 && (
          <div style={{ marginTop: '16px', paddingTop: '8px' }}>
            {childPages.map(child => (
              <div 
                key={child.id}
                onClick={() => onNavigateToPage(child.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '14px', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: '15px' }}>{child.icon}</span>
                <span style={{ borderBottom: '1px solid var(--text-secondary)', paddingBottom: '1px' }}>{child.title || 'Untitled'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
