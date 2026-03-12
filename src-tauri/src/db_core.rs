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
            parent_id TEXT
        )",
        [],
    )?;

    // Migrations for older DBs
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN cover_image TEXT", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN is_favorite BOOLEAN", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN workspace_id TEXT", []);
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN parent_id TEXT", []);

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
pub fn get_workspaces() -> Result<Vec<WorkspaceData>, String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT id, name, icon, created_at FROM workspaces ORDER BY created_at ASC")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok(WorkspaceData {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut result = Vec::new();
        for ws in iter {
            if let Ok(w) = ws { result.push(w); }
        }
        Ok(result)
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn save_workspace(workspace: WorkspaceData) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT INTO workspaces (id, name, icon, created_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, icon=excluded.icon",
            params![workspace.id, workspace.name, workspace.icon, workspace.created_at],
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn delete_workspace(workspace_id: String) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        // Delete all pages belonging to this workspace
        conn.execute("DELETE FROM yjs_updates WHERE page_id IN (SELECT id FROM pages WHERE workspace_id = ?1)", params![&workspace_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM pages WHERE workspace_id = ?1", params![&workspace_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM workspaces WHERE id = ?1", params![&workspace_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

// ── Page CRUD ───────────────────────────────────────────────

#[tauri::command]
pub fn get_pages() -> Result<Vec<PageData>, String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT id, title, icon, updated_at, cover_image, is_favorite, workspace_id, parent_id FROM pages")
            .map_err(|e| e.to_string())?;
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
                })
            })
            .map_err(|e| e.to_string())?;

        let mut pages = Vec::new();
        for page in page_iter {
            if let Ok(p) = page {
                pages.push(p);
            }
        }
        Ok(pages)
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn save_page(page: PageData) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT INTO pages (id, title, icon, updated_at, cover_image, is_favorite, workspace_id, parent_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, icon=excluded.icon, updated_at=excluded.updated_at, cover_image=excluded.cover_image, is_favorite=excluded.is_favorite, workspace_id=excluded.workspace_id, parent_id=excluded.parent_id",
            params![page.id, page.title, page.icon, page.updated_at, page.cover_image, page.is_favorite, page.workspace_id, page.parent_id]
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn delete_page(page_id: String) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        // Cascade: recursively collect all child page IDs
        let mut ids_to_delete = vec![page_id.clone()];
        let mut i = 0;
        while i < ids_to_delete.len() {
            let current_id = ids_to_delete[i].clone();
            let mut stmt = conn.prepare("SELECT id FROM pages WHERE parent_id = ?1")
                .map_err(|e| e.to_string())?;
            let child_iter = stmt.query_map(params![&current_id], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            for child in child_iter {
                if let Ok(cid) = child { ids_to_delete.push(cid); }
            }
            i += 1;
        }

        for id in &ids_to_delete {
            conn.execute("DELETE FROM yjs_updates WHERE page_id = ?1", params![id])
                .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM pages WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

// ── Yjs CRDT Persistence ────────────────────────────────────

#[tauri::command]
pub fn save_yjs_update(page_id: String, update_blob: Vec<u8>) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute(
            "INSERT INTO yjs_updates (page_id, update_blob) VALUES (?1, ?2)",
            params![page_id, update_blob],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn get_yjs_updates(page_id: String) -> Result<Vec<Vec<u8>>, String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT update_blob FROM yjs_updates WHERE page_id = ?1 ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let update_iter = stmt
            .query_map(params![page_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut updates = Vec::new();
        for update in update_iter {
            if let Ok(u) = update {
                updates.push(u);
            }
        }
        Ok(updates)
    } else {
        Err("Database not initialized".into())
    }
}
