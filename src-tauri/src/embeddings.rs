use crate::db_core::DB_CONN;
use lazy_static::lazy_static;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Semaphore;

lazy_static! {
    static ref EMBED_SEM: Arc<Semaphore> = Arc::new(Semaphore::new(3));
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SearchResult {
    pub page_id: String,
    pub chunk_text: String,
    pub score: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RelatedPage {
    pub page_id: String,
    pub title: String,
    pub score: f32,
}

pub fn init_embeddings_table() -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS page_embeddings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            page_id     TEXT NOT NULL,
            block_id    TEXT,
            chunk_index INTEGER,
            chunk_text  TEXT NOT NULL,
            embedding   BLOB NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Migration: Add block_id if it doesn't exist
    let _ = conn.execute("ALTER TABLE page_embeddings ADD COLUMN block_id TEXT", []);
    // Migration: Add unique index for incremental updates
    let _ = conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_page_block ON page_embeddings(page_id, block_id)", []);
    conn.execute(
        "CREATE TABLE IF NOT EXISTS page_links (
            source_page_id TEXT NOT NULL,
            target_page_id TEXT NOT NULL,
            PRIMARY KEY (source_page_id, target_page_id)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// `[[title]]` 패턴을 파싱해 title 목록을 반환합니다.
fn extract_wiki_links(text: &str) -> Vec<String> {
    let mut links = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut i = 0;
    while i + 1 < n {
        if chars[i] == '[' && chars[i + 1] == '[' {
            let start = i + 2;
            let mut j = start;
            while j + 1 < n {
                if chars[j] == ']' && chars[j + 1] == ']' {
                    let title: String = chars[start..j].iter().collect();
                    let title = title.trim().to_string();
                    if !title.is_empty() {
                        links.push(title);
                    }
                    i = j + 2;
                    break;
                }
                j += 1;
            }
            if j + 1 >= n {
                break;
            }
        } else {
            i += 1;
        }
    }
    links
}

fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();
    for line in text.split('\n') {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if current.len() + trimmed.len() + 1 > max_chars && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current = String::new();
        }
        current.push_str(trimmed);
        current.push(' ');
    }
    let tail = current.trim().to_string();
    if !tail.is_empty() {
        chunks.push(tail);
    }
    if chunks.is_empty() {
        let t = text.trim().to_string();
        if !t.is_empty() {
            chunks.push(t);
        }
    }
    chunks
}

pub(crate) fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let mag_a = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let mag_b = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if mag_a == 0.0 || mag_b == 0.0 {
        return 0.0;
    }
    dot / (mag_a * mag_b)
}

fn embedding_to_blob(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

pub(crate) fn blob_to_embedding(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

pub(crate) async fn call_openai_embeddings(text: &str, api_key: &str) -> Result<Vec<f32>, String> {
    let _permit = EMBED_SEM.acquire().await.map_err(|e| e.to_string())?;
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "text-embedding-3-small",
        "input": text,
    });
    let resp = client
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("임베딩 요청 실패: {e}"))?;

    if !resp.status().is_success() {
        let err = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI embeddings 오류: {err}"));
    }

    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json["data"][0]["embedding"]
        .as_array()
        .ok_or("임베딩 응답 구조 오류".to_string())?
        .iter()
        .map(|v| Ok(v.as_f64().unwrap_or(0.0) as f32))
        .collect()
}

/// 페이지 텍스트를 청킹→임베딩→SQLite 저장합니다.
/// OpenAI 키가 없으면 Ok(0)을 반환하고 조용히 스킵합니다.
#[tauri::command]
pub async fn coflux_index_page(
    app: tauri::AppHandle,
    page_id: String,
    title: String,
    content: String,
) -> Result<usize, String> {
    let api_key = match crate::api_keys::decrypt_key_internal(&app, "openai") {
        Ok(k) => k,
        Err(_) => return Ok(0), // OpenAI 키 없음 → 조용히 스킵
    };

    let full_text = if content.trim().is_empty() {
        title.clone()
    } else {
        format!("{}\n{}", title, content)
    };

    if full_text.trim().is_empty() {
        return Ok(0);
    }

    let chunks = chunk_text(&full_text, 400);
    let chunk_count = chunks.len();

    // 기존 임베딩 삭제
    {
        let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("DB not initialized")?;
        conn.execute("DELETE FROM page_embeddings WHERE page_id = ?1", params![page_id])
            .map_err(|e| e.to_string())?;
    }

    for (i, chunk) in chunks.iter().enumerate() {
        let embedding = match call_openai_embeddings(chunk, &api_key).await {
            Ok(e) => e,
            Err(e) => {
                eprintln!("[Embeddings] chunk {i} 오류: {e}");
                continue;
            }
        };
        let blob = embedding_to_blob(&embedding);
        let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "INSERT OR REPLACE INTO page_embeddings (page_id, chunk_index, chunk_text, embedding)
             VALUES (?1, ?2, ?3, ?4)",
            params![page_id, i as i64, chunk, blob],
        )
        .map_err(|e| e.to_string())?;
    }

    eprintln!("[Embeddings] 인덱싱 완료: page_id={page_id}, chunks={chunk_count}");
    Ok(chunk_count)
}

/// 텍스트에서 위키링크를 파싱하여 page_links 테이블을 업데이트합니다.
#[tauri::command]
pub async fn coflux_update_wiki_links(
    page_id: String,
    text: String,
) -> Result<(), String> {
    let linked_titles = extract_wiki_links(&text);
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    
    // 기존 링크 삭제
    conn.execute("DELETE FROM page_links WHERE source_page_id = ?1", params![page_id])
        .map_err(|e| e.to_string())?;
        
    for title in &linked_titles {
        let result: rusqlite::Result<String> = conn.query_row(
            "SELECT id FROM pages WHERE title = ?1 AND (is_deleted IS NULL OR is_deleted = 0)",
            params![title],
            |row| row.get(0),
        );
        if let Ok(target_id) = result {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO page_links (source_page_id, target_page_id) VALUES (?1, ?2)",
                params![page_id, target_id],
            );
        }
    }
    Ok(())
}

/// 단일 블록에 대한 임베딩을 업데이트하거나 생성합니다.
#[tauri::command]
pub async fn coflux_update_block_embedding(
    app: tauri::AppHandle,
    page_id: String,
    block_id: String,
    text: String,
) -> Result<(), String> {
    let api_key = match crate::api_keys::decrypt_key_internal(&app, "openai") {
        Ok(k) => k,
        Err(_) => return Ok(()),
    };

    if text.trim().is_empty() {
        let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("DB not initialized")?;
        conn.execute(
            "DELETE FROM page_embeddings WHERE page_id = ?1 AND block_id = ?2",
            params![page_id, block_id],
        ).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let embedding = call_openai_embeddings(&text, &api_key).await?;
    let blob = embedding_to_blob(&embedding);

    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "INSERT INTO page_embeddings (page_id, block_id, chunk_text, embedding)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(page_id, block_id) DO UPDATE SET chunk_text=excluded.chunk_text, embedding=excluded.embedding",
        params![page_id, block_id, text, blob],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// 여러 블록 임베딩을 한 번에 삭제합니다.
#[tauri::command]
pub async fn coflux_delete_block_embeddings(
    page_id: String,
    block_ids: Vec<String>,
) -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    
    for bid in block_ids {
        conn.execute(
            "DELETE FROM page_embeddings WHERE page_id = ?1 AND block_id = ?2",
            params![page_id, bid],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 쿼리와 유사한 청크를 코사인 유사도 기준으로 반환합니다.
#[tauri::command]
pub async fn coflux_search_similar(
    app: tauri::AppHandle,
    query: String,
    limit: usize,
) -> Result<Vec<SearchResult>, String> {
    let api_key = crate::api_keys::decrypt_key_internal(&app, "openai")
        .map_err(|_| "OpenAI API 키가 없습니다.".to_string())?;

    let query_embedding = call_openai_embeddings(&query, &api_key).await?;

    let rows: Vec<(String, String, Vec<u8>)> = {
        let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("DB not initialized")?;
        let mut stmt = conn
            .prepare("SELECT page_id, chunk_text, embedding FROM page_embeddings")
            .map_err(|e| e.to_string())?;
        let collected: Vec<(String, String, Vec<u8>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    let mut scored: Vec<SearchResult> = rows
        .into_iter()
        .map(|(page_id, chunk_text, blob)| {
            let emb = blob_to_embedding(&blob);
            let score = cosine_similarity(&query_embedding, &emb);
            SearchResult { page_id, chunk_text, score }
        })
        .collect();

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(limit);
    Ok(scored)
}

/// 현재 텍스트와 연관된 페이지들을 찾아 반환합니다. (페이지 단위 집계)
#[tauri::command]
pub async fn coflux_find_related_pages(
    app: tauri::AppHandle,
    text: String,
    current_page_id: Option<String>,
    limit: usize,
) -> Result<Vec<RelatedPage>, String> {
    let api_key = crate::api_keys::decrypt_key_internal(&app, "openai")
        .map_err(|_| "OpenAI API 키가 없습니다.".to_string())?;

    let query_embedding = call_openai_embeddings(&text, &api_key).await?;

    // 모든 청크와 유사도 계산 후 페이지별 최대 점수 추출
    let rows: Vec<(String, String, Vec<u8>)> = {
        let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("DB not initialized")?;
        
        // 페이지 제목을 같이 가져오기 위해 조인
        let mut stmt = conn.prepare("
            SELECT e.page_id, p.title, e.embedding 
            FROM page_embeddings e
            JOIN pages p ON e.page_id = p.id
            WHERE (p.is_deleted IS NULL OR p.is_deleted = 0)
        ").map_err(|e| e.to_string())?;

        let collected: Vec<(String, String, Vec<u8>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    use std::collections::HashMap;
    let mut page_scores: HashMap<String, (String, f32)> = HashMap::new();

    for (pid, title, blob) in rows {
        // 현재 페이지는 제외
        if let Some(ref current_id) = current_page_id {
            if &pid == current_id {
                continue;
            }
        }

        let emb = blob_to_embedding(&blob);
        let score = cosine_similarity(&query_embedding, &emb);

        let entry = page_scores.entry(pid.clone()).or_insert((title, 0.0));
        if score > entry.1 {
            entry.1 = score;
        }
    }

    let mut result: Vec<RelatedPage> = page_scores
        .into_iter()
        .map(|(id, (title, score))| RelatedPage { page_id: id, title, score })
        .collect();

    result.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    result.truncate(limit);

    Ok(result)
}

/// 특정 페이지의 인덱싱 청크 수를 반환합니다 (0이면 미인덱싱).
#[tauri::command]
pub fn coflux_get_index_count(page_id: String) -> Result<i64, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.query_row(
        "SELECT COUNT(*) FROM page_embeddings WHERE page_id = ?1",
        params![page_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LinkPageInfo {
    pub page_id: String,
    pub title: String,
    pub icon: String,
}

/// 이 페이지를 링크하는 페이지 목록 (backlinks)
#[tauri::command]
pub fn coflux_get_backlinks(page_id: String) -> Result<Vec<LinkPageInfo>, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.title, p.icon FROM (
                 SELECT source_page_id, target_page_id FROM page_links
                 UNION
                 SELECT source_page_id, target_page_id FROM manual_links
             ) l
             JOIN pages p ON p.id = l.source_page_id
             WHERE l.target_page_id = ?1 AND (p.is_deleted IS NULL OR p.is_deleted = 0)",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<LinkPageInfo> = stmt
        .query_map(params![page_id], |row| {
            Ok(LinkPageInfo { page_id: row.get(0)?, title: row.get(1)?, icon: row.get(2)? })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// 이 페이지가 링크하는 페이지 목록 (outlinks)
#[tauri::command]
pub fn coflux_get_outlinks(page_id: String) -> Result<Vec<LinkPageInfo>, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.title, p.icon FROM (
                 SELECT source_page_id, target_page_id FROM page_links
                 UNION
                 SELECT source_page_id, target_page_id FROM manual_links
             ) l
             JOIN pages p ON p.id = l.target_page_id
             WHERE l.source_page_id = ?1 AND (p.is_deleted IS NULL OR p.is_deleted = 0)",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<LinkPageInfo> = stmt
        .query_map(params![page_id], |row| {
            Ok(LinkPageInfo { page_id: row.get(0)?, title: row.get(1)?, icon: row.get(2)? })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// 전체 위키링크 엣지 목록 (KnowledgeMap용)
#[tauri::command]
pub fn coflux_get_all_links() -> Result<Vec<(String, String)>, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let mut stmt = conn
        .prepare(
            "SELECT source_page_id, target_page_id FROM page_links 
             UNION 
             SELECT source_page_id, target_page_id FROM manual_links"
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rows)
}

/// 모든 페이지의 임베딩을 가져와 페이지 단위로 평균(Mean Pooling)하여 반환합니다.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PageEmbedding {
    pub page_id: String,
    pub title: String,
    pub embedding: Vec<f32>,
}

#[tauri::command]
pub async fn coflux_get_all_page_embeddings() -> Result<Vec<PageEmbedding>, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;

    // 1. 모든 페이지와 그 타이틀 가져오기
    let mut stmt = conn.prepare("SELECT id, title FROM pages WHERE (is_deleted IS NULL OR is_deleted = 0)")
        .map_err(|e| e.to_string())?;
    let pages: Vec<(String, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut results = Vec::new();

    for (page_id, title) in pages {
        // 2. 해당 페이지의 모든 청크 임베딩 가져오기
        let mut estmt = conn.prepare("SELECT embedding FROM page_embeddings WHERE page_id = ?1")
            .map_err(|e| e.to_string())?;
        let blobs: Vec<Vec<u8>> = estmt.query_map(params![page_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if blobs.is_empty() {
            continue;
        }

        // 3. 임베딩 평균 계산
        let mut sum_vec: Vec<f32> = Vec::new();
        let mut count = 0;

        for blob in blobs {
            let emb = blob_to_embedding(&blob);
            if sum_vec.is_empty() {
                sum_vec = emb;
            } else {
                for (s, v) in sum_vec.iter_mut().zip(emb.iter()) {
                    *s += v;
                }
            }
            count += 1;
        }

        if count > 0 {
            for s in sum_vec.iter_mut() {
                *s /= count as f32;
            }
            results.push(PageEmbedding {
                page_id,
                title,
                embedding: sum_vec,
            });
        }
    }

    Ok(results)
}
