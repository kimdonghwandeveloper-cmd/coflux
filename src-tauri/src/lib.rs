mod clipboard_sync;
mod db_core;
mod os_hooks;
mod script_storage;
mod security;
mod webrtc_core;
mod workflows;

#[tauri::command]
async fn generate_offer(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, webrtc_core::WebRtcState>,
) -> Result<String, String> {
    webrtc_core::generate_offer(app_handle, state).await
}

#[tauri::command]
async fn accept_offer(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, webrtc_core::WebRtcState>,
    offer_sdp: String,
) -> Result<String, String> {
    webrtc_core::accept_offer(app_handle, state, offer_sdp).await
}

#[tauri::command]
async fn accept_answer(
    state: tauri::State<'_, webrtc_core::WebRtcState>,
    answer_sdp: String,
) -> Result<(), String> {
    webrtc_core::accept_answer(state, answer_sdp).await
}

#[tauri::command]
fn read_clipboard_sdp() -> Result<String, String> {
    clipboard_sync::read_sdp()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(webrtc_core::WebRtcState::new())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            os_hooks::start_os_listener(app.handle().clone());
            if let Err(e) = db_core::init_db(app.handle()) {
                eprintln!("Failed to init SQLite: {}", e);
            }
            if let Err(e) = workflows::init_workflow_tables() {
                eprintln!("Failed to init workflow tables: {}", e);
            }
            if let Err(e) = script_storage::init_script_tables() {
                eprintln!("Failed to init script tables: {}", e);
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
            db_core::get_pages,
            db_core::save_page,
            db_core::delete_page,
            db_core::restore_page,
            db_core::permanently_delete_page,
            db_core::save_yjs_update,
            db_core::get_yjs_updates,
            db_core::get_workspaces,
            db_core::save_workspace,
            db_core::delete_workspace,
            db_core::save_asset,
            db_core::get_asset,
            workflows::get_workflows,
            workflows::save_workflow,
            workflows::delete_workflow,
            workflows::log_workflow_execution,
            workflows::get_workflow_logs,
            webrtc_core::list_peers,
            script_storage::get_user_scripts,
            script_storage::save_user_script,
            script_storage::delete_user_script,
            script_storage::script_storage_get,
            script_storage::script_storage_set,
            script_storage::script_storage_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
