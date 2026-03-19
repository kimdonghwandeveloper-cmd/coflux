/// BYOK API 키 관리 모듈
///
/// - AES-256-GCM 암호화 후 SQLite 저장
/// - 마스터 키는 {app_data_dir}/coflux.key (32바이트 랜덤)
/// - API 키는 TypeScript에 절대 노출되지 않음 (Rust 레이어에서만 복호화)
use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use tauri::Manager;

use crate::db_core::DB_CONN;

// ─── 마스터 키 ────────────────────────────────────────────────────────────────

fn key_file_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("앱 데이터 디렉터리 조회 실패: {e}"))?;
    Ok(dir.join("coflux.key"))
}

/// 32바이트 마스터 키 로드 또는 신규 생성.
fn load_or_create_master_key(app: &tauri::AppHandle) -> Result<[u8; 32], String> {
    let path = key_file_path(app)?;
    if path.exists() {
        let bytes = std::fs::read(&path).map_err(|e| format!("키 파일 읽기 실패: {e}"))?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
        // 손상된 키 파일 → 재생성
        let _ = std::fs::remove_file(&path);
    }

    let key = Aes256Gcm::generate_key(&mut OsRng);
    let dir = path.parent().unwrap();
    std::fs::create_dir_all(dir).map_err(|e| format!("키 디렉터리 생성 실패: {e}"))?;
    std::fs::write(&path, key.as_slice()).map_err(|e| format!("키 파일 쓰기 실패: {e}"))?;

    let mut out = [0u8; 32];
    out.copy_from_slice(key.as_slice());
    Ok(out)
}

// ─── DB 초기화 ────────────────────────────────────────────────────────────────

pub fn init_api_key_table() -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS api_keys (
            provider  TEXT PRIMARY KEY,
            ciphertext BLOB NOT NULL,
            nonce      BLOB NOT NULL,
            preferred_model TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    
    // 마이그레이션: 기존 테이블에 preferred_model 컬럼이 없을 경우 추가
    let _ = conn.execute("ALTER TABLE api_keys ADD COLUMN preferred_model TEXT", []);
    
    Ok(())
}

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

fn decrypt_api_key(app: &tauri::AppHandle, provider: &str) -> Result<String, String> {
    let raw_key = load_or_create_master_key(app)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&raw_key));

    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;

    let (ciphertext, nonce_bytes): (Vec<u8>, Vec<u8>) = conn
        .query_row(
            "SELECT ciphertext, nonce FROM api_keys WHERE provider = ?1",
            rusqlite::params![provider],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("provider '{provider}'의 API 키를 찾을 수 없습니다."))?;

    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| format!("복호화 실패: {e}"))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 변환 실패: {e}"))
}

/// 내부 모듈에서 API 키를 복호화할 때 사용합니다.
pub(crate) fn decrypt_key_internal(app: &tauri::AppHandle, provider: &str) -> Result<String, String> {
    decrypt_api_key(app, provider)
}

/// 시스템 프롬프트: CoFlux 아키텍트 페르소나
fn get_system_prompt() -> &'static str {
    " 당신은 CoFlux 지식 기반 아키텍트입니다. 단순한 채팅 AI가 아니라 지식의 연결과 구조화를 돕는 전문가입니다.\n\
    냉철하고 논리적인 분석가형이며, 지나친 친절보다는 정확하고 효율적인 정보를 제공하는 데 집중합니다.\n\
    CoFlux의 페이지 구조, 워크스페이스 연결 방식, 마크다운 기반의 정리를 완벽히 이해하고 대답합니다.\n\
    사용자가 요약을 요청하면 단순히 줄이는 것이 아니라, 내용 간의 논리적 결점이나 보완해야 할 점까지 짚어줍니다."
}

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// API 키와 선호 모델을 저장합니다.
#[tauri::command]
pub fn coflux_register_api_key(
    app: tauri::AppHandle,
    provider: String,
    api_key: String,
    preferred_model: Option<String>,
) -> Result<(), String> {
    let raw_key = load_or_create_master_key(&app)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&raw_key));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, api_key.as_bytes())
        .map_err(|e| format!("암호화 실패: {e}"))?;

    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;
    conn.execute(
        "INSERT OR REPLACE INTO api_keys (provider, ciphertext, nonce, preferred_model) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![provider, ciphertext, nonce.as_slice(), preferred_model],
    )
    .map_err(|e| e.to_string())?;

    eprintln!("[BYOK] API 키 등록/수정: provider={provider}");
    Ok(())
}

/// 선호하는 모델을 설정합니다.
#[tauri::command]
pub fn coflux_set_preferred_model(provider: String, model: String) -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;
    conn.execute(
        "UPDATE api_keys SET preferred_model = ?1 WHERE provider = ?2",
        rusqlite::params![model, provider],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 특정 provider의 설정을 반환합니다.
#[tauri::command]
pub fn coflux_get_provider_config(provider: String) -> Result<serde_json::Value, String> {
    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;
    let row = conn.query_row(
        "SELECT preferred_model FROM api_keys WHERE provider = ?1",
        rusqlite::params![provider],
        |row| {
            let model: Option<String> = row.get(0)?;
            Ok(serde_json::json!({
                "registered": true,
                "preferred_model": model
            }))
        }
    );
    
    match row {
        Ok(v) => Ok(v),
        Err(_) => Ok(serde_json::json!({ "registered": false, "preferred_model": null }))
    }
}

/// 특정 provider의 API 키 등록 여부를 반환합니다.
#[tauri::command]
pub fn coflux_has_api_key(provider: String) -> Result<bool, String> {
    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM api_keys WHERE provider = ?1",
            rusqlite::params![provider],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

/// 특정 provider의 API 키를 삭제합니다.
#[tauri::command]
pub fn coflux_delete_api_key(provider: String) -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|_| "DB Lock 실패".to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;
    conn.execute(
        "DELETE FROM api_keys WHERE provider = ?1",
        rusqlite::params![provider],
    )
    .map_err(|e| e.to_string())?;
    eprintln!("[BYOK] API 키 삭제: provider={provider}");
    Ok(())
}

/// 외부 AI API를 호출합니다.
#[tauri::command]
pub async fn coflux_external_api_call(
    app: tauri::AppHandle,
    provider: String,
    prompt: String,
) -> Result<String, String> {
    let api_key = decrypt_api_key(&app, &provider)?;
    let config = coflux_get_provider_config(provider.clone())?;
    let preferred_model = config["preferred_model"].as_str();
    
    let client = reqwest::Client::new();
    let sys_prompt = get_system_prompt();

    match provider.as_str() {
        "openai" => {
            let model = preferred_model.unwrap_or("gpt-4o-mini");
            let body = serde_json::json!({
                "model": model,
                "messages": [
                    { "role": "system", "content": sys_prompt },
                    { "role": "user", "content": prompt }
                ],
                "max_tokens": 1024
            });
            let res = client
                .post("https://api.openai.com/v1/chat/completions")
                .bearer_auth(&api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("OpenAI 요청 실패: {e}"))?;

            if !res.status().is_success() {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                return Err(format!("OpenAI 오류 {status}: {text}"));
            }

            let json: serde_json::Value =
                res.json().await.map_err(|e| format!("OpenAI 응답 파싱 실패: {e}"))?;
            json["choices"][0]["message"]["content"]
                .as_str()
                .map(String::from)
                .ok_or_else(|| format!("OpenAI 응답 구조 오류: {json}"))
        }
        "anthropic" => {
            let model = preferred_model.unwrap_or("claude-3-haiku-20240307");
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 1024,
                "system": sys_prompt,
                "messages": [{ "role": "user", "content": prompt }]
            });
            let res = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Anthropic 요청 실패: {e}"))?;

            if !res.status().is_success() {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                return Err(format!("Anthropic 오류 {status}: {text}"));
            }

            let json: serde_json::Value =
                res.json().await.map_err(|e| format!("Anthropic 응답 파싱 실패: {e}"))?;
            json["content"][0]["text"]
                .as_str()
                .map(String::from)
                .ok_or_else(|| format!("Anthropic 응답 구조 오류: {json}"))
        }
        "google" => {
            let model = preferred_model.unwrap_or("gemini-1.5-flash");
            // Google Gemini API v1beta
            let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model, api_key);
            let body = serde_json::json!({
                "contents": [{
                    "parts": [{ "text": format!("{}\n\nUser Question: {}", sys_prompt, prompt) }]
                }],
                "generationConfig": {
                    "maxOutputTokens": 1024
                }
            });
            let res = client
                .post(&url)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Google Gemini 요청 실패: {e}"))?;

            if !res.status().is_success() {
                let status = res.status();
                let text = res.text().await.unwrap_or_default();
                return Err(format!("Google Gemini 오류 {status}: {text}"));
            }

            let json: serde_json::Value =
                res.json().await.map_err(|e| format!("Google Gemini 응답 파싱 실패: {e}"))?;
            json["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .map(String::from)
                .ok_or_else(|| format!("Google Gemini 응답 구조 오류: {json}"))
        }
        other => Err(format!(
            "지원하지 않는 provider: '{other}'. 'openai', 'anthropic' 또는 'google'을 사용하세요."
        )),
    }
}
