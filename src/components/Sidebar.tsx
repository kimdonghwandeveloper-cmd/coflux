import { useState, useRef, useEffect } from 'react';
import { Plus, Settings, Moon, Sun, MoreHorizontal, Star, Trash2, ChevronDown, ChevronRight, RotateCcw, X, GripVertical, Sparkles, LayoutGrid, Database, Palette } from 'lucide-react';
import { PageData, WorkspaceData } from '../App';
import { TOGGLE_THEME_IDS } from '../lib/theme';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import logo from '../assets/logo.png';
import { PageActivity } from '../lib/embeddings';

// Sortable page item wrapper
const SortablePageItem = ({ page, depth, activePageId, setActivePageId, openMenuId, setOpenMenuId, onUpdatePage, onDeletePage, menuRef, hasChildren, expandedIds, toggleExpand, getChildren, renderPageItem, isHeatmap, activityScores }: any) => {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, };

  const children = getChildren(page.id);
  const isExpanded = expandedIds.has(page.id);

  const score = isHeatmap ? activityScores?.find((s: PageActivity) => s.page_id === page.id)?.score || 0 : 0;
  const heatColor = isHeatmap && score > 0 ? `rgba(255, ${150 - score * 100}, 0, ${0.4 + score * 0.6})` : 'transparent';

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`sidebar-item ${activePageId === page.id ? 'active' : ''}`}
        onClick={() => setActivePageId(page.id)}
        style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', paddingRight: '4px', paddingLeft: `${12 + depth * 16}px` }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'hidden' }}>
          <div {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', padding: '2px', flexShrink: 0 }}>
            <GripVertical size={12} color="var(--text-secondary)" style={{ opacity: 0.4 }} />
          </div>
          {hasChildren(page.id) ? (
            <div onClick={(e) => { e.stopPropagation(); toggleExpand(page.id); }} style={{ cursor: 'pointer', display: 'flex', padding: '2px' }}>
              {isExpanded ? <ChevronDown size={14} color="var(--text-secondary)" /> : <ChevronRight size={14} color="var(--text-secondary)" />}
            </div>
          ) : (
            <div style={{ width: '18px' }} />
          )}
          <span style={{ fontSize: '16px' }}>{page.icon}</span>
          <span style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isHeatmap && score > 0.5 ? 'var(--text-primary)' : 'inherit',
            fontWeight: isHeatmap && score > 0.7 ? 600 : 'inherit'
          }}>{page.title}</span>
          {isHeatmap && score > 0 && (
            <div style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: heatColor,
              boxShadow: score > 0.6 ? `0 0 8px ${heatColor}` : 'none',
              marginLeft: '4px'
            }} />
          )}
        </div>

        <div className="sidebar-item-actions"
          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === page.id ? null : page.id); }}
          style={{ padding: '2px', borderRadius: '4px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
          <MoreHorizontal size={16} color="var(--text-secondary)" />
        </div>

        {openMenuId === page.id && (
          <div ref={menuRef}
            style={{ position: 'absolute', top: '28px', right: '8px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '6px', zIndex: 100, padding: '4px', width: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}
            onClick={e => e.stopPropagation()}>
            <div className="sidebar-item" style={{ margin: 0, padding: '6px 8px' }}
              onClick={(e) => { e.stopPropagation(); onUpdatePage({ ...page, isFavorite: !page.isFavorite }); setOpenMenuId(null); }}>
              <Star size={14} fill={page.isFavorite ? 'currentColor' : 'none'} color={page.isFavorite ? 'var(--accent)' : 'var(--text-secondary)'} />
              <span style={{ fontSize: '13px' }}>{page.isFavorite ? t('remove_from_favorites') : t('add_to_favorites')}</span>
            </div>
            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
            <div className="sidebar-item" style={{ margin: 0, padding: '6px 8px', color: 'var(--error)' }}
              onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); setOpenMenuId(null); }}>
              <Trash2 size={14} />
              <span style={{ fontSize: '13px' }}>{t('delete')}</span>
            </div>
          </div>
        )}
      </div>
      {isExpanded && children.map((child: PageData) => renderPageItem(child, depth + 1))}
    </div>
  );
};

export const Sidebar = ({
  theme,
  toggleTheme,
  activeThemeId,
  pages,
  trashedPages,
  activePageId,
  setActivePageId,
  workspaces,
  activeWorkspaceId,
  onSwitchWorkspace,
  onAddWorkspace,
  onAddPage,
  onUpdatePage,
  onDeletePage,
  onRestorePage,
  onPermanentlyDeletePage,
  onOpenSettings,
  onReorderPages,
  isHeatmap,
  activityScores,
  currentView,
  setCurrentView
}: {
  theme: string,
  toggleTheme: () => void,
  activeThemeId: string,
  pages: PageData[],
  trashedPages: PageData[],
  activePageId: string,
  setActivePageId: (id: string) => void,
  workspaces: WorkspaceData[],
  activeWorkspaceId: string,
  onSwitchWorkspace: (id: string) => void,
  onAddWorkspace: (name: string) => void,
  onAddPage: (parentId?: string) => void,
  onUpdatePage: (p: PageData) => void,
  onDeletePage: (id: string) => void,
  onRestorePage: (id: string) => void,
  onPermanentlyDeletePage: (id: string) => void,
  onOpenSettings: () => void,
  onReorderPages: (ids: string[]) => void,
  isHeatmap?: boolean,
  activityScores?: PageActivity[],
  currentView: 'editor' | 'whiteboard' | 'database' | 'dashboard',
  setCurrentView: (v: 'editor' | 'whiteboard' | 'database' | 'dashboard') => void
}) => {
  const { t } = useTranslation();
  const [showInsights, setShowInsights] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeDragPage, setActiveDragPage] = useState<PageData | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showWsDropdown, setShowWsDropdown] = useState(false);
  const [showTrash, setShowTrash] = useState(false);

  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const checkInsights = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { getVersion } = await import('@tauri-apps/api/app');

        const currentVersion = await getVersion();
        const dismissedVersion = await invoke<string>('coflux_get_setting', { key: 'dismissed_insights_version' });

        if (dismissedVersion !== currentVersion) {
          setShowInsights(true);
        } else {
          setShowInsights(false);
        }
      } catch (e) {
        setShowInsights(true);
      }
    };
    checkInsights();
  }, []);

  const handleDismissInsights = async () => {
    setShowInsights(false);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { getVersion } = await import('@tauri-apps/api/app');
      const currentVersion = await getVersion();
      await invoke('coflux_set_setting', { key: 'dismissed_insights_version', value: currentVersion });
    } catch (e) {
      console.error(e);
    }
  };
  const [newWsName, setNewWsName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenuId(null);
      if (wsRef.current && !wsRef.current.contains(event.target as Node)) setShowWsDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200; // minimum
      if (newWidth > 600) newWidth = 600; // maximum
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (isResizing) setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId);
  const sortByOrder = (a: PageData, b: PageData) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  const getChildren = (parentId: string) => pages.filter(p => p.parentId === parentId).sort(sortByOrder);
  const hasChildren = (parentId: string) => pages.some(p => p.parentId === parentId);

  const favoriteRoots = pages.filter(p => p.isFavorite && !p.parentId).sort(sortByOrder);
  const privateRoots = pages.filter(p => !p.isFavorite && !p.parentId).sort(sortByOrder);

  const handleDragStart = (event: DragStartEvent) => {
    const page = privateRoots.find(p => p.id === event.active.id);
    setActiveDragPage(page ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragPage(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIds = privateRoots.map(p => p.id);
    const oldIndex = oldIds.indexOf(active.id as string);
    const newIndex = oldIds.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(oldIds, oldIndex, newIndex);
    onReorderPages(newOrder);
  };

  const renderPageItem = (page: PageData, depth: number = 0) => (
    <SortablePageItem
      key={page.id}
      page={page}
      depth={depth}
      activePageId={activePageId}
      setActivePageId={setActivePageId}
      openMenuId={openMenuId}
      setOpenMenuId={setOpenMenuId}
      onUpdatePage={onUpdatePage}
      onDeletePage={onDeletePage}
      menuRef={menuRef}
      hasChildren={hasChildren}
      expandedIds={expandedIds}
      toggleExpand={toggleExpand}
      getChildren={getChildren}
      renderPageItem={renderPageItem}
      isHeatmap={isHeatmap}
      activityScores={activityScores}
    />
  );

  return (
    <div className="sidebar" style={{
      paddingTop: '12px',
      width: `${sidebarWidth}px`,
      minWidth: `${sidebarWidth}px`,
      transition: isResizing ? 'none' : 'width 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.3s',
      position: 'relative'
    }}>
      {/* Drag handle */}
      <div
        onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
        style={{
          position: 'absolute',
          top: 0,
          right: '-2px', // cover the border perfectly
          width: '6px',
          height: '100%',
          cursor: 'col-resize',
          zIndex: 50,
          backgroundColor: isResizing ? 'var(--accent)' : 'transparent',
          transition: 'background-color 0.2s'
        }}
        onMouseOver={e => !isResizing && (e.currentTarget.style.backgroundColor = 'var(--border-color)')}
        onMouseOut={e => !isResizing && (e.currentTarget.style.backgroundColor = 'transparent')}
      />

      {/* Brand Header */}
      <div style={{ padding: '0 16px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <img src={logo} alt="Coflux Logo" style={{ width: '28px', height: 'auto' }} />
        <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: 'inherit' }}>Coflux</span>
      </div>

      {/* Workspace Selector */}
      <div style={{ padding: '0 16px 24px', position: 'relative' }} ref={wsRef}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '4px 0' }}
          onClick={() => setShowWsDropdown(!showWsDropdown)}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px' }}>{activeWs?.icon || 'W'}</div>
          <div style={{ fontSize: '15px', fontWeight: 600, flex: 1 }}>{activeWs?.name || t('my_workspace')}</div>
          <ChevronDown size={14} color="var(--text-secondary)" />
        </div>

        {showWsDropdown && (
          <div style={{ position: 'absolute', top: '52px', left: '16px', right: '16px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '8px', zIndex: 200, padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {workspaces.map(ws => (
              <div key={ws.id} className="sidebar-item"
                style={{ margin: 0, padding: '6px 8px', fontWeight: ws.id === activeWorkspaceId ? 600 : 400, background: ws.id === activeWorkspaceId ? 'var(--border-color)' : 'transparent' }}
                onClick={() => { onSwitchWorkspace(ws.id); setShowWsDropdown(false); }}>
                <div style={{ width: '22px', height: '22px', borderRadius: '4px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>{ws.icon}</div>
                <span style={{ fontSize: '13px' }}>{ws.name}</span>
              </div>
            ))}
            <div style={{ height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
            <div style={{ display: 'flex', gap: '4px', padding: '4px' }}>
              <input type="text" value={newWsName} onChange={e => setNewWsName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newWsName.trim()) { onAddWorkspace(newWsName.trim()); setNewWsName(''); setShowWsDropdown(false); } }}
                placeholder={t('new_workspace')}
                style={{ flex: 1, border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none' }} />
              <div onClick={() => { if (newWsName.trim()) { onAddWorkspace(newWsName.trim()); setNewWsName(''); setShowWsDropdown(false); } }}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}>
                <Plus size={16} color="var(--text-secondary)" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI Insights Card */}
      {showInsights && (
        <div style={{ padding: '0 16px 20px', animation: 'fadeIn 0.5s ease-out' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-secondary) 100%)',
            borderRadius: '12px', border: '1px solid var(--border-color)', padding: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
            position: 'relative'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.05em' }}>
                <Sparkles size={12} /> <span>COFLUX INSIGHTS</span>
              </div>
              <div onClick={handleDismissInsights} style={{ cursor: 'pointer', padding: '2px', display: 'flex', opacity: 0.6 }}>
                <X size={12} color="var(--text-secondary)" />
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
              {pages.length > 5 ? `${pages.length}개의 지식이 연결되어 있습니다.` : '새로운 지식을 연결해보세요!'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {activePageId ? '현재 페이지를 분석하여 새로운 인사이트를 도출할 준비가 되었습니다.' : '지난주보다 활동성이 15% 증가했습니다. 꾸준한 기록을 응원합니다!'}
            </div>
          </div>
        </div>
      )}

      {/* Apps Section */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ padding: '0 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Apps</div>

        <div className={`sidebar-item ${currentView === 'whiteboard' ? 'active' : ''}`} onClick={() => setCurrentView('whiteboard')}>
          <LayoutGrid size={16} />
          <span style={{ fontSize: '13px' }}>Whiteboard</span>
        </div>

        <div className={`sidebar-item ${currentView === 'database' ? 'active' : ''}`} onClick={() => setCurrentView('database')}>
          <Database size={16} />
          <span style={{ fontSize: '13px' }}>Database</span>
        </div>

        {/* 
        <div className={`sidebar-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>
          <Palette size={16} />
          <span style={{ fontSize: '13px' }}>Dashboard</span>
        </div>
        */}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {favoriteRoots.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ padding: '0 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('favorites')}</div>
            {favoriteRoots.map(p => renderPageItem(p, 0))}
          </div>
        )}

        <div>
          <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t('private')}</div>
            <div onClick={() => onAddPage()} style={{ cursor: 'pointer', padding: '2px', display: 'flex' }}>
              <Plus size={16} color="var(--text-secondary)" />
            </div>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <SortableContext items={privateRoots.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {privateRoots.map(p => renderPageItem(p, 0))}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeDragPage && (
                <div style={{
                  background: 'var(--bg-primary)',
                  border: '1.5px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  opacity: 0.85,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  cursor: 'grabbing',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  maxWidth: '200px',
                  overflow: 'hidden',
                }}>
                  <span style={{ fontSize: '15px' }}>{activeDragPage.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeDragPage.title || t('untitled')}
                  </span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Trash Section */}
        <div style={{ marginTop: '16px' }}>
          <div
            style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            onClick={() => setShowTrash(!showTrash)}>
            <Trash2 size={12} color="var(--text-secondary)" />
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {trashedPages.length > 0 ? t('trash_count', { count: trashedPages.length }) : t('trash')}
            </div>
            {trashedPages.length > 0 && (
              showTrash ? <ChevronDown size={12} color="var(--text-secondary)" /> : <ChevronRight size={12} color="var(--text-secondary)" />
            )}
          </div>
          {showTrash && trashedPages.map(page => (
            <div key={page.id} className="sidebar-item" style={{ paddingRight: '4px', opacity: 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                <span style={{ fontSize: '16px' }}>{page.icon}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', textDecoration: 'line-through' }}>{page.title}</span>
              </div>
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <div onClick={(e) => { e.stopPropagation(); onRestorePage(page.id); }} title="Restore"
                  style={{ padding: '2px', cursor: 'pointer', borderRadius: '4px' }}>
                  <RotateCcw size={14} color="var(--text-secondary)" />
                </div>
                <div onClick={(e) => { e.stopPropagation(); onPermanentlyDeletePage(page.id); }} title="Delete permanently"
                  style={{ padding: '2px', cursor: 'pointer', borderRadius: '4px' }}>
                  <X size={14} color="var(--error)" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="sidebar-item" style={{ margin: 0, padding: '4px 8px', gap: '8px' }} title={t('settings')} onClick={onOpenSettings}>
          <Settings size={16} color="var(--text-secondary)" />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{t('settings')}</span>
        </div>
        {TOGGLE_THEME_IDS.includes(activeThemeId) && (
          <div className="sidebar-item" style={{ margin: 0, padding: '8px', justifyContent: 'center' }} onClick={toggleTheme} title="Toggle Theme">
            {theme === 'light' ? <Moon size={16} color="var(--text-secondary)" /> : <Sun size={16} color="var(--text-secondary)" />}
          </div>
        )}
      </div>
    </div>
  );
};
