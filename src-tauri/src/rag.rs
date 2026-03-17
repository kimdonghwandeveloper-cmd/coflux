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
    pub page_id: String,
    pub title: String,
    pub chunk_text: String,
    pub score: f32,
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
) -> Result<RagResponse, String> {
    // 1. 임베딩 기반 검색 및 필터링
    let results = search_scoped(&app, &query, workspace_id, page_id, scope, 5).await?;
    
    if results.is_empty() {
        return Ok(RagResponse {
            answer: "관련된 문서 내용을 찾을 수 없습니다.".to_string(),
            sources: vec![],
        });
    }

    // 3. 컨텍스트 구성
    let mut context_text = String::new();
    for (i, src) in results.iter().enumerate() {
        context_text.push_str(&format!("--- 문서 {} (제목: {}) ---\n{}\n\n", i + 1, src.title, src.chunk_text));
    }

    let prompt = format!(
        "[시스템]\n\
        당신은 CoFlux 워크스페이스 AI 어시스턴트입니다.\n\
        아래 문서 컨텍스트를 바탕으로 사용자의 질문에 답변하세요.\n\
        컨텍스트에 없는 내용이면 솔직히 모른다고 하세요.\n\n\
        [컨텍스트]\n\
        {}\n\
        [질문]\n\
        {}",
        context_text, query
    );

    // 4. LLM 호출 (기존 api_keys.rs의 coflux_external_api_call 재사용)
    // provider는 일단 openai로 고정하거나 pick_provider 로직 사용 가능
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
                page_id: pid,
                title,
                chunk_text: text,
                score,
            });
        }
    }

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    
    Ok(scored)
}
