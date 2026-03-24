import { useState, useEffect } from 'react';
import { getBacklinks, LinkPageInfo } from '../lib/embeddings';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { PageData } from '../App';
import { WorkspaceTheme } from '../lib/theme';
import { Image as ImageIcon, Wifi, Palette, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { invoke } from '@tauri-apps/api/core';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import CollaborativeEditor from './CollaborativeEditor';

export const Canvas = ({
  currentTheme,
  workspaceTheme,
  activePage,
  onUpdatePage,
  childPages,
  allPages,
  onAddSubPage,
  onNavigateToPage,
  onUserCountChange,
  memberCount
}: {
  currentTheme: 'light' | 'dark',
  workspaceTheme?: WorkspaceTheme,
  activePage: PageData,
  allPages?: PageData[],
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
  const [backlinks, setBacklinks] = useState<LinkPageInfo[]>([]);
  const [offer, setOffer] = useState('');
  const [copied, setCopied] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
  const [remoteSdp, setRemoteSdp] = useState('');
  const [localTitle, setLocalTitle] = useState(activePage.title);

  // E27: 페이지 제목 색상 지정 Popover
  const [showTitleConfig, setShowTitleConfig] = useState(false);
  const [isTitleHovered, setIsTitleHovered] = useState(false);

  // E27: BlockNote 호환 컬러맵 배열 및 HEX 명시적 정의
  const HIGHLIGHT_COLORS: Record<string, { text: string; bg: string; darkText: string; darkBg: string }> = {
    gray: { text: 'var(--auto-text-color)', bg: 'rgba(120, 119, 116, 0.15)', darkText: 'var(--auto-text-color)', darkBg: 'rgba(155, 154, 151, 0.15)' },
    brown: { text: '#9f6b53', bg: 'rgba(159, 107, 83, 0.15)', darkText: '#ba856f', darkBg: 'rgba(186, 133, 111, 0.15)' },
    red: { text: '#d44c47', bg: 'rgba(212, 76, 71, 0.15)', darkText: '#df5452', darkBg: 'rgba(223, 84, 82, 0.15)' },
    orange: { text: '#d9730d', bg: 'rgba(217, 115, 13, 0.15)', darkText: '#c77e23', darkBg: 'rgba(199, 126, 35, 0.15)' },
    yellow: { text: '#cb912f', bg: 'rgba(203, 145, 47, 0.15)', darkText: '#ca9849', darkBg: 'rgba(202, 152, 73, 0.15)' },
    green: { text: '#448361', bg: 'rgba(68, 131, 97, 0.15)', darkText: '#529e72', darkBg: 'rgba(82, 158, 114, 0.15)' },
    blue: { text: '#337ea9', bg: 'rgba(51, 126, 169, 0.15)', darkText: '#5e87c9', darkBg: 'rgba(94, 135, 201, 0.15)' },
    purple: { text: '#9065b0', bg: 'rgba(144, 101, 176, 0.15)', darkText: '#9d68d3', darkBg: 'rgba(157, 104, 211, 0.15)' },
    pink: { text: '#c14c8a', bg: 'rgba(193, 76, 138, 0.15)', darkText: '#d15796', darkBg: 'rgba(209, 87, 150, 0.15)' },
  };

  const getHighlightColor = (type: 'text' | 'bg', color: string | null | undefined) => {
    if (!color) return type === 'text' ? 'var(--auto-text-color)' : 'transparent';
    const mapped = HIGHLIGHT_COLORS[color];
    if (!mapped) return type === 'text' ? 'var(--auto-text-color)' : 'transparent';
    const isDark = currentTheme === 'dark';
    return isDark ? (type === 'text' ? mapped.darkText : mapped.darkBg) : (type === 'text' ? mapped.text : mapped.bg);
  };

  const titleColors = [
    { label: 'Default', value: null },
    { label: 'Gray (Black)', value: 'gray' },
    { label: 'Brown', value: 'brown' },
    { label: 'Red', value: 'red' },
    { label: 'Orange', value: 'orange' },
    { label: 'Yellow', value: 'yellow' },
    { label: 'Green', value: 'green' },
    { label: 'Blue', value: 'blue' },
    { label: 'Purple', value: 'purple' },
    { label: 'Pink', value: 'pink' }
  ];

  // Keep local title in sync with prop when page changes
  useEffect(() => {
    setLocalTitle(activePage.title);
    getBacklinks(activePage.id).then(setBacklinks).catch(() => { });
  }, [activePage.id, activePage.title]);

  // Initialize Y.Doc directly from SQLite Rust Database (Local Persistence)
  useEffect(() => {
    let currentYdoc: Y.Doc | null = null;

    const initYjs = async () => {
      const ydoc = new Y.Doc();
      currentYdoc = ydoc;

      // Load saved updates from Rust DB
      try {
        const savedUpdates: number[][] = await invoke('get_yjs_updates', { pageId: activePage.id });
        for (const updateArr of savedUpdates) {
          Y.applyUpdate(ydoc, new Uint8Array(updateArr));
        }
      } catch (e) {
        console.error("Failed to load Yjs updates from DB:", e);
      }

      // Listen for future updates and auto-save them
      ydoc.on('update', async (update: Uint8Array) => {
        try {
          await invoke('save_yjs_update', {
            pageId: activePage.id,
            updateBlob: Array.from(update)
          });
        } catch (e) {
          console.error("Failed to save Yjs update:", e);
        }
      });

      const awareness = new Awareness(ydoc);

      const mockProvider = {
        doc: ydoc,
        awareness,
        on: (event: string, handler: any) => {
          if (event === 'sync') {
            setTimeout(() => handler(true), 0);
          }
          ydoc.on(event as any, handler);
        },
        off: (event: string, handler: any) => {
          ydoc.off(event as any, handler);
        },
        emit: (_event: string, ..._args: any[]) => { },
        destroy: () => { },
        connect: () => { },
        disconnect: () => { },
      };

      awareness.setLocalStateField('user', {
        name: 'Coflux User',
        color: '#2e2e2e'
      });

      const updateUsers = () => {
        const states = awareness.getStates();
        if (onUserCountChange) onUserCountChange(states.size);
      };
      awareness.on('change', updateUsers);
      updateUsers();

      setProvider(mockProvider);
    };

    initYjs();
    return () => {
      if (currentYdoc) currentYdoc.destroy();
      setProvider(null);
    };
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
      } catch { }
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
                {/* QR Code for mobile scanning */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '10px', background: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <QRCodeSVG value={offer} size={180} level="L" />
                  <span style={{ fontSize: '10px', color: '#666' }}>모바일에서 스캔</span>
                </div>
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

            {connState === 'Connected!' && (
              <>
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '2px 0' }} />
                <button className="notion-btn" style={{ width: '100%', justifyContent: 'center', fontSize: '12px', color: 'var(--error)', borderColor: 'var(--error)' }}
                  onClick={async () => {
                    try {
                      await webrtcClient.closeConnection();
                      setOffer('');
                      setRemoteSdp('');
                    } catch (e) { console.error(e); }
                  }}>
                  Disconnect
                </button>
              </>
            )}
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

        {/* E27: Title Input & Color Picker */}
        <div
          style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: '12px' }}
          onMouseEnter={() => setIsTitleHovered(true)}
          onMouseLeave={() => setIsTitleHovered(false)}
        >
          <input
            value={localTitle}
            onChange={e => setLocalTitle(e.target.value)}
            onBlur={() => {
              if (localTitle !== activePage.title) {
                onUpdatePage({ ...activePage, title: localTitle });
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="Page Title"
            className="page-title"
            style={{
              fontSize: '40px', fontWeight: 700, letterSpacing: '-0.02em', outline: 'none',
              color: getHighlightColor('text', activePage.titleColor),
              background: getHighlightColor('bg', activePage.titleBgColor),
              border: 'none', width: '100%', fontFamily: 'inherit',
              padding: activePage.titleBgColor ? '0 12px' : '0',
              borderRadius: '8px', transition: 'all 0.2s ease', marginLeft: activePage.titleBgColor ? '-12px' : '0'
            }}
          />

          <div
            style={{ position: 'absolute', right: 0, opacity: (isTitleHovered || showTitleConfig) ? 1 : 0, transition: 'opacity 0.2s ease', zIndex: 60 }}
          >
            <button
              className="notion-btn"
              style={{ padding: '6px', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}
              onClick={() => setShowTitleConfig(!showTitleConfig)}
            >
              <Palette size={20} />
            </button>

            {showTitleConfig && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', padding: '12px', width: '220px', zIndex: 100, display: 'flex', flexDirection: 'column', gap: '16px', animation: 'slideUpFade 0.15s ease-out forwards' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Text Color</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {titleColors.map(c => (
                      <div key={`t-${c.value}`}
                        onClick={() => { onUpdatePage({ ...activePage, titleColor: c.value }); }}
                        title={c.label}
                        style={{ width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', background: getHighlightColor('text', c.value) }}
                      >
                        {activePage.titleColor === c.value && <Check size={14} color="var(--bg-primary)" />}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Background Color</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {titleColors.map(c => (
                      <div key={`b-${c.value}`}
                        onClick={() => { onUpdatePage({ ...activePage, titleBgColor: c.value }); }}
                        title={c.label}
                        style={{ width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', background: getHighlightColor('bg', c.value) }}
                      >
                        {activePage.titleBgColor === c.value && <Check size={14} color="var(--text-primary)" />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

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
          {provider ? <CollaborativeEditor key={activePage.id} provider={provider} currentTheme={currentTheme} workspaceTheme={workspaceTheme} onAddSubPage={onAddSubPage} pageId={activePage.id} allPages={allPages} /> : <div>Loading page data...</div>}
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

        {/* Backlinks 패널 */}
        {backlinks.length > 0 && (
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              {backlinks.length}개의 백링크
            </div>
            {backlinks.map(bl => (
              <div
                key={bl.page_id}
                onClick={() => onNavigateToPage(bl.page_id)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: '14px' }}>{bl.icon}</span>
                <span style={{ color: 'var(--accent)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>{bl.title || 'Untitled'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
