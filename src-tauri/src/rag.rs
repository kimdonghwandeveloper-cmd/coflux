use crate::db_core::DB_CONN;
use crate::embeddings::{blob_to_embedding, cosine_similarity};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Deserialize)]
pub enum PageScope {
    #[serde(rename = "current")]
    Current,
    #[serde(rename = "workspace")]
    Workspace,
    #[serde(rename = "all")]
    All,
}

#[derive(Serialize, Debug, Clone)]
pub struct RagSource {
    pub page_id: Option<String>,
    pub title: String,
    pub chunk_text: String,
    pub score: f32,
    pub url: Option<String>, // 웹 검색 결과용
}

#[derive(Serialize)]
pub struct RagResponse {
    pub answer: String,
    pub sources: Vec<RagSource>,
}

#[tauri::command]
pub async fn coflux_rag_query(
    app: AppHandle,
    query: String,
    workspace_id: Option<String>,
    page_id: Option<String>,
    scope: String, // "current", "workspace", "all"
    include_web: Option<bool>,
) -> Result<RagResponse, String> {
    // 1. 로컬 임베딩 검색
    let mut results = search_scoped(&app, &query, workspace_id, page_id, scope, 5).await?;
    
    // 2. 웹 검색 (선택 사항)
    let mut web_context = String::new();
    if include_web.unwrap_or(false) {
        if let Ok(web_results) = crate::web_search::coflux_web_search(app.clone(), query.clone(), Some(3)).await {
            let mut i = 0;
            for res in web_results {
                results.push(RagSource {
                    page_id: None,
                    title: res.title.clone(),
                    chunk_text: res.snippet.clone(),
                    score: 0.8,
                    url: Some(res.url),
                });
                web_context.push_str(&format!("--- 웹 검색 결과 {} (제목: {}) ---\n{}\n\n", i + 1, res.title, res.snippet));
                i += 1;
            }
        }
    }

    if results.is_empty() {
        return Ok(RagResponse {
            answer: "관련된 내용을 찾을 수 없습니다.".to_string(),
            sources: vec![],
        });
    }

    // 3. 통합 컨텍스트 구성
    let mut local_context = String::new();
    let local_results: Vec<_> = results.iter().filter(|r| r.page_id.is_some()).collect();
    for (i, src) in local_results.iter().enumerate() {
        local_context.push_str(&format!("--- 로컬 문서 {} (제목: {}) ---\n{}\n\n", i + 1, src.title, src.chunk_text));
    }

    let prompt = format!(
        "[시스템]\n\
        당신은 CoFlux 워크스페이스 AI 어시스턴트입니다.\n\
        아래 제공된 [로컬 문서 컨텍스트]와 [웹 검색 컨텍스트]를 바탕으로 사용자의 질문에 답변하세요.\n\
        로컬 문서를 우선적으로 참고하고, 웹 검색 결과는 최신 정보나 보조 자료로 활용하세요.\n\
        컨텍스트에 없는 내용이면 솔직히 모른다고 하세요.\n\n\
        [로컬 문서 컨텍스트]\n\
        {}\n\
        [웹 검색 컨텍스트]\n\
        {}\n\
        [질문]\n\
        {}",
        local_context, web_context, query
    );

    // 4. LLM 호출
    let answer = crate::api_keys::coflux_external_api_call(app, "openai".to_string(), prompt).await?;

    Ok(RagResponse {
        answer,
        sources: results,
    })
}

async fn search_scoped(
    app: &AppHandle,
    query: &str,
    workspace_id: Option<String>,
    page_id: Option<String>,
    scope: String,
    limit: usize,
) -> Result<Vec<RagSource>, String> {
    let api_key = crate::api_keys::decrypt_key_internal(app, "openai")?;
    
    let query_embedding = crate::embeddings::call_openai_embeddings(query, &api_key).await?;

    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    let mut sql = "
        SELECT e.page_id, p.title, e.chunk_text, e.embedding 
        FROM page_embeddings e
        JOIN pages p ON e.page_id = p.id
        WHERE (p.is_deleted IS NULL OR p.is_deleted = 0)
    ".to_string();

    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    match scope.as_str() {
        "current" => {
            if let Some(pid) = page_id {
                sql.push_str(" AND e.page_id = ?1");
                params_vec.push(pid.into());
            }
        }
        "workspace" => {
            if let Some(wid) = workspace_id {
                sql.push_str(" AND p.workspace_id = ?1");
                params_vec.push(wid.into());
            }
        }
        _ => {} // "all"
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Vec<u8>>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    let mut scored: Vec<RagSource> = Vec::new();
    for row in rows {
        if let Ok((pid, title, text, blob)) = row {
            let emb = blob_to_embedding(&blob);
            let score = cosine_similarity(&query_embedding, &emb);
            scored.push(RagSource {
                page_id: Some(pid),
                title,
                chunk_text: text,
                score,
                url: None,
            });
        }
    }

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    
    Ok(scored)
}
