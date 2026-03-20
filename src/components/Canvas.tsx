import { useState, useEffect, useCallback, useRef } from 'react';
import { getBacklinks, findRelatedPages, RelatedPage, LinkPageInfo, updateBlockEmbedding, deleteBlockEmbeddings, updateWikiLinks } from '../lib/embeddings';
import { webrtcClient } from '../lib/webrtc_client';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { en } from "@blocknote/core/locales";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import "@blocknote/mantine/style.css";
import { PageData } from '../App';
import { WorkspaceTheme } from '../lib/theme';
import { Image as ImageIcon, Wifi, Palette, Check, Sparkles, Plus, Loader2 } from 'lucide-react';
import { SMART_TEMPLATES, Template } from '../lib/templates';
import { routeAiTask } from '../lib/ai_router';
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
  DRAG_ACTIVE: 'block-drag-active',   // applied while a block is being dragged
  SELECTING: 'block-selecting',     // applied during range-select (outlines + no text-select)
  BLOCK_SEL: 'bn-block-selected',   // applied to individually highlighted blocks
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
      editor: { text: c.textPrimary, background: c.bgPrimary },
      menu: { text: c.textPrimary, background: c.bgSurface },
      tooltip: { text: c.textPrimary, background: c.bgSecondary },
      hovered: { text: c.textPrimary, background: c.bgSecondary },
      selected: { text: c.textPrimary, background: c.bgSecondary },
      disabled: { text: c.textSecondary, background: c.bgSecondary },
      shadow: 'rgba(0,0,0,0.15)',
      border: c.borderColor,
      sideMenu: c.textSecondary,
    },
  } as const;
}

const CollaborativeEditor = ({ provider, currentTheme, workspaceTheme, onAddSubPage, pageId, allPages }: { provider: any, currentTheme: 'light' | 'dark', workspaceTheme?: WorkspaceTheme, onAddSubPage: () => void, pageId: string, allPages?: PageData[] }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [aiSuggestions, setAiSuggestions] = useState<RelatedPage[]>([]);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [templateDescription, setTemplateDescription] = useState("");

  const handleApplyTemplate = async (template: Template) => {
    if (isApplyingTemplate) return;
    setIsApplyingTemplate(true);
    
    try {
      const pageContext = `Page Title: ${pageId ? allPages?.find(p => p.id === pageId)?.title : 'New Page'}`;
      const userContext = templateDescription ? `\nUser Input/Context: ${templateDescription}` : "";
      
      const response = await routeAiTask({
        type: 'ai_request',
        prompt: `${template.prompt}${userContext}\n\nContext: ${pageContext}`,
        externalAllowed: true
      });

      if (response.type === 'ai_response') {
        let text = response.text;
        // Clean up markdown code block wrappers if present
        text = text.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "");
        
        const blocks = (editor as any).tryParseMarkdownToBlocks(text);
        editor.replaceBlocks(editor.document, blocks);
      }
    } catch (e) {
      console.error('Failed to apply template:', e);
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handleAiAction = async (action: 'improve' | 'summarize' | 'explain') => {
    if (isApplyingTemplate || selectedIds.size === 0) return;
    setIsApplyingTemplate(true);

    try {
      const targetBlocks: any[] = [];
      editor.forEachBlock((block) => {
        if (selectedIds.has(block.id)) {
          targetBlocks.push(block);
        }
        return true;
      });

      if (targetBlocks.length === 0) {
        // Fallback: try top-level filter if forEachBlock didn't catch it for some reason
        targetBlocks.push(...editor.document.filter((b: any) => selectedIds.has(b.id)));
      }

      if (targetBlocks.length === 0) return;

        const textToProcess = (editor as any).blocksToMarkdownLossy(targetBlocks);

        let actionPrompt = '';
        if (action === 'improve') actionPrompt = '다음 내용을 더 전문적이고 읽기 수월하게 다듬어주세요. 원본의 핵심 정보와 인물 정보는 반드시 유지하세요.';
        if (action === 'summarize') actionPrompt = '다음 내용을 [연구/내용 배경], [핵심 제안], [기술적 특징], [주요 성과], [결론 및 향후 과제]의 5개 항목으로 구조화하여 요약해주세요. 원본에 언급된 인물이나 팀 정보가 있다면 요약의 서두에 포함시키세요. 결과만 마크다운으로 출력하세요.';
        if (action === 'explain') actionPrompt = '다음 내용에 대해 쉽고 친절하게 설명해주세요. 마크다운 형식을 사용하세요.';

        const response = await routeAiTask({
          type: 'ai_request',
          prompt: `${actionPrompt}\n\n---\n${textToProcess}\n---`,
          externalAllowed: true
        });

        if (response.type === 'ai_response') {
          let text = response.text;
          // Clean up markdown code block wrappers if present
          text = text.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "");

          const newBlocks = (editor as any).tryParseMarkdownToBlocks(text);
        const lastBlock = targetBlocks[targetBlocks.length - 1];
        editor.insertBlocks(newBlocks, lastBlock, 'after');
      }
    } catch (e) {
      console.error('AI Action failed:', e);
    } finally {
      setIsApplyingTemplate(false);
      clearSelection();
    }
  };

  const [harvestData, setHarvestData] = useState<{ tasks: string[], topics: string[] } | null>(null);
  const [isHarvesting, setIsHarvesting] = useState(false);

  const handleHarvest = async () => {
    if (isHarvesting) return;
    setIsHarvesting(true);
    
    try {
      const fullText = (editor as any).blocksToMarkdownLossy(editor.document);
      const response = await routeAiTask({
        type: 'ai_request',
        prompt: `다음은 현재 문서의 내용입니다. 이 문서에서 '수행해야 할 작업(Action Items)'과 '주요 주제(Key Topics)'를 추출해주세요.\n반드시 다음 JSON 형식으로만 응답하세요:\n{"tasks": ["작업1", "작업2"], "topics": ["주제1", "주제2"]}\n\n내용:\n${fullText}`,
        externalAllowed: true
      });

      if (response.type === 'ai_response') {
        let text = response.text;
        // Clean up markdown code block wrappers if present
        text = text.replace(/^```[a-z]*\n/i, "").replace(/\n```$/i, "");
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const data = JSON.parse(jsonMatch[0]);
            setHarvestData(data);
          } catch (parseErr) {
            console.error('Harvest JSON parse error:', parseErr);
          }
        }
      }
    } catch (e) {
      console.error('Harvest failed:', e);
    } finally {
      setIsHarvesting(false);
    }
  };

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
      
      // If clicking outside the AI toolbar, clear current selection to allow fresh start
      if (!(e.target as HTMLElement).closest('.ai-action-toolbar')) {
        setSelectedIds(new Set());
      }

      rawStart = { x: e.clientX, y: e.clientY };
      startBlockEl = blockAtY(container, e.clientY);
      blockSelectActive = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!rawStart) return;
      const dx = Math.abs(e.clientX - rawStart.x);
      const dy = Math.abs(e.clientY - rawStart.y);

      if (!blockSelectActive) {
        if (dy < 10 || dx > dy) return; // wait for clear vertical intent
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
      if (ids.size > 0) {
        setSelectedIds(ids);
      }
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

  // Listen for AI page generation markdown inject event
  useEffect(() => {
    const handler = async (e: any) => {
      const { pageId: targetPageId, markdown } = e.detail;
      if (targetPageId === pageId && editor) {
        try {
          const blocks = await editor.tryParseMarkdownToBlocks(markdown);
          editor.replaceBlocks(editor.document, blocks);
        } catch (err) {
          console.error('[Canvas] Failed to parse markdown:', err);
        }
      }
    };
    window.addEventListener('coflux-inject-markdown', handler);
    return () => window.removeEventListener('coflux-inject-markdown', handler);
  }, [pageId, editor]);

  // Auto-index and Proactive AI suggestions (debounced 5s)
  const indexTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlockContentRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!editor) return;
    const unsubscribe = editor.onChange(() => {
      // 1. Incremental Indexing logic
      if (indexTimerRef.current) clearTimeout(indexTimerRef.current);
      indexTimerRef.current = setTimeout(async () => {
        const currentBlocks = editor.document;
        const updatedBlockContent = new Map<string, string>();
        
        const dirtyBlocks: { id: string, text: string }[] = [];
        const currentIds = new Set<string>();

        for (const block of currentBlocks) {
          const blockId = block.id;
          currentIds.add(blockId);
          const blockText = Array.isArray(block.content)
            ? block.content.map((c: any) => c.text ?? '').join('')
            : '';
          
          updatedBlockContent.set(blockId, blockText);

          if (lastBlockContentRef.current.get(blockId) !== blockText) {
            if (blockText.trim().length > 0) {
              dirtyBlocks.push({ id: blockId, text: blockText });
            }
          }
        }

        // Identify deleted blocks
        const deletedIds: string[] = [];
        for (const oldId of lastBlockContentRef.current.keys()) {
          if (!currentIds.has(oldId)) {
            deletedIds.push(oldId);
          }
        }

        // Perform incremental updates
        if (dirtyBlocks.length > 0) {
          console.log(`[Embeddings] Incremental update: ${dirtyBlocks.length} blocks`);
          for (const { id, text } of dirtyBlocks) {
            await updateBlockEmbedding(pageId, id, text);
          }
        }
        if (deletedIds.length > 0) {
          console.log(`[Embeddings] Deleting ${deletedIds.length} blocks`);
          await deleteBlockEmbeddings(pageId, deletedIds);
        }

        // Always update wiki-links if anything changed
        if (dirtyBlocks.length > 0 || deletedIds.length > 0) {
          const fullText = currentBlocks
            .map((block: any) => Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('') : '')
            .join('\n');
          await updateWikiLinks(pageId, fullText);
        }

        lastBlockContentRef.current = updatedBlockContent;
      }, 5000);

      // 2. Proactive AI Suggestions (1.2초 지연 후 연관 문서 조회)
      if (aiSuggestTimerRef.current) clearTimeout(aiSuggestTimerRef.current);
      aiSuggestTimerRef.current = setTimeout(async () => {
        // 현재 포커스된 블록이나 최근 작성된 텍스트 추출 (여기서는 문서 전체의 마지막 일부를 활용하거나 전체를 활용)
        const fullText = editor.document
          .map((block: any) => Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('') : '')
          .filter(Boolean)
          .join(' ');

        if (fullText.length > 20) {
          const results = await findRelatedPages(fullText, pageId, 3);
          // 점수 0.45 이상이며 현재 페이지와 제목이 다른 경우만 표시
          setAiSuggestions(results.filter(r => r.score > 0.45));
        } else {
          setAiSuggestions([]);
        }
      }, 3500);
    });
    return () => {
      unsubscribe?.();
      if (indexTimerRef.current) clearTimeout(indexTimerRef.current);
      if (aiSuggestTimerRef.current) clearTimeout(aiSuggestTimerRef.current);
    };
  }, [editor, pageId]);

  // Initialize block content tracking on first document load
  useEffect(() => {
    if (editor && lastBlockContentRef.current.size === 0 && editor.document.length > 0) {
      const initialMap = new Map<string, string>();
      editor.document.forEach(block => {
        const text = Array.isArray(block.content) ? block.content.map((c: any) => c.text ?? '').join('') : '';
        initialMap.set(block.id, text);
      });
      lastBlockContentRef.current = initialMap;
    }
  }, [editor]);

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

  // 디버깅용: 에디터 인스턴스 자체의 협업 상태 확인
  useEffect(() => {
    if (!editor) return;
    const unsub = editor.onSelectionChange(() => {
      const selection = editor.getSelection();
      if (selection && selection.blocks.length > 0) {
        const ids = new Set(selection.blocks.map(b => b.id));
        setSelectedIds(ids);
      }
      // Note: We don't clear selectedIds here to prevent flicker on mouseup.
      // Clearing is handled by onMouseDown or Escape.
    });
    return unsub;
  }, [editor]);

  // UndoManager를 리렌더링 시에도 유지하기 위한 Ref
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  // Yjs UndoManager for Ctrl+Z / Ctrl+Y (ProseMirror history is disabled in collab mode)
  useEffect(() => {
    if (!provider) {
      if (undoManagerRef.current) {
        undoManagerRef.current.destroy();
        undoManagerRef.current = null;
      }
      return;
    }

    const doc = provider.doc;

    // 이전에 생성된 매니저가 다른 도큐먼트를 보고 있다면 파괴하고 새로 생성
    if (undoManagerRef.current && undoManagerRef.current.doc !== doc) {
      undoManagerRef.current.destroy();
      undoManagerRef.current = null;
    }

    if (!undoManagerRef.current) {
      undoManagerRef.current = new Y.UndoManager(doc, {
        captureTimeout: 500,
        ignoreRemoteMapChanges: false,
      });

      undoManagerRef.current.on('stack-item-added', () => {
        console.log('[UndoManager] SUCCESS! Stack grown. Size:', undoManagerRef.current?.undoStack.length);
      });
    }

    const um = undoManagerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isZ = e.code === 'KeyZ';
      const isY = e.code === 'KeyY';
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      if (!isCtrl) return;

      const target = e.target as HTMLElement;
      // Allow undo/redo globally within the Canvas component (including Title, etc.)
      const isInsideCanvas = !!target.closest('.app-container') || target === document.body;
      if (!isInsideCanvas) return;

      // Undo: Ctrl + Z
      if (isZ && !isShift) {
        if (um.undoStack.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          um.undo();
        }
      }
      // Redo: Ctrl + Y or Ctrl + Shift + Z
      if (isY || (isZ && isShift)) {
        if (um.redoStack.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          um.redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
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

      {/* If editor is empty or applying template, show helper UI */}
      {editor.document.length <= 1 && (!editor.document[0].content || (Array.isArray(editor.document[0].content) && editor.document[0].content.length === 0)) && !isApplyingTemplate && (
        <div style={{ padding: '24px', border: '1px dashed var(--border-color)', borderRadius: '12px', marginTop: '24px', animation: 'fadeIn 0.5s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', color: 'var(--text-secondary)' }}>
            <Sparkles size={16} color="var(--accent)" />
            <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>AI 스마트 템플릿으로 시작하기</span>
          </div>
          
          <div style={{ marginBottom: '16px' }}>
            <input 
              type="text"
              value={templateDescription}
              onChange={e => setTemplateDescription(e.target.value)}
              placeholder="무엇에 대한 문서인가요? (예: 마케팅 회의, 신규 로고 디자인 브리프...)"
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                boxSizing: 'border-box', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
              }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', opacity: 0.7 }}>
              * 위 칸에 간단한 설명을 남기면 AI가 더 정확한 초안을 작성해줍니다.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {SMART_TEMPLATES.map(t => (
              <div 
                key={t.id} 
                onClick={() => handleApplyTemplate(t)}
                style={{ 
                  padding: '16px', borderRadius: '10px', background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)', cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                } as any}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(var(--accent-rgb), 0.15)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>{t.icon}</span>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{t.name}</div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{t.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isApplyingTemplate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '32px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', borderRadius: '12px', marginTop: '24px' }}>
          <Loader2 size={24} color="var(--accent)" style={{ animation: 'spin 1.5s linear infinite' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>AI가 문서를 작성 중입니다...</div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>잠시만 기다려주세요. 구조화된 초안을 생성하고 있습니다.</div>
          </div>
        </div>
      )}

      {/* Knowledge Harvest Button (Floating) */}
      <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center' }}>
        <button 
          onClick={handleHarvest}
          disabled={isHarvesting}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', 
            borderRadius: '20px', border: '1px solid var(--border-color)', 
            background: 'var(--bg-surface)', color: 'var(--text-secondary)', 
            fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-color)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          {isHarvesting ? <Loader2 size={16} style={{ animation: 'spin 1.5s linear infinite' }} /> : <Sparkles size={16} />}
          지식 수확하기 (Harvest Insights)
        </button>
      </div>

      {harvestData && (
        <div style={{ marginTop: '24px', padding: '24px', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-color)', animation: 'slideUpFade 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="var(--accent)" /> 지능형 지식 적출
            </div>
            <button onClick={() => setHarvestData(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>🎯 Action Items</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {harvestData.tasks.length > 0 ? harvestData.tasks.map((t, idx) => (
                  <div key={idx} style={{ padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'flex-start', gap: '10px', border: '1px solid var(--border-color)' }}>
                    <div style={{ marginTop: '4px', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                    {t}
                  </div>
                )) : <div style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.6 }}>추출된 할 일이 없습니다.</div>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>🏷️ Key Topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {harvestData.topics.length > 0 ? harvestData.topics.map((topic, idx) => (
                  <span key={idx} style={{ padding: '6px 12px', borderRadius: '14px', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: 600 }}>
                    #{topic}
                  </span>
                )) : <div style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.6 }}>키워드가 없습니다.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block action toolbar — appears after drag-select */}
       {selectedIds.size > 0 && (
         <div className="ai-action-toolbar" style={{
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
             onClick={() => handleAiAction('improve')}
             disabled={isApplyingTemplate}
             style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
           >
             <Sparkles size={12} color="var(--accent)" /> 다듬기
           </button>
           <button
             onClick={() => handleAiAction('summarize')}
             disabled={isApplyingTemplate}
             style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
           >
             요약
           </button>
           <button
             onClick={() => handleAiAction('explain')}
             disabled={isApplyingTemplate}
             style={{ background: 'transparent', border: 'none', color: '#fff', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
           >
             설명
           </button>

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

       {/* AI Proactive Suggestions (Stage 1.2) */}
       {aiSuggestions.length > 0 && (
         <div style={{
           position: 'absolute', bottom: 24, left: 24, zIndex: 100,
           background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
           borderRadius: 12, padding: '14px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
           width: 280, animation: 'slideUpFade 0.25s ease-out',
           display: 'flex', flexDirection: 'column', gap: 10
         }}>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>
               <Sparkles size={14} /> <span>COFLUX ARCHITECT INSIGHT</span>
             </div>
             <button 
               onClick={() => setAiSuggestions([])}
               style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
             >
               <Plus size={14} style={{ transform: 'rotate(45deg)' }} />
             </button>
           </div>
           
           <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
             작성 중인 내용과 연관된 과거 기록이 있습니다. 링크를 추가할까요?
           </div>

           <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
             {aiSuggestions.map(s => (
               <div 
                 key={s.page_id} 
                 onClick={() => {
                   editor.insertInlineContent([{ type: 'text', text: `[[${s.title}]]`, styles: {} }]);
                   setAiSuggestions([]);
                 }}
                 style={{
                   padding: '8px 10px', borderRadius: 8, background: 'var(--bg-secondary)',
                   fontSize: '13px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', 
                   alignItems: 'center', border: '1px solid transparent', transition: 'all 0.1s'
                 }}
                 onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                 onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
               >
                 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                   {s.title}
                 </span>
                 <Plus size={14} color="var(--accent)" />
               </div>
             ))}
           </div>
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
