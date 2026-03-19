import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  page_id: string;
  chunk_text: string;
  score: number;
}

export interface LinkPageInfo {
  page_id: string;
  title: string;
  icon: string;
}

export interface RelatedPage {
  page_id: string;
  title: string;
  score: number;
}

/**
 * 페이지를 백그라운드에서 임베딩 인덱싱합니다.
 * OpenAI 키가 없으면 서버에서 0을 반환하고 조용히 스킵됩니다.
 */
export async function indexPage(pageId: string, title: string, content: string): Promise<number> {
  try {
    return await invoke<number>('coflux_index_page', { pageId, title, content });
  } catch (e) {
    console.warn('[Embeddings] indexPage 실패:', e);
    return 0;
  }
}

/**
 * 단일 블록의 임베딩을 업데이트합니다.
 */
export async function updateBlockEmbedding(pageId: string, blockId: string, text: string): Promise<void> {
  try {
    await invoke('coflux_update_block_embedding', { pageId, blockId, text });
  } catch (e) {
    console.warn('[Embeddings] updateBlockEmbedding 실패:', e);
  }
}

/**
 * 여러 블록의 임베딩을 한 번에 삭제합니다.
 */
export async function deleteBlockEmbeddings(pageId: string, blockIds: string[]): Promise<void> {
  try {
    await invoke('coflux_delete_block_embeddings', { pageId, blockIds });
  } catch (e) {
    console.warn('[Embeddings] deleteBlockEmbeddings 실패:', e);
  }
}

/**
 * 텍스트에서 위키링크를 파싱하여 백엔드 DB를 업데이트합니다.
 */
export async function updateWikiLinks(pageId: string, text: string): Promise<void> {
  try {
    await invoke('coflux_update_wiki_links', { pageId, text });
  } catch (e) {
    console.warn('[Embeddings] updateWikiLinks 실패:', e);
  }
}

/**
 * 쿼리와 의미적으로 유사한 페이지 청크를 반환합니다.
 * OpenAI 키가 없으면 에러를 throw합니다.
 */
export async function searchSimilar(query: string, limit = 5): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('coflux_search_similar', { query, limit });
}

export async function getIndexCount(pageId: string): Promise<number> {
  try {
    return await invoke<number>('coflux_get_index_count', { pageId });
  } catch {
    return 0;
  }
}

/** 이 페이지를 링크하는 페이지 목록 (backlinks) */
export async function getBacklinks(pageId: string): Promise<LinkPageInfo[]> {
  try {
    return await invoke<LinkPageInfo[]>('coflux_get_backlinks', { pageId });
  } catch {
    return [];
  }
}

/** 이 페이지가 링크하는 페이지 목록 (outlinks) */
export async function getOutlinks(pageId: string): Promise<LinkPageInfo[]> {
  try {
    return await invoke<LinkPageInfo[]>('coflux_get_outlinks', { pageId });
  } catch {
    return [];
  }
}

/** 전체 위키링크 엣지 및 수동 연결 엣지 목록 [source_id, target_id][] (KnowledgeMap용) */
export async function getAllLinks(): Promise<[string, string][]> {
  try {
    return await invoke<[string, string][]>('coflux_get_all_links');
  } catch {
    return [];
  }
}

/** 지식 맵 수동 노드 엣지 추가 */
export async function addManualLink(sourceId: string, targetId: string): Promise<void> {
  try {
    await invoke('coflux_add_manual_link', { sourceId, targetId });
  } catch (e) {
    console.warn('[Embeddings] addManualLink 실패:', e);
  }
}

/** 지식 맵 수동 노드 엣지 삭제 */
export async function removeManualLink(sourceId: string, targetId: string): Promise<void> {
  try {
    await invoke('coflux_remove_manual_link', { sourceId, targetId });
  } catch (e) {
    console.warn('[Embeddings] removeManualLink 실패:', e);
  }
}

/** 현재 텍스트와 연관된 페이지들을 찾아 반환합니다. (페이지 단위) */
export async function findRelatedPages(text: string, currentPageId?: string, limit = 3): Promise<RelatedPage[]> {
  try {
    return await invoke<RelatedPage[]>('coflux_find_related_pages', { text, currentPageId, limit });
  } catch (e) {
    console.warn('[Embeddings] findRelatedPages 실패:', e);
    return [];
  }
}

export interface PageEmbedding {
  page_id: string;
  title: string;
  embedding: number[];
}

/** 모든 페이지의 평균 임베딩 벡터를 가져옵니다. (시맨틱 맵용) */
export async function getAllPageEmbeddings(): Promise<PageEmbedding[]> {
  try {
    return await invoke<PageEmbedding[]>('coflux_get_all_page_embeddings');
  } catch (e) {
    console.warn('[Embeddings] getAllPageEmbeddings 실패:', e);
    return [];
  }
}

export interface PageActivity {
  page_id: string;
  score: number;
}

/** 모든 페이지의 활동성 점수를 가져옵니다. (히트맵용) */
export async function getKnowledgeActivity(): Promise<PageActivity[]> {
  try {
    return await invoke<PageActivity[]>('coflux_get_knowledge_activity');
  } catch (e) {
    console.warn('[Embeddings] getKnowledgeActivity 실패:', e);
    return [];
  }
}
