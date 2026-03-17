import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeMouseHandler,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { X, GitBranch } from 'lucide-react';
import { PageData } from '../App';
import { getAllLinks } from '../lib/embeddings';

// ─── Dagre 자동 레이아웃 ─────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 48;

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 });

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return nodes.map(n => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });
}

// ─── 커스텀 노드 ──────────────────────────────────────────────────────────────

function PageNode({ data }: { data: { icon: string; title: string; isActive: boolean } }) {
  return (
    <div style={{
      padding: '8px 14px',
      borderRadius: '8px',
      background: data.isActive ? 'var(--accent)' : 'var(--bg-surface)',
      border: `1.5px solid ${data.isActive ? 'var(--accent)' : 'var(--border-color)'}`,
      color: data.isActive ? 'var(--bg-primary)' : 'var(--text-primary)',
      fontSize: '13px',
      fontWeight: data.isActive ? 600 : 400,
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      minWidth: `${NODE_W}px`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      cursor: 'pointer',
      transition: 'box-shadow 0.15s',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}>
      <span style={{ fontSize: '15px' }}>{data.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.title}</span>
    </div>
  );
}

const nodeTypes = { pageNode: PageNode };

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface KnowledgeMapProps {
  pages: PageData[];
  activePageId: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}

export function KnowledgeMap({ pages, activePageId, onNavigate, onClose }: KnowledgeMapProps) {
  const visible = pages.filter(p => !p.isDeleted);
  const [wikiLinks, setWikiLinks] = useState<[string, string][]>([]);

  useEffect(() => {
    getAllLinks().then(setWikiLinks).catch(() => {});
  }, []);

  const rawNodes: Node[] = useMemo(() =>
    visible.map(p => ({
      id: p.id,
      type: 'pageNode',
      position: { x: 0, y: 0 },
      data: { icon: p.icon, title: p.title || 'Untitled', isActive: p.id === activePageId },
    })),
  [visible, activePageId]);

  const visibleIds = useMemo(() => new Set(visible.map(p => p.id)), [visible]);

  const rawEdges: Edge[] = useMemo(() => {
    // 부모/자식 엣지
    const parentEdges: Edge[] = visible
      .filter(p => p.parentId && visibleIds.has(p.parentId))
      .map(p => ({
        id: `parent-${p.parentId}-${p.id}`,
        source: p.parentId!,
        target: p.id,
        style: { stroke: 'var(--border-color)', strokeWidth: 1.5 },
        animated: false,
      }));
    // 위키링크 엣지 (파란색, 점선)
    const wikiEdges: Edge[] = wikiLinks
      .filter(([s, t]) => visibleIds.has(s) && visibleIds.has(t))
      .map(([s, t]) => ({
        id: `wiki-${s}-${t}`,
        source: s,
        target: t,
        style: { stroke: 'var(--accent)', strokeWidth: 1.5, strokeDasharray: '5 4' },
        animated: true,
        label: '[[]]',
        labelStyle: { fontSize: 9, fill: 'var(--text-secondary)' },
        labelBgStyle: { fill: 'var(--bg-secondary)', fillOpacity: 0.8 },
      }));
    return [...parentEdges, ...wikiEdges];
  }, [visible, visibleIds, wikiLinks]);

  const layoutNodes = useMemo(() => applyDagreLayout(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const [nodes, , onNodesChange] = useNodesState(layoutNodes);
  const [edges, , onEdgesChange] = useEdgesState(rawEdges);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    onNavigate(node.id);
    onClose();
  }, [onNavigate, onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '80vw', height: '75vh',
          background: 'var(--bg-primary)',
          borderRadius: '14px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={16} color="var(--accent)" />
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Knowledge Map</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '4px' }}>
              {visible.length}개 페이지
            </span>
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer', padding: '4px' }}>
            <X size={18} color="var(--text-secondary)" />
          </div>
        </div>

        {/* React Flow 캔버스 */}
        <div style={{ flex: 1, position: 'relative' }}>
          {visible.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: 'var(--text-secondary)', fontSize: '14px',
            }}>
              페이지가 없습니다.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="var(--border-color)"
              />
              <Controls
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                }}
              />
              <MiniMap
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                }}
                nodeColor="var(--accent)"
              />
            </ReactFlow>
          )}
        </div>
      </div>
    </div>
  );
}
