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
    // 1. 컨텍스트 수집 (로컬 & 웹)
    let mut results = Vec::new();
    let mut local_context = String::new();

    if scope == "current" && page_id.is_some() {
        // 'current' Scope인 경우 해당 페이지의 전체 내용을 가져옵니다.
        let pid = page_id.as_ref().unwrap();
        let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("DB not initialized")?;

        let (title, content): (String, String) = conn
            .query_row(
                "SELECT title, content FROM pages WHERE id = ?1",
                rusqlite::params![pid],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "현재 페이지 정보를 가져올 수 없습니다.".to_string())?;

        local_context.push_str(&format!(
            "--- 현재 페이지 전체 내용 (제목: {}) ---\n{}\n\n",
            title, content
        ));

        // 검색 결과 리렉토리에도 추가 (UI 소스 표시용)
        results.push(RagSource {
            page_id: Some(pid.clone()),
            title,
            chunk_text: content.chars().take(200).collect::<String>() + "...",
            score: 1.0,
            url: None,
        });
    } else {
        // 그 외 Scope은 기존 벡테 검색(Chunks) 방식 사용
        results = search_scoped(&app, &query, workspace_id, page_id, scope, 5).await?;
        for (i, src) in results.iter().enumerate() {
            if src.page_id.is_some() {
                local_context.push_str(&format!(
                    "--- 로컬 문서 {} (제목: {}) ---\n{}\n\n",
                    i + 1,
                    src.title,
                    src.chunk_text
                ));
            }
        }
    }

    // 2. 웹 검색 (선택 사항)
    let mut web_context = String::new();
    if include_web.unwrap_or(false) {
        if let Ok(web_results) =
            crate::web_search::coflux_web_search(app.clone(), query.clone(), Some(3)).await
        {
            for (i, res) in web_results.into_iter().enumerate() {
                results.push(RagSource {
                    page_id: None,
                    title: res.title.clone(),
                    chunk_text: res.snippet.clone(),
                    score: 0.8,
                    url: Some(res.url.clone()),
                });
                web_context.push_str(&format!(
                    "--- 웹 검색 결과 {} (제목: {}) ---\n{}\n\n",
                    i + 1,
                    res.title,
                    res.snippet
                ));
            }
        }
    }

    if local_context.is_empty() && web_context.is_empty() {
        return Ok(RagResponse {
            answer: "관련된 내용을 찾을 수 없습니다.".to_string(),
            sources: vec![],
        });
    }

    // 3. 통합 프롬프트 구성
    let prompt = format!(
        "[로컬 문서 컨텍스트]\n\
        {}\n\
        [웹 검색 컨텍스트]\n\
        {}\n\n\
        [질문]\n\
        {}",
        local_context, web_context, query
    );

    // 4. LLM 호출 (기본 공급자는 openai로 시도하되 설정을 따름)
    let provider = if crate::api_keys::coflux_has_api_key("openai".to_string()).unwrap_or(false) {
        "openai"
    } else if crate::api_keys::coflux_has_api_key("anthropic".to_string()).unwrap_or(false) {
        "anthropic"
    } else {
        "google"
    };

    let answer =
        crate::api_keys::coflux_external_api_call(app, provider.to_string(), prompt).await?;

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
    "
    .to_string();

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
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params_vec), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Vec<u8>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut scored: Vec<RagSource> = Vec::new();
    for (pid, title, text, blob) in rows.flatten() {
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

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    scored.truncate(limit);

    Ok(scored)
}
