use lazy_static::lazy_static;
use rdev::{listen, Event};
use std::sync::Mutex;
use std::time::Instant;
use std::thread;

lazy_static! {
    // Thread-safe generic instant to track when the user last moved mouse/keyboard
    static ref LAST_ACTIVITY: Mutex<Instant> = Mutex::new(Instant::now());
}

pub fn start_os_listener() {
    thread::spawn(|| {
        println!("Starting global OS event listener...");
        // This blocks the spawned thread and listens for all OS events
        if let Err(error) = listen(callback) {
            println!("rdev listener error: {:?}", error);
        }
    });
}

fn callback(_event: Event) {
    // Fast, non-blocking update of the last activity timestamp
    if let Ok(mut last) = LAST_ACTIVITY.lock() {
        *last = Instant::now();
    }
}

#[tauri::command]
pub fn get_user_status() -> Result<String, String> {
    if let Ok(last) = LAST_ACTIVITY.lock() {
        let elapsed = last.elapsed().as_secs();
        // Return 'Away' if idle for more than 10 seconds (for testing). In prod, maybe 180s.
        if elapsed > 10 {
            Ok("Away".to_string())
        } else {
            Ok("Active".to_string())
        }
    } else {
        Err("Failed to acquire lock on LAST_ACTIVITY".into())
    }
}
