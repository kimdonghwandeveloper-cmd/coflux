/// 모바일 → 데스크탑 AI 채널 메시지 처리 (BYOK 전용)
///
/// 요청 포맷:
///   { "type": "ai_request", "channel": "ai", "payload": { "task": "...", "input": "...", "options": {} } }
///
/// 응답 포맷:
///   { "type": "ai_response", "channel": "ai", "payload": { "result": "...", "routed_to": "external/...", "error": null } }
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use webrtc::data_channel::RTCDataChannel;
use webrtc::data_channel::data_channel_message::DataChannelMessage;

// ─── 메시지 포맷 ──────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct AiChannelRequest {
    #[serde(rename = "type")]
    msg_type: String,
    #[allow(dead_code)]
    channel: String,
    payload: AiRequestPayload,
}

#[derive(Deserialize, Debug)]
struct AiRequestPayload {
    task: String,
    input: String,
    #[allow(dead_code)]
    options: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct AiChannelResponse {
    #[serde(rename = "type")]
    msg_type: String,
    channel: String,
    payload: AiResponsePayload,
}

#[derive(Serialize)]
struct AiResponsePayload {
    result: Option<String>,
    routed_to: String,
    error: Option<String>,
}

// ─── 핵심 처리 함수 ──────────────────────────────────────────────────────────

pub async fn handle_ai_channel_message(
    app: tauri::AppHandle,
    dc: Arc<RTCDataChannel>,
    msg: DataChannelMessage,
) {
    let text = match String::from_utf8(msg.data.to_vec()) {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[AI Channel] UTF-8 변환 실패: {e}");
            return;
        }
    };

    let req: AiChannelRequest = match serde_json::from_str(&text) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[AI Channel] JSON 파싱 실패: {e}");
            send_error(&dc, "JSON 파싱 실패".to_string()).await;
            return;
        }
    };

    if req.msg_type != "ai_request" {
        return;
    }

    eprintln!("[AI Channel] 요청: task={}", req.payload.task);

    let provider = pick_provider();
    let (result, routed_to) = match provider {
        Some(p) => {
            match crate::api_keys::coflux_external_api_call(
                app.clone(),
                p.clone(),
                req.payload.input.clone(),
            )
            .await
            {
                Ok(r) => (Ok(r), format!("external/{p}")),
                Err(e) => {
                    eprintln!("[AI Channel] 외부 API 실패: {e}");
                    (Err(e), format!("external/{p}"))
                }
            }
        }
        None => (
            Err("API 키가 등록되지 않았습니다. Settings에서 OpenAI 또는 Anthropic 키를 등록하세요.".to_string()),
            "none".to_string(),
        ),
    };

    let resp = match result {
        Ok(text) => AiChannelResponse {
            msg_type: "ai_response".to_string(),
            channel: "ai".to_string(),
            payload: AiResponsePayload { result: Some(text), routed_to, error: None },
        },
        Err(e) => AiChannelResponse {
            msg_type: "ai_response".to_string(),
            channel: "ai".to_string(),
            payload: AiResponsePayload { result: None, routed_to, error: Some(e) },
        },
    };

    let json = serde_json::to_string(&resp).unwrap_or_default();
    if let Err(e) = dc.send_text(json).await {
        eprintln!("[AI Channel] 응답 전송 실패: {e}");
    }
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/// openai 우선, 없으면 anthropic. 둘 다 없으면 None.
fn pick_provider() -> Option<String> {
    for provider in &["openai", "anthropic"] {
        if crate::api_keys::coflux_has_api_key(provider.to_string()).unwrap_or(false) {
            return Some(provider.to_string());
        }
    }
    None
}

async fn send_error(dc: &RTCDataChannel, error: String) {
    let resp = AiChannelResponse {
        msg_type: "ai_response".to_string(),
        channel: "ai".to_string(),
        payload: AiResponsePayload { result: None, routed_to: "none".to_string(), error: Some(error) },
    };
    let _ = dc.send_text(serde_json::to_string(&resp).unwrap_or_default()).await;
}
