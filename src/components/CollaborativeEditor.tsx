import { useState, useEffect, useCallback, useRef } from 'react';
import { findRelatedPages, RelatedPage, updateBlockEmbedding, deleteBlockEmbeddings, updateWikiLinks } from '../lib/embeddings';
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from "@blocknote/react";
import { en } from "@blocknote/core/locales";
import { filterSuggestionItems as filterItems } from "@blocknote/core/extensions";
import "@blocknote/mantine/style.css";
import { PageData } from '../App';
import { WorkspaceTheme } from '../lib/theme';
import { Sparkles, Plus, Loader2, TrendingUp, PieChart as PieIcon } from 'lucide-react';
import { SMART_TEMPLATES, Template } from '../lib/templates';
import { routeAiTask } from '../lib/ai_router';
import * as Y from 'yjs';
import { invoke } from '@tauri-apps/api/core';
import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { DatabaseBlock, WhiteboardBlock, ChartBlock, MermaidBlock } from "./Monochrome/EditorBlocks";
import { RiDatabase2Line, RiArtboardLine, RiFileLine, RiBarChart2Line } from 'react-icons/ri';

// Create a custom schema that includes our Database and Whiteboard blocks
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    database: DatabaseBlock(),
    whiteboard: WhiteboardBlock(),
    chart: ChartBlock(),
    mermaid: MermaidBlock(),
  },
});

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
      const target = e.target as HTMLElement;
      if (target.closest('.bn-side-menu')) return;
      
      // Ignore interactive elements within custom blocks to prevent accidental selection/drag
      if (target.closest('button, input, select, textarea, canvas, .recharts-surface, .react-flow__node, .react-flow__edge')) {
        return;
      }

      // If clicking outside the AI toolbar, clear current selection to allow fresh start
      if (!target.closest('.ai-action-toolbar')) {
        setSelectedIds(prev => prev.size === 0 ? prev : new Set());
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
    schema,
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
  const injectedPagesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const handler = async (e: any) => {
      const { pageId: targetPageId, markdown } = e.detail;
      if (targetPageId === pageId && editor && !injectedPagesRef.current.has(targetPageId)) {
        injectedPagesRef.current.add(targetPageId);
        try {
          const blocks = await editor.tryParseMarkdownToBlocks(markdown);
          editor.replaceBlocks(editor.document, blocks);
        } catch (err) {
          console.error('[Canvas] Failed to parse markdown:', err);
          injectedPagesRef.current.delete(targetPageId); // allow retry on failure
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
      placement: 'before' | 'after' | 'before-column' | 'after-column';
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
        
        // Detect side areas (15% of width) for multi-column layout
        const sideWidth = r.width * 0.15;
        const isLeft = e.clientX > r.left && e.clientX < r.left + sideWidth;
        const isRight = e.clientX < r.right && e.clientX > r.right - sideWidth;

        if (isLeft || isRight) {
          ds.placement = isLeft ? 'before-column' : 'after-column';
          ds.targetId = target.getAttribute('data-id')!;
          ds.line.style.display = 'block';
          
          // Vertical drop indicator
          Object.assign(ds.line.style, {
            height: `${r.height}px`,
            width: '4px',
            top: `${r.top}px`,
            left: `${isLeft ? r.left : r.right - 4}px`,
          });
          // Update dots for vertical orientation
          const dots = ds.line.querySelectorAll('span');
          if (dots.length >= 2) {
            Object.assign(dots[0].style, { left: '-3px', top: '0', bottom: 'auto', transform: 'none' });
            Object.assign(dots[1].style, { left: '-3px', bottom: '0', top: 'auto', transform: 'none' });
          }
        } else {
          const above = e.clientY < r.top + r.height / 2;
          ds.targetId = target.getAttribute('data-id')!;
          ds.placement = above ? 'before' : 'after';
          ds.line.style.display = 'block';
          
          // Horizontal drop indicator
          Object.assign(ds.line.style, {
            height: '3px',
            width: `${r.width - 40}px`,
            top: `${(above ? r.top : r.bottom) - 1.5}px`,
            left: `${r.left + 36}px`,
          });
          // Update dots for horizontal orientation
          const dots = ds.line.querySelectorAll('span');
          if (dots.length >= 2) {
            Object.assign(dots[0].style, { left: '-5px', top: '50%', bottom: 'auto', transform: 'translateY(-50%)' });
            Object.assign(dots[1].style, { right: '-5px', top: '50%', bottom: 'auto', left: 'auto', transform: 'translateY(-50%)' });
          }
        }
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
        const target = editor.getBlock(targetId);
        if (!dragged || !target) return;

        // Omit id so BlockNote assigns a fresh one
        const { id: _discard, ...content } = dragged as any;

        if (placement === 'before-column' || placement === 'after-column') {
          const isLeft = placement === 'before-column';
          
          // Helper to strip IDs recursively for fresh block objects
          const stripId = (b: any): any => {
            const { id: _, children, ...rest } = b;
            return {
              ...rest,
              props: rest.props || {},
              content: rest.content || [],
              children: children?.map(stripId) || []
            };
          };

          const draggedContent = stripId(dragged);
          const targetContent = stripId(target);

          // Construct a column group with two columns
          // BlockNote 0.47 requires props and content even for structural blocks
          const columnGroupBlock = {
            type: "columnGroup",
            props: {},
            content: [],
            children: isLeft 
              ? [
                  { type: "column", props: {}, content: [], children: [draggedContent] },
                  { type: "column", props: {}, content: [], children: [targetContent] }
                ]
              : [
                  { type: "column", props: {}, content: [], children: [targetContent] },
                  { type: "column", props: {}, content: [], children: [draggedContent] }
                ]
          };

          editor.replaceBlocks([targetId], [columnGroupBlock as any]);
          editor.removeBlocks([id]);
        } else {
          editor.insertBlocks([content], { id: targetId }, placement as 'before' | 'after');
          editor.removeBlocks([id]);
        }
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

  const getCustomSlashMenuItems = useCallback((ed: typeof editor) => {
    // Filter out Heading 4, 5, 6 as they are redundant for this app
    const defaults = getDefaultReactSlashMenuItems(ed).filter(
      item => !["Heading 4", "Heading 5", "Heading 6"].includes(item.title)
    );

    const appsItems = [
      {
        title: "Database",
        onItemClick: () => {
          ed.updateBlock(ed.getTextCursorPosition().block, {
            type: "database",
            props: { scopeId: `db_${Date.now()}` },
          });
        },
        aliases: ["db", "table", "database"],
        group: "Apps",
        icon: <RiDatabase2Line size={18} />,
        subtext: "Insert a monochrome database table",
      },
      {
        title: "Whiteboard",
        onItemClick: () => {
          ed.updateBlock(ed.getTextCursorPosition().block, {
            type: "whiteboard",
            props: { scopeId: `wb_${Date.now()}` },
          });
        },
        aliases: ["board", "canvas", "whiteboard"],
        group: "Apps",
        icon: <RiArtboardLine size={18} />,
        subtext: "Insert an infinite whiteboard canvas",
      },
      {
        title: "Chart (Insight v2.1)",
        onItemClick: () => {
          ed.updateBlock(ed.getTextCursorPosition().block, {
            type: "chart",
            props: { scopeId: `ch_${Date.now()}`, type: 'uninitialized' },
          });
        },
        aliases: ["chart", "graph", "bar", "line", "pie", "scatter", "histogram"],
        group: "Apps",
        icon: <RiBarChart2Line size={18} />,
        subtext: "Create interactive visualizations (Bar, Line, Pie, Scatter, etc.)",
      },
      {
        title: "Mermaid Diagram",
        onItemClick: () => {
          ed.updateBlock(ed.getTextCursorPosition().block, {
            type: "mermaid",
          });
        },
        aliases: ["mermaid", "diagram", "flowchart", "graph"],
        group: "Apps",
        icon: <Sparkles size={18} />,
        subtext: "Insert a Mermaid diagram (Flowchart, Sequence, Gantt, etc.)",
      },
    ];

    const pageItem = {
      title: "Page",
      onItemClick: () => { onAddSubPage(); },
      aliases: ["page", "subpage", "sub-page"],
      group: "Pages",
      icon: <RiFileLine size={18} />,
      subtext: "Embed a sub-page inside this page",
      key: "page",
    };
    return [...defaults, ...appsItems, pageItem];
  }, [onAddSubPage]);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <BlockNoteView editor={editor} theme={workspaceTheme ? buildBlockNoteTheme(workspaceTheme) : currentTheme} slashMenu={false}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) => filterItems(getCustomSlashMenuItems(editor), query)}
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

export default CollaborativeEditor;
