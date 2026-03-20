mod ai_channel;
mod api_keys;
mod clipboard_sync;
mod db_core;
mod embeddings;
mod os_hooks;
mod web_search;
mod user;
mod rag;
mod script_storage;
mod security;
mod theme_store;
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
    dotenvy::dotenv().ok(); // .env 파일 로드

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::init())
        .plugin(tauri_plugin_process::init())
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
            if let Err(e) = api_keys::init_api_key_table() {
                eprintln!("Failed to init api_keys table: {}", e);
            }
            if let Err(e) = theme_store::init_theme_table() {
                eprintln!("Failed to init workspace_themes table: {}", e);
            }
            if let Err(e) = embeddings::init_embeddings_table() {
                eprintln!("Failed to init embeddings table: {}", e);
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
            db_core::coflux_add_manual_link,
            db_core::coflux_remove_manual_link,
            db_core::coflux_get_setting,
            db_core::coflux_set_setting,
            workflows::get_workflows,
            workflows::save_workflow,
            workflows::delete_workflow,
            workflows::log_workflow_execution,
            workflows::get_workflow_logs,
            webrtc_core::list_peers,
            webrtc_core::close_connection,
            script_storage::get_user_scripts,
            script_storage::save_user_script,
            script_storage::delete_user_script,
            script_storage::script_storage_get,
            script_storage::script_storage_set,
            script_storage::script_storage_delete,
            api_keys::coflux_register_api_key,
            api_keys::coflux_set_preferred_model,
            api_keys::coflux_get_provider_config,
            api_keys::coflux_has_api_key,
            api_keys::coflux_delete_api_key,
            api_keys::coflux_external_api_call,
            theme_store::get_workspace_theme,
            theme_store::save_workspace_theme,
            embeddings::coflux_index_page,
            embeddings::coflux_update_block_embedding,
            embeddings::coflux_delete_block_embeddings,
            embeddings::coflux_update_wiki_links,
            embeddings::coflux_get_all_page_embeddings,
            embeddings::coflux_get_knowledge_activity,
            embeddings::coflux_search_similar,
            embeddings::coflux_find_related_pages,
            embeddings::coflux_get_index_count,
            embeddings::coflux_get_backlinks,
            embeddings::coflux_get_outlinks,
            embeddings::coflux_get_all_links,
            rag::coflux_rag_query,
            web_search::coflux_web_search,
            user::coflux_get_user_profile,
            user::coflux_sync_user_profile,
            user::coflux_logout_local,
            user::coflux_create_checkout_session,
            user::coflux_open_billing_portal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
