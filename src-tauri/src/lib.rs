mod clipboard_sync;
mod os_hooks;
mod webrtc_core;
mod db_core;
mod security;

#[tauri::command]
async fn generate_offer(app_handle: tauri::AppHandle, state: tauri::State<'_, webrtc_core::WebRtcState>) -> Result<String, String> {
    webrtc_core::generate_offer(app_handle, state).await
}

#[tauri::command]
async fn accept_offer(app_handle: tauri::AppHandle, state: tauri::State<'_, webrtc_core::WebRtcState>, offer_sdp: String) -> Result<String, String> {
    webrtc_core::accept_offer(app_handle, state, offer_sdp).await
}

#[tauri::command]
async fn accept_answer(state: tauri::State<'_, webrtc_core::WebRtcState>, answer_sdp: String) -> Result<(), String> {
    webrtc_core::accept_answer(state, answer_sdp).await
}

#[tauri::command]
fn read_clipboard_sdp() -> Result<String, String> {
    clipboard_sync::read_sdp()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(webrtc_core::WebRtcState::new())
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            os_hooks::start_os_listener();
            if let Err(e) = db_core::init_db() {
                eprintln!("Failed to init SQLite: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            generate_offer,
            accept_offer,
            accept_answer,
            read_clipboard_sdp,
            webrtc_core::send_message,
            os_hooks::get_user_status,
            db_core::save_yjs_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
