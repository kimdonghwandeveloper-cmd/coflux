use lazy_static::lazy_static;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceData {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageData {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub updated_at: String,
    pub cover_image: Option<String>,
    pub is_favorite: Option<bool>,
    pub workspace_id: Option<String>,
    pub parent_id: Option<String>,
    pub is_deleted: Option<bool>,
    pub sort_order: Option<i64>,
}

lazy_static! {
    pub static ref DB_CONN: Mutex<Option<Connection>> = Mutex::new(None);
}

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<()> {
    println!("Initializing SQLite database (Zero-cost Persistence)...");

    let mut db_path = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&db_path).unwrap();
    db_path.push("coflux_p2p.db");

    let conn = Connection::open(db_path)?;

    // Create a table for CRDT Yjs updates
    conn.execute(
        "CREATE TABLE IF NOT EXISTS yjs_updates (
            id INTEGER PRIMARY KEY,
            page_id TEXT NOT NULL,
            update_blob BLOB NOT NULL
        )",
        [],
    )?;

    // Create workspaces table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    // Create a table for Pages
    conn.execute(
        "CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            icon TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            cover_image TEXT,
            is_favorite BOOLEAN,
            workspace_id TEXT,
            parent_id TEXT,
            is_deleted BOOLEAN DEFAULT 0,
            sort_order INTEGER DEFAULT 0
        )",
        [],
    )?;

    // Migrations for older DBs
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN cover_image TEXT", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN is_favorite BOOLEAN", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN workspace_id TEXT", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN parent_id TEXT", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN is_deleted BOOLEAN DEFAULT 0", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN sort_order INTEGER DEFAULT 0", []);
    // Create a table for inline assets (images, files)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS page_assets (
            id TEXT PRIMARY KEY,
            page_id TEXT NOT NULL,
            data TEXT NOT NULL,
            mime_type TEXT NOT NULL
        )",
        [],
    )?;

    // Create a table for AI routing logs
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ai_logs (
            id INTEGER PRIMARY KEY,
            prompt TEXT NOT NULL,
            response TEXT NOT NULL,
            router_type TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Create a table for global settings
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    // Seed default settings
    let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('ai_provider', 'openai')", []);
    let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('embedding_provider', 'openai')", []);
    let _ = conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('ollama_base_url', 'http://localhost:11434')", []);

    // Create a table for custom manual links created in Knowledge Map
    conn.execute(
        "CREATE TABLE IF NOT EXISTS manual_links (
            source_page_id TEXT NOT NULL,
            target_page_id TEXT NOT NULL,
            PRIMARY KEY (source_page_id, target_page_id)
        )",
        [],
    )?;

    // Seed a default workspace if none exists
    let ws_count: i64 = conn.query_row("SELECT COUNT(*) FROM workspaces", [], |row| row.get(0))?;
    if ws_count == 0 {
        conn.execute(
            "INSERT INTO workspaces (id, name, icon, created_at) VALUES (?1, ?2, ?3, ?4)",
            params!["default", "My Workspace", "M", chrono::Local::now().format("%Y-%m-%d").to_string()],
        )?;
        // Assign existing orphan pages to the default workspace
        let _ = conn.execute("UPDATE pages SET workspace_id = 'default' WHERE workspace_id IS NULL", []);
    }

    *DB_CONN.lock().unwrap() = Some(conn);
    Ok(())
}

// ── Workspace CRUD ──────────────────────────────────────────

#[tauri::command]
pub fn get_workspaces() -> crate::error::AppResult<Vec<WorkspaceData>> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT id, name, icon, created_at FROM workspaces ORDER BY created_at ASC")
            ?;
        let iter = stmt
            .query_map([], |row| {
                Ok(WorkspaceData {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            ?;
        let mut result = Vec::new();
        for w in iter.flatten() { result.push(w); }
        Ok(result)
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn save_workspace(workspace: WorkspaceData) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT INTO workspaces (id, name, icon, created_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon",
            params![workspace.id, workspace.name, workspace.icon, workspace.created_at],
        )?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn delete_workspace(workspace_id: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        // Delete all pages belonging to this workspace
        conn.execute("DELETE FROM yjs_updates WHERE page_id IN (SELECT id FROM pages WHERE workspace_id = ?1)", params![&workspace_id])
            ?;
        conn.execute("DELETE FROM pages WHERE workspace_id = ?1", params![&workspace_id])
            ?;
        conn.execute("DELETE FROM workspaces WHERE id = ?1", params![&workspace_id])
            ?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

// ── Page CRUD ───────────────────────────────────────────────

#[tauri::command]
pub fn get_pages() -> crate::error::AppResult<Vec<PageData>> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT id, title, icon, updated_at, cover_image, is_favorite, workspace_id, parent_id, is_deleted, sort_order FROM pages ORDER BY sort_order ASC")
            ?;
        let page_iter = stmt
            .query_map([], |row| {
                Ok(PageData {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    icon: row.get(2)?,
                    updated_at: row.get(3)?,
                    cover_image: row.get(4).unwrap_or(None),
                    is_favorite: row.get(5).unwrap_or(None),
                    workspace_id: row.get(6).unwrap_or(None),
                    parent_id: row.get(7).unwrap_or(None),
                    is_deleted: row.get(8).unwrap_or(Some(false)),
                    sort_order: row.get(9).unwrap_or(Some(0)),
                })
            })
            ?;

        let mut pages = Vec::new();
        for p in page_iter.flatten() {
            pages.push(p);
        }
        Ok(pages)
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn save_page(page: PageData) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT INTO pages (id, title, icon, updated_at, cover_image, is_favorite, workspace_id, parent_id, is_deleted, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, icon=excluded.icon, updated_at=excluded.updated_at, cover_image=excluded.cover_image, is_favorite=excluded.is_favorite, workspace_id=excluded.workspace_id, parent_id=excluded.parent_id, is_deleted=excluded.is_deleted, sort_order=excluded.sort_order",
            params![page.id, page.title, page.icon, page.updated_at, page.cover_image, page.is_favorite, page.workspace_id, page.parent_id, page.is_deleted, page.sort_order]
        )?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn delete_page(page_id: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        // Soft delete: set is_deleted = true for page and all children
        let mut ids = vec![page_id.clone()];
        let mut i = 0;
        while i < ids.len() {
            let cid = ids[i].clone();
            let mut stmt = conn.prepare("SELECT id FROM pages WHERE parent_id = ?1")
                ?;
            let children = stmt.query_map(params![&cid], |row| row.get::<_, String>(0))
                ?;
            for id in children.flatten() { ids.push(id); }
            i += 1;
        }
        for id in &ids {
            conn.execute("UPDATE pages SET is_deleted = 1 WHERE id = ?1", params![id])
                ?;
        }
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn restore_page(page_id: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut ids = vec![page_id.clone()];
        let mut i = 0;
        while i < ids.len() {
            let cid = ids[i].clone();
            let mut stmt = conn.prepare("SELECT id FROM pages WHERE parent_id = ?1")
                ?;
            let children = stmt.query_map(params![&cid], |row| row.get::<_, String>(0))
                ?;
            for id in children.flatten() { ids.push(id); }
            i += 1;
        }
        for id in &ids {
            conn.execute("UPDATE pages SET is_deleted = 0 WHERE id = ?1", params![id])
                ?;
        }
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn permanently_delete_page(page_id: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut ids = vec![page_id.clone()];
        let mut i = 0;
        while i < ids.len() {
            let cid = ids[i].clone();
            let mut stmt = conn.prepare("SELECT id FROM pages WHERE parent_id = ?1")
                ?;
            let children = stmt.query_map(params![&cid], |row| row.get::<_, String>(0))
                ?;
            for id in children.flatten() { ids.push(id); }
            i += 1;
        }
        for id in &ids {
            conn.execute("DELETE FROM yjs_updates WHERE page_id = ?1", params![id])?;
            conn.execute("DELETE FROM pages WHERE id = ?1", params![id])?;
        }
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

// ── Yjs CRDT Persistence ────────────────────────────────────

#[tauri::command]
pub fn save_yjs_update(page_id: String, update_blob: Vec<u8>) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT INTO yjs_updates (page_id, update_blob) VALUES (?1, ?2)",
            params![page_id, update_blob],
        )
        ?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn get_yjs_updates(page_id: String) -> crate::error::AppResult<Vec<Vec<u8>>> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT update_blob FROM yjs_updates WHERE page_id = ?1 ORDER BY id ASC")
            ?;
        let update_iter = stmt
            .query_map(params![page_id], |row| row.get(0))
            ?;

        let mut updates = Vec::new();
        for u in update_iter.flatten() {
            updates.push(u);
        }
        Ok(updates)
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

// ── Inline Asset Persistence ────────────────────────────────

#[tauri::command]
pub fn save_asset(id: String, page_id: String, data: String, mime_type: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT OR REPLACE INTO page_assets (id, page_id, data, mime_type) VALUES (?1, ?2, ?3, ?4)",
            params![id, page_id, data, mime_type],
        )?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn get_asset(id: String) -> crate::error::AppResult<String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let data: String = conn.query_row(
            "SELECT data FROM page_assets WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        Ok(data)
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}
// ── Manual Links CRUD ──────────────────────────────────────────

#[tauri::command]
pub fn coflux_add_manual_link(source_id: String, target_id: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT OR IGNORE INTO manual_links (source_page_id, target_page_id) VALUES (?1, ?2)",
            params![source_id, target_id],
        )?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn coflux_remove_manual_link(source_id: String, target_id: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "DELETE FROM manual_links WHERE source_page_id = ?1 AND target_page_id = ?2",
            params![source_id, target_id],
        )?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}
#[tauri::command]
pub fn coflux_get_setting(key: String) -> crate::error::AppResult<String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let value: String = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )?;
        Ok(value)
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}

#[tauri::command]
pub fn coflux_set_setting(key: String, value: String) -> crate::error::AppResult<()> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    } else {
        Err(crate::error::AppError::Internal("Database not initialized".into()))
    }
}
