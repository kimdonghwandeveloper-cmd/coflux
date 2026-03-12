use rusqlite::{Connection, Result, params};
use std::sync::Mutex;
use lazy_static::lazy_static;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageData {
    pub id: String,
    pub title: String,
    pub icon: String,
    pub updated_at: String,
}

lazy_static! {
    pub static ref DB_CONN: Mutex<Option<Connection>> = Mutex::new(None);
}

pub fn init_db() -> Result<()> {
    println!("Initializing SQLite database (Zero-cost Persistence)...");
    let conn = Connection::open("coflux_p2p.db")?;
    
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
            updated_at TEXT NOT NULL
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

    *DB_CONN.lock().unwrap() = Some(conn);
    Ok(())
}

#[tauri::command]
pub fn get_pages() -> Result<Vec<PageData>, String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn.prepare("SELECT id, title, icon, updated_at FROM pages").map_err(|e| e.to_string())?;
        let page_iter = stmt.query_map([], |row| {
            Ok(PageData {
                id: row.get(0)?,
                title: row.get(1)?,
                icon: row.get(2)?,
                updated_at: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;

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
            "INSERT INTO pages (id, title, icon, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, icon=excluded.icon, updated_at=excluded.updated_at",
            params![page.id, page.title, page.icon, page.updated_at]
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn delete_page(page_id: String) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute("DELETE FROM pages WHERE id = ?1", params![&page_id]).map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM yjs_updates WHERE page_id = ?1", params![&page_id]).map_err(|e| e.to_string())?;
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
            params![page_id, update_blob]
        ).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}

#[tauri::command]
pub fn get_yjs_updates(page_id: String) -> Result<Vec<Vec<u8>>, String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        let mut stmt = conn.prepare("SELECT update_blob FROM yjs_updates WHERE page_id = ?1 ORDER BY id ASC")
            .map_err(|e| e.to_string())?;
        let update_iter = stmt.query_map(params![page_id], |row| row.get(0)).map_err(|e| e.to_string())?;
        
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
