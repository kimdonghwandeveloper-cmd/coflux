use crate::db_core::DB_CONN;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserProfile {
    pub id: String,
    pub email: Option<String>,
    pub tier: String,
    pub stripe_customer_id: Option<String>,
    pub created_at: Option<String>,
}

#[tauri::command]
pub fn coflux_get_user_profile() -> Result<Option<UserProfile>, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;

    let mut stmt = conn
        .prepare("SELECT id, email, tier, stripe_customer_id, created_at FROM users LIMIT 1")
        .map_err(|e| e.to_string())?;

    let user = stmt.query_row([], |row| {
        Ok(UserProfile {
            id: row.get(0)?,
            email: row.get(1)?,
            tier: row.get(2)?,
            stripe_customer_id: row.get(3)?,
            created_at: row.get(4)?,
        })
    });

    match user {
        Ok(u) => Ok(Some(u)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ─── Stripe API 연동 ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn coflux_create_checkout_session(email: Option<String>) -> Result<String, String> {
    let secret_key = std::env::var("STRIPE_SECRET_KEY")
        .map_err(|_| "STRIPE_SECRET_KEY 환경 변수가 설정되지 않았습니다.")?;
    let price_id = std::env::var("STRIPE_PRICE_ID")
        .map_err(|_| "STRIPE_PRICE_ID 환경 변수가 설정되지 않았습니다.")?;

    let client = reqwest::Client::new();
    let mut params = vec![
        ("mode", "subscription"),
        ("success_url", "https://coflux.ai/success"), // 임시 URL
        ("cancel_url", "https://coflux.ai/cancel"),
        ("line_items[0][price]", &price_id),
        ("line_items[0][quantity]", "1"),
    ];

    if let Some(e) = &email {
        params.push(("customer_email", e));
    }

    let res = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .basic_auth(&secret_key, Some(""))
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(url) = json["url"].as_str() {
        Ok(url.to_string())
    } else {
        Err(format!(
            "Stripe 에러: {}",
            json["error"]["message"]
                .as_str()
                .unwrap_or("알 수 없는 오류")
        ))
    }
}

#[tauri::command]
pub async fn coflux_open_billing_portal(customer_id: String) -> Result<String, String> {
    let secret_key = std::env::var("STRIPE_SECRET_KEY")
        .map_err(|_| "STRIPE_SECRET_KEY 환경 변수가 설정되지 않았습니다.")?;

    let client = reqwest::Client::new();
    let params = [
        ("customer", customer_id.as_str()),
        ("return_url", "https://coflux.ai/settings"),
    ];

    let res = client
        .post("https://api.stripe.com/v1/billing_portal/sessions")
        .basic_auth(&secret_key, Some(""))
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(url) = json["url"].as_str() {
        Ok(url.to_string())
    } else {
        Err(format!(
            "Stripe 에러: {}",
            json["error"]["message"]
                .as_str()
                .unwrap_or("알 수 없는 오류")
        ))
    }
}

#[tauri::command]
pub fn coflux_sync_user_profile(user: UserProfile) -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;

    conn.execute(
        "INSERT OR REPLACE INTO users (id, email, tier, stripe_customer_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            user.id,
            user.email,
            user.tier,
            user.stripe_customer_id,
            user.created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn coflux_logout_local() -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB 미초기화")?;

    conn.execute("DELETE FROM users", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}
