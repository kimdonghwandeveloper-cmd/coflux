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
const CollaborativeEditor = ({ provider, currentTheme, onAddSubPage }: { provider: any, currentTheme: 'light' | 'dark', onAddSubPage: () => void }) => {
  const editor = useCreateBlockNote({
    collaboration: {
      provider,
      fragment: provider.doc.getXmlFragment("blocknote"),
      user: { name: "Coflux User", color: "#2e2e2e" }
    }
  });

  const getCustomSlashMenuItems = useCallback((ed: any) => {
    const defaults = getDefaultReactSlashMenuItems(ed);
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
  onNavigateToPage
}: { 
  currentTheme: 'light' | 'dark',
  activePage: PageData,
  onUpdatePage: (p: PageData) => void,
  childPages: PageData[],
  onAddSubPage: () => void,
  onNavigateToPage: (id: string) => void
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
        
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '6px' }}>
           Updated {activePage.updatedAt}
        </div>

        <div style={{ marginLeft: '-50px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {provider ? <CollaborativeEditor provider={provider} currentTheme={currentTheme} onAddSubPage={onAddSubPage} /> : <div>Loading page data...</div>}
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
