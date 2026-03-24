use crate::api_keys::decrypt_key_internal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WebSearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Deserialize)]
struct BraveSearchResponse {
    web: Option<BraveWebResults>,
}

#[derive(Deserialize)]
struct BraveWebResults {
    results: Vec<BraveResult>,
}

#[derive(Deserialize)]
struct BraveResult {
    title: String,
    url: String,
    description: Option<String>,
}

/// Brave Search API를 사용하여 웹 검색을 수행합니다.
#[tauri::command]
pub async fn coflux_web_search(
    app: tauri::AppHandle,
    query: String,
    num_results: Option<usize>,
) -> Result<Vec<WebSearchResult>, String> {
    let api_key = decrypt_key_internal(&app, "brave_search")?;
    let client = reqwest::Client::new();
    let n = num_results.unwrap_or(5);

    let res = client
        .get("https://api.search.brave.com/res/v1/web/search")
        .header("Accept", "application/json")
        .header("X-Subscription-Token", &api_key)
        .query(&[("q", &query), ("count", &n.to_string())])
        .send()
        .await
        .map_err(|e| format!("Brave Search 요청 실패: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Brave Search 오류 {status}: {text}"));
    }

    let json: BraveSearchResponse = res
        .json()
        .await
        .map_err(|e| format!("Brave Search 응답 파싱 실패: {e}"))?;

    let results = json
        .web
        .map(|w| {
            w.results
                .into_iter()
                .map(|r| WebSearchResult {
                    title: r.title,
                    url: r.url,
                    snippet: r.description.unwrap_or_default(),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(results)
}
