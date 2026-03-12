use std::sync::Arc;
use tokio::sync::Mutex;
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use tauri::Emitter;

pub struct WebRtcState {
    pub pc: Arc<Mutex<Option<Arc<RTCPeerConnection>>>>,
    pub dc: Arc<Mutex<Option<Arc<RTCDataChannel>>>>,
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

pub async fn generate_offer(app_handle: tauri::AppHandle, state: tauri::State<'_, WebRtcState>) -> Result<String, String> {
    let api = create_api();
    let pc = Arc::new(api.new_peer_connection(get_config()).await.map_err(|e| e.to_string())?);
    
    // Create DataChannel
    let dc = pc.create_data_channel("coflux_data", None).await.map_err(|e| e.to_string())?;
    
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
        let _ = app_handle_clone2.emit("webrtc-msg", text);
        Box::pin(async {})
    }));

    let mut gather_complete = pc.gathering_complete_promise().await;
    
    let offer = pc.create_offer(None).await.map_err(|e| e.to_string())?;
    pc.set_local_description(offer).await.map_err(|e| e.to_string())?;
    
    // Wait for ICE gathering
    let _ = gather_complete.recv().await;
    
    let local_desc = pc.local_description().await.ok_or("No local desc")?;
    let sdp_json = serde_json::to_string(&local_desc).map_err(|e| e.to_string())?;
    
    *state.pc.lock().await = Some(pc);
    *state.dc.lock().await = Some(dc_clone);
    
    crate::clipboard_sync::write_sdp(&sdp_json)?;
    
    Ok(sdp_json)
}

pub async fn accept_offer(app_handle: tauri::AppHandle, state: tauri::State<'_, WebRtcState>, offer_sdp: String) -> Result<String, String> {
    let api = create_api();
    let pc = Arc::new(api.new_peer_connection(get_config()).await.map_err(|e| e.to_string())?);

    let app_handle_clone = app_handle.clone();
    pc.on_data_channel(Box::new(move |dc| {
        let ah_open = app_handle_clone.clone();
        dc.on_open(Box::new(move || {
            let _ = ah_open.emit("webrtc-open", ());
            Box::pin(async {})
        }));
        
        let ah_msg = app_handle_clone.clone();
        dc.on_message(Box::new(move |msg| {
            let text = String::from_utf8(msg.data.to_vec()).unwrap_or_default();
            let _ = ah_msg.emit("webrtc-msg", text);
            Box::pin(async {})
        }));
        Box::pin(async {})
    }));

    let desc: RTCSessionDescription = serde_json::from_str(&offer_sdp).map_err(|e| e.to_string())?;
    pc.set_remote_description(desc).await.map_err(|e| e.to_string())?;

    let mut gather_complete = pc.gathering_complete_promise().await;
    let answer = pc.create_answer(None).await.map_err(|e| e.to_string())?;
    pc.set_local_description(answer).await.map_err(|e| e.to_string())?;

    let _ = gather_complete.recv().await;

    let local_desc = pc.local_description().await.ok_or("No local desc")?;
    let sdp_json = serde_json::to_string(&local_desc).map_err(|e| e.to_string())?;

    *state.pc.lock().await = Some(pc);

    crate::clipboard_sync::write_sdp(&sdp_json)?;

    Ok(sdp_json)
}

pub async fn accept_answer(state: tauri::State<'_, WebRtcState>, answer_sdp: String) -> Result<(), String> {
    let pc_lock = state.pc.lock().await;
    let pc = pc_lock.as_ref().ok_or("Peer connection not found")?;

    let desc: RTCSessionDescription = serde_json::from_str(&answer_sdp).map_err(|e| e.to_string())?;
    pc.set_remote_description(desc).await.map_err(|e| e.to_string())?;

    Ok(())
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

