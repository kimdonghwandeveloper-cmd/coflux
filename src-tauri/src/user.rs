use serde::{Deserialize, Serialize};
use crate::db_core::DB_CONN;

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
