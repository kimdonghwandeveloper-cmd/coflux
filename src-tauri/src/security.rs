/// 보안 스캔 최종 판정
#[derive(Debug, Clone)]
pub enum ScanDecision {
    /// 허용
    Safe(String),
    /// 차단
    Blocked { explanation: String },
}

/// Layer 1: XSS 패턴 + 사이즈 필터 (동기, <1ms)
pub fn layer1_filter(payload: &str) -> Result<(), String> {
    let lower = payload.to_lowercase();
    if lower.contains("<script>") || lower.contains("javascript:") || lower.contains("onerror=") {
        return Err("Edge Security Blocked [XSS Pattern Detected]".to_string());
    }
    if payload.len() > 500 * 1024 {
        return Err("Edge Security Blocked [Payload > 500KB]".to_string());
    }
    Ok(())
}

/// 수신 페이로드 스캔 (Layer 1 룰베이스만).
/// Layer 2 AI 스캔은 제거됨 — 외부 AI가 필요한 경우 BYOK 경로 사용.
pub fn scan_ingress_payload(payload: String) -> ScanDecision {
    match layer1_filter(&payload) {
        Ok(()) => ScanDecision::Safe(payload),
        Err(reason) => ScanDecision::Blocked { explanation: reason },
    }
}
