mod clipboard_sync;
mod webrtc_core;

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
        .invoke_handler(tauri::generate_handler![
            generate_offer,
            accept_offer,
            accept_answer,
            read_clipboard_sdp,
            webrtc_core::send_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
