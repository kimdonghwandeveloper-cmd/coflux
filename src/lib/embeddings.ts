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

/** 전체 위키링크 엣지 목록 [source_id, target_id][] (KnowledgeMap용) */
export async function getAllLinks(): Promise<[string, string][]> {
  try {
    return await invoke<[string, string][]>('coflux_get_all_links');
  } catch {
    return [];
  }
}
