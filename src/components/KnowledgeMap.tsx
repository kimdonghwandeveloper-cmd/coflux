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
  Handle,
  Position,
  Connection,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import { PageData } from '../App';
import { getAllLinks, addManualLink, removeManualLink, getAllPageEmbeddings, PageEmbedding } from '../lib/embeddings';
import { Brain, Network, X, GitBranch } from 'lucide-react';

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
      position: 'relative'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--text-secondary)', width: 6, height: 6, opacity: 0.5 }} />
      <span style={{ fontSize: '15px' }}>{data.icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.title}</span>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--text-secondary)', width: 6, height: 6, opacity: 0.5 }} />
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

// ─── Semantic Clustering (Simple MDS-like Force Layout) ───────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0; let mA = 0; let mB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mA += a[i] * a[i];
    mB += b[i] * b[i];
  }
  if (mA === 0 || mB === 0) return 0;
  return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

function applySemanticLayout(nodes: Node[], embeddings: PageEmbedding[]): Node[] {
  const embMap = new Map(embeddings.map(e => [e.page_id, e.embedding]));
  const posMap = new Map<string, { x: number, y: number }>();
  
  // 초기화: 랜덤 또는 원형 배치
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    posMap.set(n.id, { x: Math.cos(angle) * 500, y: Math.sin(angle) * 500 });
  });

  // 간단한 Iterative Force-Directed (유사도 기반)
  const iterations = 50;
  const k = 300; // 이상적 거리 상수
  
  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map<string, { dx: number, dy: number }>();
    nodes.forEach(n => forces.set(n.id, { dx: 0, dy: 0 }));

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i];
        const v = nodes[j];
        const p1 = posMap.get(u.id)!;
        const p2 = posMap.get(v.id)!;
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // 원격 유사도 계산
        const emb1 = embMap.get(u.id);
        const emb2 = embMap.get(v.id);
        let sim = 0.5;
        if (emb1 && emb2) {
          sim = (cosineSimilarity(emb1, emb2) + 1) / 2; // 0~1 범위로 정규화
        }

        // 유사도가 높을수록 가까이 끌어당기고, 낮을수록 밀어냄
        const targetDist = k * (1.5 - sim * 1.2); 
        const diff = dist - targetDist;
        const force = diff * 0.05;

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        const f1 = forces.get(u.id)!;
        const f2 = forces.get(v.id)!;
        f1.dx += fx; f1.dy += fy;
        f2.dx -= fx; f2.dy -= fy;
      }
    }

    // 위치 업데이트
    nodes.forEach(n => {
      const p = posMap.get(n.id)!;
      const f = forces.get(n.id)!;
      p.x += f.dx; p.y += f.dy;
    });
  }

  return nodes.map(n => ({
    ...n,
    position: posMap.get(n.id)!
  }));
}

export function KnowledgeMap({ pages, activePageId, onNavigate, onClose }: KnowledgeMapProps) {
  const visible = pages.filter(p => !p.isDeleted);
  const [wikiLinks, setWikiLinks] = useState<[string, string][]>([]);
  const [isSemantic, setIsSemantic] = useState(false);
  const [embeddings, setEmbeddings] = useState<PageEmbedding[]>([]);

  useEffect(() => {
    getAllLinks().then(setWikiLinks).catch(() => {});
  }, []);

  useEffect(() => {
    if (isSemantic && embeddings.length === 0) {
      getAllPageEmbeddings().then(setEmbeddings).catch(() => {});
    }
  }, [isSemantic, embeddings.length]);

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
        style: { stroke: 'var(--accent)', strokeWidth: 1.5, strokeDasharray: '3 3' },
        animated: true,
        label: t === s ? undefined : 'link',
        labelStyle: { fontSize: 9, fill: 'var(--text-secondary)' },
        labelBgStyle: { fill: 'var(--bg-secondary)', fillOpacity: 0.8 },
      }));
    return [...parentEdges, ...wikiEdges];
  }, [visible, visibleIds, wikiLinks]);

  const layoutNodes = useMemo(() => {
    if (isSemantic && embeddings.length > 0) {
      return applySemanticLayout(rawNodes, embeddings);
    }
    return applyDagreLayout(rawNodes, rawEdges);
  }, [rawNodes, rawEdges, isSemantic, embeddings]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  // 레이아웃 변경 시 노드 위치만 업데이트 (애니메이션 효과)
  useEffect(() => {
    setNodes(layoutNodes);
  }, [layoutNodes, setNodes]);

  useEffect(() => {
    // 시맨틱 모드에서는 엣지 투명도 조절
    const nextEdges = rawEdges.map(e => ({
      ...e,
      hidden: isSemantic && !e.id.startsWith('wiki-'), // 부모/자식 관계는 시맨틱 모드에서 숨김 고려
      style: { 
        ...e.style, 
        opacity: isSemantic ? 0.15 : 1,
        strokeDasharray: isSemantic ? '0' : (e.id.startsWith('wiki-') ? '3 3' : '0')
      },
      animated: !isSemantic && e.id.startsWith('wiki-')
    }));
    setEdges(nextEdges);
  }, [isSemantic, rawEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        addManualLink(params.source, params.target);
        setEdges((eds) => addEdge({ 
          ...params, 
          style: { stroke: 'var(--accent)', strokeWidth: 1.5, strokeDasharray: '3 3' },
          animated: true,
          label: 'link'
        }, eds));
      }
    },
    [setEdges]
  );

  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      edgesToDelete.forEach((edge) => {
        if (!edge.id.startsWith('parent-')) {
          removeManualLink(edge.source, edge.target);
        }
      });
    },
    []
  );

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
            <Network size={16} color="var(--accent)" />
            <span style={{ fontSize: '15px', fontWeight: 600 }}>Knowledge Map</span>
            <div 
              onClick={() => setIsSemantic(!isSemantic)}
              style={{
                marginLeft: '12px',
                padding: '4px 10px',
                borderRadius: '20px',
                background: isSemantic ? 'var(--accent)' : 'var(--bg-secondary)',
                color: isSemantic ? 'var(--bg-primary)' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                transition: 'all 0.2s'
              }}
            >
              {isSemantic ? <Brain size={12} /> : <Network size={12} />}
              {isSemantic ? 'Semantic View' : 'Structure View'}
            </div>
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
              onConnect={onConnect}
              onEdgesDelete={onEdgesDelete}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={['Backspace', 'Delete']}
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
