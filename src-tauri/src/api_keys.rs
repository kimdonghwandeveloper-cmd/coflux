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
            nonce      BLOB NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
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

// ─── Tauri 커맨드 ─────────────────────────────────────────────────────────────

/// API 키를 AES-256-GCM으로 암호화해 SQLite에 저장합니다.
/// provider: "openai" | "anthropic"
#[tauri::command]
pub fn coflux_register_api_key(
    app: tauri::AppHandle,
    provider: String,
    api_key: String,
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
        "INSERT OR REPLACE INTO api_keys (provider, ciphertext, nonce) VALUES (?1, ?2, ?3)",
        rusqlite::params![provider, ciphertext, nonce.as_slice()],
    )
    .map_err(|e| e.to_string())?;

    eprintln!("[BYOK] API 키 등록: provider={provider}");
    Ok(())
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
/// API 키는 Rust 레이어에서만 복호화되며 TypeScript에 노출되지 않습니다.
/// provider: "openai" | "anthropic"
#[tauri::command]
pub async fn coflux_external_api_call(
    app: tauri::AppHandle,
    provider: String,
    prompt: String,
) -> Result<String, String> {
    let api_key = decrypt_api_key(&app, &provider)?;
    let client = reqwest::Client::new();

    match provider.as_str() {
        "openai" => {
            let body = serde_json::json!({
                "model": "gpt-4o-mini",
                "messages": [{ "role": "user", "content": prompt }],
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
            let body = serde_json::json!({
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
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
        other => Err(format!(
            "지원하지 않는 provider: '{other}'. 'openai' 또는 'anthropic'을 사용하세요."
        )),
    }
}
