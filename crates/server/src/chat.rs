use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex;
use tracing::{info, warn};

use crate::anthropic::ChatMessage;
use crate::stats;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub glob_id: String,
    pub tick: Option<u32>,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub reply: String,
    pub usage: Option<UsageInfo>,
}

#[derive(Debug, Serialize)]
pub struct UsageInfo {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

/// Rate limit state: maps IP -> (request_count, window_start)
pub type RateLimitMap = Mutex<HashMap<IpAddr, (u32, Instant)>>;

const MAX_MESSAGES: usize = 30;
const MAX_MESSAGE_LENGTH: usize = 500;
const RATE_LIMIT_PER_MIN: u32 = 20;
const MIN_INTERVIEW_AGE: u32 = 14;

/// Extract client IP from headers (X-Forwarded-For or fallback).
fn extract_ip(headers: &HeaderMap) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse().ok())
        .unwrap_or_else(|| "127.0.0.1".parse().unwrap())
}

/// Check per-IP rate limit. Returns Err with status if exceeded.
async fn check_rate_limit(rate_limits: &RateLimitMap, ip: IpAddr) -> Result<(), (StatusCode, Json<Value>)> {
    let mut limits = rate_limits.lock().await;
    let now = Instant::now();
    let entry = limits.entry(ip).or_insert((0, now));

    // Reset window if >60s old
    if now.duration_since(entry.1).as_secs() >= 60 {
        *entry = (1, now);
        return Ok(());
    }

    entry.0 += 1;
    if entry.0 > RATE_LIMIT_PER_MIN {
        warn!("Rate limit exceeded for {}", ip);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "error": "Rate limit exceeded. Max 20 requests per minute." })),
        ));
    }
    Ok(())
}

/// Validate the chat request. Returns Err with status if invalid.
fn validate_request(req: &ChatRequest) -> Result<(), (StatusCode, Json<Value>)> {
    if req.glob_id.is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({ "error": "glob_id required" }))));
    }
    if req.messages.len() > MAX_MESSAGES {
        return Err((StatusCode::BAD_REQUEST, Json(json!({
            "error": format!("Too many messages. Max {} allowed.", MAX_MESSAGES)
        }))));
    }
    for msg in &req.messages {
        // Only validate length for user messages — assistant responses can be longer
        if msg.role == "user" && msg.content.len() > MAX_MESSAGE_LENGTH {
            return Err((StatusCode::BAD_REQUEST, Json(json!({
                "error": format!("Message too long. Max {} characters.", MAX_MESSAGE_LENGTH)
            }))));
        }
        if msg.role != "user" && msg.role != "assistant" {
            return Err((StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid message role" }))));
        }
    }
    Ok(())
}

/// Check bearer token auth if configured.
fn check_auth(headers: &HeaderMap, expected_token: &Option<String>) -> Result<(), (StatusCode, Json<Value>)> {
    let Some(expected) = expected_token else { return Ok(()) };

    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = auth.strip_prefix("Bearer ").unwrap_or("");
    if token != expected.as_str() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "Invalid or missing bearer token" })),
        ));
    }
    Ok(())
}

// ── Tests ──────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    // ── validate_request ───────────────────────────────────────

    fn make_req(glob_id: &str, msgs: Vec<(&str, &str)>) -> ChatRequest {
        ChatRequest {
            glob_id: glob_id.to_string(),
            tick: Some(100),
            messages: msgs
                .into_iter()
                .map(|(role, content)| ChatMessage {
                    role: role.to_string(),
                    content: content.to_string(),
                })
                .collect(),
        }
    }

    #[test]
    fn validate_empty_glob_id_rejected() {
        let req = make_req("", vec![]);
        let err = validate_request(&req).unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn validate_valid_request_ok() {
        let req = make_req("abc-123", vec![("user", "Hallo")]);
        assert!(validate_request(&req).is_ok());
    }

    #[test]
    fn validate_empty_messages_ok() {
        // Empty messages = greeting request, totally valid
        let req = make_req("abc-123", vec![]);
        assert!(validate_request(&req).is_ok());
    }

    #[test]
    fn validate_too_many_messages_rejected() {
        let msgs: Vec<(&str, &str)> = (0..31).map(|_| ("user", "hi")).collect();
        let req = make_req("abc-123", msgs);
        let err = validate_request(&req).unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn validate_exactly_30_messages_ok() {
        let msgs: Vec<(&str, &str)> = (0..30).map(|_| ("user", "hi")).collect();
        let req = make_req("abc-123", msgs);
        assert!(validate_request(&req).is_ok());
    }

    #[test]
    fn validate_message_too_long_rejected() {
        let long = "a".repeat(501);
        let req = ChatRequest {
            glob_id: "abc".to_string(),
            tick: Some(100),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: long,
            }],
        };
        let err = validate_request(&req).unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn validate_message_exactly_500_ok() {
        let text = "a".repeat(500);
        let req = ChatRequest {
            glob_id: "abc".to_string(),
            tick: Some(100),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: text,
            }],
        };
        assert!(validate_request(&req).is_ok());
    }

    #[test]
    fn validate_bad_role_rejected() {
        let req = make_req("abc-123", vec![("system", "evil")]);
        let err = validate_request(&req).unwrap_err();
        assert_eq!(err.0, StatusCode::BAD_REQUEST);
    }

    #[test]
    fn validate_assistant_role_ok() {
        let req = make_req(
            "abc-123",
            vec![("user", "hi"), ("assistant", "hello"), ("user", "bye")],
        );
        assert!(validate_request(&req).is_ok());
    }

    // ── check_auth ─────────────────────────────────────────────

    #[test]
    fn auth_no_token_configured_always_ok() {
        let headers = HeaderMap::new();
        assert!(check_auth(&headers, &None).is_ok());
    }

    #[test]
    fn auth_correct_token_ok() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_static("Bearer secret123"));
        let token = Some("secret123".to_string());
        assert!(check_auth(&headers, &token).is_ok());
    }

    #[test]
    fn auth_wrong_token_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_static("Bearer wrong"));
        let token = Some("secret123".to_string());
        let err = check_auth(&headers, &token).unwrap_err();
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn auth_missing_header_rejected() {
        let headers = HeaderMap::new();
        let token = Some("secret123".to_string());
        let err = check_auth(&headers, &token).unwrap_err();
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
    }

    #[test]
    fn auth_no_bearer_prefix_rejected() {
        let mut headers = HeaderMap::new();
        headers.insert("authorization", HeaderValue::from_static("secret123"));
        let token = Some("secret123".to_string());
        let err = check_auth(&headers, &token).unwrap_err();
        assert_eq!(err.0, StatusCode::UNAUTHORIZED);
    }

    // ── extract_ip ─────────────────────────────────────────────

    #[test]
    fn extract_ip_from_forwarded_for() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("203.0.113.50, 70.41.3.18"));
        let ip = extract_ip(&headers);
        assert_eq!(ip, "203.0.113.50".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn extract_ip_fallback_to_localhost() {
        let headers = HeaderMap::new();
        let ip = extract_ip(&headers);
        assert_eq!(ip, "127.0.0.1".parse::<IpAddr>().unwrap());
    }

    #[test]
    fn extract_ip_single_value() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", HeaderValue::from_static("10.0.0.1"));
        let ip = extract_ip(&headers);
        assert_eq!(ip, "10.0.0.1".parse::<IpAddr>().unwrap());
    }

    // ── check_rate_limit ───────────────────────────────────────

    #[tokio::test]
    async fn rate_limit_allows_up_to_20() {
        let limits: RateLimitMap = Mutex::new(HashMap::new());
        let ip: IpAddr = "1.2.3.4".parse().unwrap();

        for _ in 0..20 {
            assert!(check_rate_limit(&limits, ip).await.is_ok());
        }
    }

    #[tokio::test]
    async fn rate_limit_rejects_at_21() {
        let limits: RateLimitMap = Mutex::new(HashMap::new());
        let ip: IpAddr = "1.2.3.4".parse().unwrap();

        for _ in 0..20 {
            check_rate_limit(&limits, ip).await.unwrap();
        }

        let err = check_rate_limit(&limits, ip).await.unwrap_err();
        assert_eq!(err.0, StatusCode::TOO_MANY_REQUESTS);
    }

    #[tokio::test]
    async fn rate_limit_different_ips_independent() {
        let limits: RateLimitMap = Mutex::new(HashMap::new());
        let ip_a: IpAddr = "1.2.3.4".parse().unwrap();
        let ip_b: IpAddr = "5.6.7.8".parse().unwrap();

        for _ in 0..20 {
            check_rate_limit(&limits, ip_a).await.unwrap();
        }

        // ip_b should still be allowed
        assert!(check_rate_limit(&limits, ip_b).await.is_ok());

        // ip_a should be blocked
        assert!(check_rate_limit(&limits, ip_a).await.is_err());
    }
}

pub async fn chat_handler(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<ChatRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // 1. Check if chat is enabled
    let anthropic = state.anthropic.as_ref().ok_or_else(|| {
        (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "error": "Chat is not enabled. Set ANTHROPIC_API_KEY." })))
    })?;

    // 2. Auth check
    check_auth(&headers, &state.chat_bearer_token)?;

    // 3. Rate limit
    let ip = extract_ip(&headers);
    check_rate_limit(&state.chat_rate_limits, ip).await?;

    // 4. Validate request
    validate_request(&req)?;

    // 5. Determine tick
    let tick = if let Some(t) = req.tick {
        t
    } else {
        // Live mode: use current simulation tick
        let sim = state.simulation.lock().await;
        sim.current_tick
    };

    // 6. Build system prompt (timeline or live mode)
    let prompt_data = if state.timeline_db_path.is_some() {
        // Timeline mode: read from DB
        let state_clone = state.clone();
        let glob_id = req.glob_id.clone();
        tokio::task::spawn_blocking(move || {
            let conn = rusqlite::Connection::open(state_clone.timeline_db_path.as_ref().unwrap())
                .map_err(|e| format!("DB error: {}", e))?;
            stats::build_system_prompt(&conn, &glob_id, tick)
        })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": format!("Task error: {}", e) }))))?
        .map_err(|e| (StatusCode::NOT_FOUND, Json(json!({ "error": e }))))?
    } else {
        // Live mode: read from simulation state
        let sim = state.simulation.lock().await;
        stats::build_system_prompt_live(&sim, &req.glob_id, tick)
            .map_err(|e| (StatusCode::NOT_FOUND, Json(json!({ "error": e }))))?
    };

    // 7. Age check: no interview for children under 14
    if prompt_data.current_age < MIN_INTERVIEW_AGE {
        return Ok(Json(json!({
            "reply": format!(
                "Hallo! Ich bin erst {} Jahre alt. Meine Eltern haben mir gesagt, ich soll nicht mit Fremden reden. Tschuess!",
                prompt_data.current_age
            ),
            "usage": null
        })));
    }

    // 8. Build messages for API call
    let mut api_messages = req.messages.clone();

    // If no messages, this is a greeting request — add instruction to system prompt
    let system_prompt = if api_messages.is_empty() {
        format!(
            "{}\n\n=== BEGRUESSUNG ===\nBegruesse den Interviewer kurz und freundlich als {}. Stelle dich vor und frage, was er/sie wissen moechte.",
            prompt_data.system_prompt,
            prompt_data.name.split_whitespace().next().unwrap_or(&prompt_data.name),
        )
    } else {
        prompt_data.system_prompt
    };

    // For greeting, add a dummy user message so the API has something to respond to
    if api_messages.is_empty() {
        api_messages.push(ChatMessage {
            role: "user".to_string(),
            content: "Hallo, ich bin Forscher/in und wuerde Ihnen gerne ein paar Fragen stellen.".to_string(),
        });
    }

    // 9. Acquire semaphore (limit concurrent API calls)
    let _permit = state.chat_semaphore.acquire().await.map_err(|_| {
        (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "error": "Server busy, try again shortly" })))
    })?;

    // 10. Call Anthropic API
    info!("Chat request: glob={}, tick={}, messages={}", req.glob_id, tick, api_messages.len());

    match anthropic.chat_with_retry(&system_prompt, &api_messages).await {
        Ok(resp) => {
            let usage = resp.usage.map(|u| json!({
                "input_tokens": u.input_tokens,
                "output_tokens": u.output_tokens,
            }));
            Ok(Json(json!({
                "reply": resp.text,
                "usage": usage,
            })))
        }
        Err(e) => {
            warn!("Anthropic API error: {}", e);
            Ok(Json(json!({
                "reply": "Entschuldigung, ich bin gerade etwas verwirrt. Koennen Sie die Frage wiederholen?",
                "usage": null,
                "error": "api_error",
            })))
        }
    }
}
