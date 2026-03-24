use crate::db_core::DB_CONN;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScriptData {
    pub id: String,
    pub name: String,
    pub code: String,
    pub created_at: String,
    pub updated_at: String,
}

pub fn init_script_tables() -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_scripts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    // Key-value store isolated per script_id
    conn.execute(
        "CREATE TABLE IF NOT EXISTS script_storage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            script_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            UNIQUE(script_id, key)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── User Scripts CRUD ────────────────────────────────────────

#[tauri::command]
pub fn get_user_scripts() -> Result<Vec<ScriptData>, String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, code, created_at, updated_at
             FROM user_scripts ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(ScriptData {
                id: row.get(0)?,
                name: row.get(1)?,
                code: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for s in iter.flatten() {
        result.push(s);
    }
    Ok(result)
}

#[tauri::command]
pub fn save_user_script(script: ScriptData) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT INTO user_scripts (id, name, code, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           code=excluded.code,
           updated_at=excluded.updated_at",
        params![
            script.id,
            script.name,
            script.code,
            script.created_at,
            script.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_user_script(script_id: String) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    // Delete script and its isolated storage
    conn.execute(
        "DELETE FROM script_storage WHERE script_id = ?1",
        params![&script_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM user_scripts WHERE id = ?1",
        params![&script_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Script-Isolated Key-Value Storage ───────────────────────

#[tauri::command]
pub fn script_storage_get(script_id: String, key: String) -> Result<Option<String>, String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let result = conn.query_row(
        "SELECT value FROM script_storage WHERE script_id = ?1 AND key = ?2",
        params![script_id, key],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn script_storage_set(script_id: String, key: String, value: String) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT INTO script_storage (script_id, key, value) VALUES (?1, ?2, ?3)
         ON CONFLICT(script_id, key) DO UPDATE SET value=excluded.value",
        params![script_id, key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn script_storage_delete(script_id: String, key: String) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "DELETE FROM script_storage WHERE script_id = ?1 AND key = ?2",
        params![script_id, key],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
