use crate::db_core::DB_CONN;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct WorkspaceThemeRow {
    pub theme_id: String,
    pub custom_theme_json: Option<String>,
}

pub fn init_theme_table() -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspace_themes (
            workspace_id TEXT PRIMARY KEY,
            theme_id     TEXT NOT NULL DEFAULT 'notion-light',
            custom_json  TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_workspace_theme(workspace_id: String) -> Result<WorkspaceThemeRow, String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    let result = conn.query_row(
        "SELECT theme_id, custom_json FROM workspace_themes WHERE workspace_id = ?1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceThemeRow {
                theme_id: row.get(0)?,
                custom_theme_json: row.get(1)?,
            })
        },
    );
    match result {
        Ok(row) => Ok(row),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(WorkspaceThemeRow {
            theme_id: "notion-light".to_string(),
            custom_theme_json: None,
        }),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_workspace_theme(
    workspace_id: String,
    theme_id: String,
    custom_theme_json: Option<String>,
) -> Result<(), String> {
    let guard = DB_CONN.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("DB not initialized")?;
    conn.execute(
        "INSERT INTO workspace_themes (workspace_id, theme_id, custom_json)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(workspace_id) DO UPDATE SET theme_id = excluded.theme_id, custom_json = excluded.custom_json",
        params![workspace_id, theme_id, custom_theme_json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
