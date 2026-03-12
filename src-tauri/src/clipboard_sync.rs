use arboard::Clipboard;
use lazy_static::lazy_static;
use std::sync::Mutex;

lazy_static! {
    static ref CLIPBOARD: Mutex<Option<Clipboard>> = Mutex::new(Clipboard::new().ok());
}

pub fn write_sdp(sdp: &str) -> Result<(), String> {
    let mut cb_lock = CLIPBOARD.lock().map_err(|e| e.to_string())?;
    if let Some(cb) = cb_lock.as_mut() {
        cb.set_text(sdp).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Clipboard not available".to_string())
    }
}

pub fn read_sdp() -> Result<String, String> {
    let mut cb_lock = CLIPBOARD.lock().map_err(|e| e.to_string())?;
    if let Some(cb) = cb_lock.as_mut() {
        cb.get_text().map_err(|e| e.to_string())
    } else {
        Err("Clipboard not available".to_string())
    }
}
