use serde::{Deserialize, Serialize};
use tracing::{info, warn};

#[derive(Clone)]
pub struct AnthropicClient {
    client: reqwest::Client,
    api_key: String,
    model: String,
    max_tokens: u32,
}

#[derive(Debug, Serialize)]
struct ApiRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: &'a [ChatMessage],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
struct ApiResponse {
    content: Vec<ContentBlock>,
    usage: Option<ApiUsage>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    text: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ApiUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug)]
pub struct ChatResponse {
    pub text: String,
    pub usage: Option<ApiUsage>,
}

impl AnthropicClient {
    pub fn new(api_key: String, model: String, max_tokens: u32) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        info!("Anthropic client initialized: model={}, max_tokens={}", model, max_tokens);

        Self { client, api_key, model, max_tokens }
    }

    async fn send_request(&self, system_prompt: &str, messages: &[ChatMessage]) -> Result<ChatResponse, String> {
        let body = ApiRequest {
            model: &self.model,
            max_tokens: self.max_tokens,
            system: system_prompt,
            messages,
        };

        let response = self.client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, error_text));
        }

        let api_resp: ApiResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let text = api_resp.content
            .into_iter()
            .map(|c| c.text)
            .collect::<Vec<_>>()
            .join("");

        Ok(ChatResponse { text, usage: api_resp.usage })
    }

    pub async fn chat_with_retry(&self, system_prompt: &str, messages: &[ChatMessage]) -> Result<ChatResponse, String> {
        match self.send_request(system_prompt, messages).await {
            Ok(resp) => Ok(resp),
            Err(e) if e.contains("429") || e.contains("529") => {
                warn!("Rate limited, retrying in 2s: {}", e);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                self.send_request(system_prompt, messages).await
            }
            Err(e) => Err(e),
        }
    }
}
