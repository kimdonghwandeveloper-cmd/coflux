use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::Mutex;
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

pub struct WebRtcState {
    pub pc: Arc<Mutex<Option<Arc<RTCPeerConnection>>>>,
    pub dc: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
    /// AI P2P 채널 (모바일 AI 요청/응답 전용)
    pub ai_dc: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
}

impl Default for WebRtcState {
    fn default() -> Self {
        Self::new()
    }
}

impl WebRtcState {
    pub fn new() -> Self {
        Self {
            pc: Arc::new(Mutex::new(None)),
            dc: Arc::new(Mutex::new(None)),
            ai_dc: Arc::new(Mutex::new(None)),
        }
    }
}

fn create_api() -> webrtc::api::API {
    APIBuilder::new().build()
}

fn get_config() -> RTCConfiguration {
    RTCConfiguration {
        ice_servers: vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }],
        ..Default::default()
    }
}

pub async fn generate_offer(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, WebRtcState>,
) -> Result<String, String> {
    let api = create_api();
    let pc = Arc::new(
        api.new_peer_connection(get_config())
            .await
            .map_err(|e| e.to_string())?,
    );

    // Create DataChannels
    let dc = pc
        .create_data_channel("coflux_data", None)
        .await
        .map_err(|e| e.to_string())?;

    let dc_clone = dc.clone();
    let app_handle_clone = app_handle.clone();
    dc.on_open(Box::new(move || {
        println!("Data channel open!");
        let _ = app_handle_clone.emit("webrtc-open", ());
        Box::pin(async {})
    }));

    let app_handle_clone2 = app_handle.clone();
    dc.on_message(Box::new(move |msg| {
        let text = String::from_utf8(msg.data.to_vec()).unwrap_or_default();
        emit_scan_result(&app_handle_clone2, text);
        Box::pin(async {})
    }));

    // AI DataChannel (모바일 AI 요청/응답 전용)
    let ai_dc = pc
        .create_data_channel("ai", None)
        .await
        .map_err(|e| e.to_string())?;

    let ai_dc_clone = ai_dc.clone();
    let ah_ai = app_handle.clone();
    ai_dc.on_message(Box::new(move |msg| {
        let dc_ref = ai_dc_clone.clone();
        let app_ref = ah_ai.clone();
        tokio::spawn(async move {
            crate::ai_channel::handle_ai_channel_message(app_ref, dc_ref, msg).await;
        });
        Box::pin(async {})
    }));

    let ai_dc_state = ai_dc.clone();

    let mut gather_complete = pc.gathering_complete_promise().await;

    let offer = pc.create_offer(None).await.map_err(|e| e.to_string())?;
    pc.set_local_description(offer)
        .await
        .map_err(|e| e.to_string())?;

    // Wait for ICE gathering
    let _ = gather_complete.recv().await;

    let local_desc = pc.local_description().await.ok_or("No local desc")?;
    let sdp_json = serde_json::to_string(&local_desc).map_err(|e| e.to_string())?;

    *state.pc.lock().await = Some(pc);
    *state.dc.lock().await = Some(dc_clone);
    *state.ai_dc.lock().await = Some(ai_dc_state);

    crate::clipboard_sync::write_sdp(&sdp_json)?;

    Ok(sdp_json)
}

pub async fn accept_offer(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, WebRtcState>,
    offer_sdp: String,
) -> Result<String, String> {
    let api = create_api();
    let pc = Arc::new(
        api.new_peer_connection(get_config())
            .await
            .map_err(|e| e.to_string())?,
    );

    let app_handle_clone = app_handle.clone();
    pc.on_data_channel(Box::new(move |dc| {
        let label = dc.label().to_string();
        let ah = app_handle_clone.clone();

        if label == "ai" {
            // AI 채널: 모바일 AI 요청 처리
            let dc_ai = dc.clone();
            dc.on_message(Box::new(move |msg| {
                let dc_ref = dc_ai.clone();
                let app_ref = ah.clone();
                tokio::spawn(async move {
                    crate::ai_channel::handle_ai_channel_message(app_ref, dc_ref, msg).await;
                });
                Box::pin(async {})
            }));
        } else {
            // coflux_data 채널: 기존 보안 스캔 경로
            let ah_open = ah.clone();
            dc.on_open(Box::new(move || {
                let _ = ah_open.emit("webrtc-open", ());
                Box::pin(async {})
            }));

            let ah_msg = ah.clone();
            dc.on_message(Box::new(move |msg| {
                let text = String::from_utf8(msg.data.to_vec()).unwrap_or_default();
                emit_scan_result(&ah_msg, text);
                Box::pin(async {})
            }));
        }
        Box::pin(async {})
    }));

    let desc: RTCSessionDescription =
        serde_json::from_str(&offer_sdp).map_err(|e| e.to_string())?;
    pc.set_remote_description(desc)
        .await
        .map_err(|e| e.to_string())?;

    let mut gather_complete = pc.gathering_complete_promise().await;
    let answer = pc.create_answer(None).await.map_err(|e| e.to_string())?;
    pc.set_local_description(answer)
        .await
        .map_err(|e| e.to_string())?;

    let _ = gather_complete.recv().await;

    let local_desc = pc.local_description().await.ok_or("No local desc")?;
    let sdp_json = serde_json::to_string(&local_desc).map_err(|e| e.to_string())?;

    *state.pc.lock().await = Some(pc);

    crate::clipboard_sync::write_sdp(&sdp_json)?;

    Ok(sdp_json)
}

pub async fn accept_answer(
    state: tauri::State<'_, WebRtcState>,
    answer_sdp: String,
) -> Result<(), String> {
    let pc_lock = state.pc.lock().await;
    let pc = pc_lock.as_ref().ok_or("Peer connection not found")?;

    let desc: RTCSessionDescription =
        serde_json::from_str(&answer_sdp).map_err(|e| e.to_string())?;
    pc.set_remote_description(desc)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 수신 메시지를 보안 스캔(Layer 1 룰베이스) 후 이벤트를 발행합니다.
/// - SAFE    → `webrtc-msg`
/// - BLOCKED → `webrtc-msg-blocked`
fn emit_scan_result(app: &tauri::AppHandle, payload: String) {
    use crate::security::ScanDecision;
    use serde::Serialize;

    #[derive(Serialize, Clone)]
    struct BlockedPayload {
        explanation: String,
    }

    match crate::security::scan_ingress_payload(payload) {
        ScanDecision::Safe(text) => {
            let _ = app.emit("webrtc-msg", text);
        }
        ScanDecision::Blocked { explanation } => {
            eprintln!(
                "[Security] BLOCKED: {}",
                &explanation[..explanation.len().min(120)]
            );
            let _ = app.emit("webrtc-msg-blocked", BlockedPayload { explanation });
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct PeerInfo {
    pub id: String,
    pub status: String,
}

/// Returns connected peers. Currently WebRTC supports a single peer connection,
/// so this returns at most one entry based on whether a DataChannel is open.
#[tauri::command]
pub async fn list_peers(state: tauri::State<'_, WebRtcState>) -> Result<Vec<PeerInfo>, String> {
    let dc_lock = state.dc.lock().await;
    if dc_lock.is_some() {
        Ok(vec![PeerInfo {
            id: "peer_0".to_string(),
            status: "connected".to_string(),
        }])
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
pub async fn send_message(state: tauri::State<'_, WebRtcState>, msg: String) -> Result<(), String> {
    let dc_lock = state.dc.lock().await;
    if let Some(dc) = dc_lock.as_ref() {
        dc.send_text(msg).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("DataChannel not ready".into())
    }
}

#[tauri::command]
pub async fn close_connection(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, WebRtcState>,
) -> Result<(), String> {
    let mut dc_lock = state.dc.lock().await;
    if let Some(dc) = dc_lock.take() {
        let _ = dc.close().await;
    }

    let mut ai_dc_lock = state.ai_dc.lock().await;
    if let Some(dc) = ai_dc_lock.take() {
        let _ = dc.close().await;
    }

    let mut pc_lock = state.pc.lock().await;
    if let Some(pc) = pc_lock.take() {
        let _ = pc.close().await;
    }

    let _ = app_handle.emit("webrtc-state", "Disconnected");
    Ok(())
}
