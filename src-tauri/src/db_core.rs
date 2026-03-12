use lazy_static::lazy_static;
use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageData {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub updated_at: String,
    pub cover_image: Option<String>,
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

    // Create a table for Pages
    conn.execute(
        "CREATE TABLE IF NOT EXISTS pages (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            icon TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            cover_image TEXT
        )",
        [],
    )?;

    // Attempt to run a lightweight migration to add the column for older SQLite DBs
    let _ = conn.execute("ALTER TABLE pages ADD COLUMN cover_image TEXT", []);

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

    *DB_CONN.lock().unwrap() = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn get_pages() -> Result<Vec<PageData>, String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn
            .prepare("SELECT id, title, icon, updated_at, cover_image FROM pages")
            .map_err(|e| e.to_string())?;
        let page_iter = stmt
            .query_map([], |row| {
                Ok(PageData {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    icon: row.get(2)?,
                    updated_at: row.get(3)?,
                    cover_image: row.get(4).unwrap_or(None),
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
            "INSERT INTO pages (id, title, icon, updated_at, cover_image) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, icon=excluded.icon, updated_at=excluded.updated_at, cover_image=excluded.cover_image",
            params![page.id, page.title, page.icon, page.updated_at, page.cover_image]
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn delete_page(page_id: String) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute("DELETE FROM pages WHERE id = ?1", params![&page_id])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM yjs_updates WHERE page_id = ?1",
            params![&page_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

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
