use crate::db_core::DB_CONN;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowData {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub definition: String, // JSON-serialized workflow definition
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowLogEntry {
    pub id: Option<i64>,
    pub workflow_id: String,
    pub trigger_type: String,
    pub status: String, // "success" | "error" | "skipped"
    pub detail: Option<String>,
    pub executed_at: String,
}

pub fn init_workflow_tables() -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflows (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            definition TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS workflow_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            status TEXT NOT NULL,
            detail TEXT,
            executed_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Workflow CRUD ────────────────────────────────────────────

#[tauri::command]
pub fn get_workflows() -> Result<Vec<WorkflowData>, String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, enabled, definition, created_at, updated_at
             FROM workflows ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            let enabled: i64 = row.get(2)?;
            Ok(WorkflowData {
                id: row.get(0)?,
                name: row.get(1)?,
                enabled: enabled != 0,
                definition: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for item in iter {
        if let Ok(w) = item {
            result.push(w);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn save_workflow(workflow: WorkflowData) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT INTO workflows (id, name, enabled, definition, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           enabled=excluded.enabled,
           definition=excluded.definition,
           updated_at=excluded.updated_at",
        params![
            workflow.id,
            workflow.name,
            workflow.enabled as i64,
            workflow.definition,
            workflow.created_at,
            workflow.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_workflow(workflow_id: String) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute("DELETE FROM workflows WHERE id = ?1", params![workflow_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Workflow Execution Log ───────────────────────────────────

#[tauri::command]
pub fn log_workflow_execution(log: WorkflowLogEntry) -> Result<(), String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    conn.execute(
        "INSERT INTO workflow_logs (workflow_id, trigger_type, status, detail, executed_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            log.workflow_id,
            log.trigger_type,
            log.status,
            log.detail,
            log.executed_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_workflow_logs(workflow_id: String) -> Result<Vec<WorkflowLogEntry>, String> {
    let conn_guard = DB_CONN.lock().unwrap();
    let conn = conn_guard.as_ref().ok_or("Database not initialized")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, workflow_id, trigger_type, status, detail, executed_at
             FROM workflow_logs WHERE workflow_id = ?1
             ORDER BY id DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(params![workflow_id], |row| {
            Ok(WorkflowLogEntry {
                id: row.get(0)?,
                workflow_id: row.get(1)?,
                trigger_type: row.get(2)?,
                status: row.get(3)?,
                detail: row.get(4)?,
                executed_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for item in iter {
        if let Ok(log) = item {
            result.push(log);
        }
    }
    Ok(result)
}
