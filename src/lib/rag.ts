import { invoke } from '@tauri-apps/api/core';

export type PageScope = 'current' | 'workspace' | 'all';

export interface RagSource {
  page_id?: string;
  title: string;
  chunk_text: string;
  score: number;
  url?: string;
}

export interface RagResponse {
  answer: string;
  sources: RagSource[];
}

/**
 * 로컬 RAG 쿼리를 수행합니다. (웹 검색 옵션 포함)
 * @param query 사용자 질문
 * @param scope 검색 범위 ('current' | 'workspace' | 'all')
 * @param includeWeb 웹 검색 포함 여부
 * @param workspaceId 현재 워크스페이스 ID (필수 아님)
 * @param pageId 현재 페이지 ID (필수 아님)
 */
export async function ragQuery(
  query: string,
  scope: PageScope,
  includeWeb: boolean = false,
  workspaceId?: string,
  pageId?: string
): Promise<RagResponse> {
  return invoke<RagResponse>('coflux_rag_query', {
    query,
    scope,
    includeWeb,
    workspaceId: workspaceId || null,
    pageId: pageId || null,
  });
}
