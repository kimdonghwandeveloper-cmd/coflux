import { useState, useEffect, useCallback, useRef } from 'react';
import { indexPage, getBacklinks, LinkPageInfo } from '../lib/embeddings';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { en } from "@blocknote/core/locales";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import "@blocknote/mantine/style.css";
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
import { RiFileLine } from 'react-icons/ri';

// CSS classes used across drag and selection interactions.
// Keeping them as constants prevents typo-induced silent failures.
const CLS = {
  DRAG_ACTIVE:   'block-drag-active',   // applied while a block is being dragged
  SELECTING:     'block-selecting',     // applied during range-select (outlines + no text-select)
  BLOCK_SEL:     'bn-block-selected',   // applied to individually highlighted blocks
} as const;

// Returns the deepest [data-id] block element whose bounding rect contains clientY.
// Used by both the range-select and block-drag effects.
function blockAtY(container: HTMLElement, clientY: number): HTMLElement | null {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-id]'))
    .reverse().find(el => {
      const r = el.getBoundingClientRect();
      return clientY >= r.top && clientY <= r.bottom;
    }) ?? null;
}

// Walks up the DOM to find the first scrollable ancestor.
// Called once per drag-start, result cached in drag state.
function scrollParentOf(el: HTMLElement): HTMLElement {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const { overflow, overflowY } = window.getComputedStyle(cur);
    if (['auto', 'scroll'].includes(overflow) || ['auto', 'scroll'].includes(overflowY))
      return cur;
    cur = cur.parentElement;
  }
  return document.documentElement;
}

// CollaborativeEditor is a separate component because useCreateBlockNote
// must be called after the Yjs provider is ready.
function buildBlockNoteTheme(t: WorkspaceTheme) {
  const c = t.colors;
  return {
    colors: {
      editor:   { text: c.textPrimary,   background: c.bgPrimary },
      menu:     { text: c.textPrimary,   background: c.bgSurface },
      tooltip:  { text: c.textPrimary,   background: c.bgSecondary },
      hovered:  { text: c.textPrimary,   background: c.bgSecondary },
      selected: { text: c.textPrimary,   background: c.bgSecondary },
      disabled: { text: c.textSecondary, background: c.bgSecondary },
      shadow:   'rgba(0,0,0,0.15)',
      border:   c.borderColor,
      sideMenu: c.textSecondary,
    },
  } as const;
}

const CollaborativeEditor = ({ provider, currentTheme, workspaceTheme, onAddSubPage, pageId, allPages }: { provider: any, currentTheme: 'light' | 'dark', workspaceTheme?: WorkspaceTheme, onAddSubPage: () => void, pageId: string, allPages?: PageData[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const clearSelection = useCallback(() => {
    setSelectedIds(prev => prev.size === 0 ? prev : new Set());
  }, []);

  // Sync selectedIds → CSS class on each [data-id] element.
  // Runs only when the selection Set reference changes (after mouseup or Escape).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLElement>('[data-id]').forEach(el => {
      el.classList.toggle(CLS.BLOCK_SEL, selectedIds.has(el.getAttribute('data-id')!));
    });
  }, [selectedIds]);

  // Escape deselects all blocks
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') clearSelection(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearSelection]);

  // Range drag-select: vertical drag over the content area highlights whole blocks.
  // A fixed overlay is inserted on activation to prevent BlockNote receiving
  // further mouse events, which would restart text selection.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rawStart: { x: number; y: number } | null = null;
    let startBlockEl: HTMLElement | null = null;
    let blockSelectActive = false;
    let overlay: HTMLDivElement | null = null;

    const highlightRange = (blockA: HTMLElement, blockB: HTMLElement) => {
      const all = Array.from(container.querySelectorAll<HTMLElement>('[data-id]'));
      const lo = Math.min(all.indexOf(blockA), all.indexOf(blockB));
      const hi = Math.max(all.indexOf(blockA), all.indexOf(blockB));
      all.forEach((b, i) => b.classList.toggle(CLS.BLOCK_SEL, i >= lo && i <= hi));
    };

    const removeOverlay = () => {
      overlay?.remove();
      overlay = null;
      container.classList.remove(CLS.SELECTING);
    };

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('.bn-side-menu')) return;
      rawStart = { x: e.clientX, y: e.clientY };
      startBlockEl = blockAtY(container, e.clientY);
      blockSelectActive = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!rawStart) return;
      const dx = Math.abs(e.clientX - rawStart.x);
      const dy = Math.abs(e.clientY - rawStart.y);

      if (!blockSelectActive) {
        if (dy < 6 || dx > dy) return; // wait for clear vertical intent
        blockSelectActive = true;
        container.classList.add(CLS.SELECTING);
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:200;cursor:ns-resize;';
        document.body.appendChild(overlay);
        window.getSelection()?.removeAllRanges();
        container.querySelectorAll('.' + CLS.BLOCK_SEL).forEach(el => el.classList.remove(CLS.BLOCK_SEL));
      }

      e.preventDefault();
      const cur = blockAtY(container, e.clientY);
      if (cur && startBlockEl) highlightRange(startBlockEl, cur);
    };

    const onMouseUp = () => {
      container.classList.remove(CLS.SELECTING);
      removeOverlay();
      rawStart = null;
      startBlockEl = null;
      if (!blockSelectActive) return;
      blockSelectActive = false;
      const ids = new Set<string>();
      container.querySelectorAll<HTMLElement>(`[data-id].${CLS.BLOCK_SEL}`).forEach(el =>
        ids.add(el.getAttribute('data-id')!)
      );
      setSelectedIds(ids);
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      removeOverlay();
    };
  }, []);

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
    dictionary: {
      ...en,
      color_picker: {
        ...en.color_picker,
        colors: {
          ...en.color_picker.colors,
          gray: "Black",
        }
      }
    },
    collaboration: {
      provider,
      fragment: provider.doc.getXmlFragment("blocknote"),
      user: { name: "Coflux User", color: "#2e2e2e" }
    },
    uploadFile
  });

  // Auto-index page content for semantic search (debounced 5s)
  const indexTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editor) return;
    const unsubscribe = editor.onChange(() => {
      if (indexTimerRef.current) clearTimeout(indexTimerRef.current);
      indexTimerRef.current = setTimeout(async () => {
        const text = editor.document
          .map((block: any) => {
            const inline = Array.isArray(block.content)
              ? block.content.map((c: any) => c.text ?? '').join('')
              : '';
            return inline;
          })
          .filter(Boolean)
          .join('\n');
        await indexPage(pageId, '', text);
      }, 5000);
    });
    return () => {
      unsubscribe?.();
      if (indexTimerRef.current) clearTimeout(indexTimerRef.current);
    };
  }, [editor, pageId]);

  // ── Custom :: block drag ────────────────────────────────────────────────
  // Replaces BlockNote's native HTML5 drag (unreliable in Tauri WebView2)
  // with a full pointer-event based system: DOM-clone ghost, drop indicator
  // with end-dots, dim placeholder, auto-scroll, and Escape to cancel.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    type DS = {
      id: string;
      blockEl: HTMLElement;
      ghost: HTMLDivElement;
      line: HTMLDivElement;
      targetId: string;
      placement: 'before' | 'after';
      scrollParent: HTMLElement; // cached at drag-start, reused per frame
    };
    let ds: DS | null = null;

    const endDrag = () => {
      if (!ds) return;
      ds.blockEl.style.opacity = '';
      ds.ghost.remove();
      ds.line.remove();
      container.classList.remove(CLS.DRAG_ACTIVE);
      ds = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;

      // BlockNote v0.47: draggable={true} is on the MantineActionIcon button itself.
      // data-test="dragHandle" is only on the inner SVG, so closest() from button padding fails.
      // Instead: match the button with draggable="true" inside .bn-side-menu.
      const dragBtn = target.closest<HTMLElement>('[draggable="true"]');
      if (!dragBtn || !dragBtn.closest('.bn-side-menu')) return;

      // Find the block by Y position (side menu floats outside block DOM)
      const blockEl = blockAtY(container, e.clientY);
      if (!blockEl) return;

      // Prevent BlockNote's mousedown from firing → disables its native drag
      e.preventDefault();

      const id = blockEl.getAttribute('data-id')!;
      const rect = blockEl.getBoundingClientRect();

      // ── Ghost: deep-clone the actual block DOM ───────────────────────
      const ghost = blockEl.cloneNode(true) as HTMLDivElement;
      // Hide side menu inside the clone (no nested drag handle)
      ghost.querySelectorAll<HTMLElement>('.bn-side-menu').forEach(el => {
        el.style.display = 'none';
      });
      // Neutralise any contenteditable regions in the clone
      ghost.querySelectorAll<HTMLElement>('[contenteditable]').forEach(el => {
        el.contentEditable = 'false';
      });
      Object.assign(ghost.style, {
        position: 'fixed',
        width: `${rect.width}px`,
        left: `${e.clientX + 14}px`,
        top: `${e.clientY + 8}px`,
        margin: '0',
        zIndex: '9999',
        pointerEvents: 'none',
        opacity: '0.65',
        transform: 'scale(1.02)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.22)',
        borderRadius: '6px',
        transition: 'none',
        outline: 'none',
      });
      document.body.appendChild(ghost);

      // ── Drop indicator: horizontal line with dots at both ends ───────
      const line = document.createElement('div');
      line.innerHTML = `
        <span style="position:absolute;left:-5px;top:50%;transform:translateY(-50%);
          width:10px;height:10px;border-radius:50%;background:#2383e2;
          border:2px solid var(--bg-primary);"></span>
        <span style="position:absolute;right:-5px;top:50%;transform:translateY(-50%);
          width:10px;height:10px;border-radius:50%;background:#2383e2;
          border:2px solid var(--bg-primary);"></span>
      `;
      Object.assign(line.style, {
        position: 'fixed',
        height: '3px',
        background: '#2383e2',
        borderRadius: '2px',
        pointerEvents: 'none',
        zIndex: '9998',
        display: 'none',
        overflow: 'visible',
      });
      document.body.appendChild(line);

      // Dim original block to act as a placeholder in the layout
      blockEl.style.opacity = '0.25';

      ds = { id, blockEl, ghost, line, targetId: '', placement: 'after', scrollParent: scrollParentOf(container) };
      container.classList.add(CLS.DRAG_ACTIVE);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!ds) return;

      // Ghost follows cursor
      ds.ghost.style.left = `${e.clientX + 14}px`;
      ds.ghost.style.top = `${e.clientY + 8}px`;

      // Determine drop target and placement
      const target = blockAtY(container, e.clientY);
      if (target && target.getAttribute('data-id') !== ds.id) {
        const r = target.getBoundingClientRect();
        const above = e.clientY < r.top + r.height / 2;
        ds.targetId = target.getAttribute('data-id')!;
        ds.placement = above ? 'before' : 'after';
        ds.line.style.display = 'block';
        ds.line.style.top = `${(above ? r.top : r.bottom) - 1.5}px`;
        ds.line.style.left = `${r.left + 36}px`;
        ds.line.style.width = `${r.width - 40}px`;
      } else {
        ds.targetId = '';
        ds.line.style.display = 'none';
      }

      // Auto-scroll when dragging near viewport edges
      const ZONE = 72;
      const SPEED = 10;
      if (e.clientY < ZONE) ds.scrollParent.scrollBy(0, -SPEED);
      else if (e.clientY > window.innerHeight - ZONE) ds.scrollParent.scrollBy(0, SPEED);
    };

    const onPointerUp = () => {
      if (!ds) return;
      const { id, targetId, placement } = ds;
      endDrag();
      if (!targetId || targetId === id) return;
      try {
        const dragged = editor.getBlock(id);
        if (!dragged) return;
        // Omit id so BlockNote assigns a fresh one → no Yjs CRDT collision
        const { id: _discard, ...content } = dragged as any;
        editor.insertBlocks([content], { id: targetId }, placement);
        editor.removeBlocks([{ id }]);
      } catch (err) {
        console.error('Block move failed:', err);
      }
    };

    // Escape cancels the current drag without moving anything
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ds) endDrag();
    };

    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      endDrag();
    };
  }, [editor]);

  // Yjs UndoManager for Ctrl+Z / Ctrl+Y (ProseMirror history is disabled in collab mode)
  useEffect(() => {
    const fragment = provider.doc.getXmlFragment("blocknote");
    const undoManager = new Y.UndoManager(fragment);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only intercept if the focus is inside a BlockNote element or the document body (not other inputs)
      const target = e.target as HTMLElement;
      const isInsideEditor = target.closest('.bn-editor') || target === document.body;
      
      if (!isInsideEditor) return;

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
    <div ref={containerRef} style={{ position: 'relative' }}>
      <BlockNoteView editor={editor} theme={workspaceTheme ? buildBlockNoteTheme(workspaceTheme) : currentTheme} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterSuggestionItems(getCustomSlashMenuItems(editor), query)}
        />
        {allPages && allPages.length > 0 && (
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) => {
              const filtered = allPages
                .filter(p => !p.isDeleted && (p.title || '').toLowerCase().includes(query.toLowerCase()))
                .slice(0, 8);
              return filtered.map(p => ({
                title: p.title || 'Untitled',
                onItemClick: () => {
                  editor.insertInlineContent([{ type: 'text', text: `[[${p.title || 'Untitled'}]]`, styles: {} }]);
                },
                icon: <span style={{ fontSize: '14px' }}>{p.icon}</span>,
                group: '페이지 링크',
                key: p.id,
                aliases: [p.title || ''],
                subtext: '[[링크]] 삽입',
              }));
            }}
          />
        )}
      </BlockNoteView>

      {/* Block action toolbar — appears after drag-select */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#2f2f2f', color: '#fff', borderRadius: 8,
          padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)', zIndex: 300, fontSize: 13,
          animation: 'slideUpFade 0.15s ease-out forwards',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            {selectedIds.size}개 블록 선택됨
          </span>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
          <button
            onClick={() => {
              const blocks = editor.document.filter((b: { id: string }) => selectedIds.has(b.id));
              if (blocks.length > 0) editor.removeBlocks(blocks);
              clearSelection();
            }}
            style={{ background: 'rgba(235,87,87,0.25)', border: 'none', color: '#ff8080', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
          >
            삭제
          </button>
          <button
            onClick={clearSelection}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.45)', padding: '4px 6px', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

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

  // E27: BlockNote 호환 컬러맵 배열
  const titleColors = [
    { label: 'Default', value: null },
    { label: 'Gray', value: 'gray' },
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
    getBacklinks(activePage.id).then(setBacklinks).catch(() => {});
  }, [activePage.id, activePage.title]);

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
                onUpdatePage({...activePage, title: localTitle});
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
              color: activePage.titleColor ? `var(--bn-colors-highlights-${activePage.titleColor}-text, var(--auto-text-color))` : 'var(--auto-text-color, var(--text-primary))', 
              background: activePage.titleBgColor ? `var(--bn-colors-highlights-${activePage.titleBgColor}-background, transparent)` : 'transparent', 
              border: 'none', width: '100%', fontFamily: 'inherit',
              padding: activePage.titleBgColor ? '0 12px' : '0',  // 배경색 있을 땐 패딩 약간 줌
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
                           onClick={() => { onUpdatePage({...activePage, titleColor: c.value }); }}
                           title={c.label}
                           style={{ width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', background: c.value ? `var(--bn-colors-highlights-${c.value}-text)` : 'var(--auto-text-color)' }}
                      >
                        {activePage.titleColor === c.value && <Check size={14} color={c.value ? "white" : "var(--bg-primary)"} />}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>Background Color</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                    {titleColors.map(c => (
                      <div key={`b-${c.value}`} 
                           onClick={() => { onUpdatePage({...activePage, titleBgColor: c.value }); }}
                           title={c.label}
                           style={{ width: '26px', height: '26px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)', background: c.value ? `var(--bn-colors-highlights-${c.value}-background)` : 'transparent' }}
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
          {provider ? <CollaborativeEditor provider={provider} currentTheme={currentTheme} workspaceTheme={workspaceTheme} onAddSubPage={onAddSubPage} pageId={activePage.id} allPages={allPages} /> : <div>Loading page data...</div>}
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
