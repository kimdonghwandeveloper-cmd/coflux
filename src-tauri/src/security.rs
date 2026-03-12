/// Scans incoming DataChannel payloads for malicious content before processing
pub fn scan_ingress_payload(payload: String) -> Result<String, String> {
    // 1. Filter obvious XSS / script injection attempts
    let lower_payload = payload.to_lowercase();
    if lower_payload.contains("<script>")
        || lower_payload.contains("javascript:")
        || lower_payload.contains("onerror=")
    {
        return Err("Edge Security Blocked [XSS Pattern Detected]".to_string());
    }

    // 2. Payload size isolation (e.g., limit to 500KB to prevent memory exhaustion)
    if payload.len() > 500 * 1024 {
        return Err("Edge Security Blocked [Payload > 500KB]".to_string());
    }

    Ok(payload)
}
