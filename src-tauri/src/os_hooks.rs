use lazy_static::lazy_static;
use rdev::{listen, Event};
use std::sync::Mutex;
use std::thread;
use std::time::Instant;
use tauri::Emitter;

lazy_static! {
    // Thread-safe generic instant to track when the user last moved mouse/keyboard
    static ref LAST_ACTIVITY: Mutex<Instant> = Mutex::new(Instant::now());
}

pub fn start_os_listener(app_handle: tauri::AppHandle) {
    thread::spawn(|| {
        println!("Starting global OS event listener...");
        // This blocks the spawned thread and listens for all OS events
        if let Err(error) = listen(callback) {
            println!("rdev listener error: {:?}", error);
        }
    });

    // Emit "user-status-changed" event whenever Active/Away transitions occur.
    // Polled every 2s to avoid busy-looping; threshold matches get_user_status (10s).
    thread::spawn(move || {
        let mut last_emitted = String::new();
        loop {
            thread::sleep(std::time::Duration::from_secs(2));
            let current = if let Ok(last) = LAST_ACTIVITY.lock() {
                if last.elapsed().as_secs() > 10 { "Away" } else { "Active" }
            } else {
                continue;
            };
            if current != last_emitted {
                last_emitted = current.to_string();
                let _ = app_handle.emit("user-status-changed", current);
            }
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
