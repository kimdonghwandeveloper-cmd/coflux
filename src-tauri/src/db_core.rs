use rusqlite::{Connection, Result};
use std::sync::Mutex;
use lazy_static::lazy_static;

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
            update_blob BLOB NOT NULL
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
pub fn save_yjs_update(update_blob: Vec<u8>) -> Result<(), String> {
    if let Some(conn) = DB_CONN.lock().unwrap().as_ref() {
        conn.execute("INSERT INTO yjs_updates (update_blob) VALUES (?1)", rusqlite::params![update_blob])
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Database not initialized".into())
    }
}
