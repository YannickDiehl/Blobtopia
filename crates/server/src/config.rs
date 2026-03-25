use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// Port to listen on
    pub port: u16,
    /// Tick interval in milliseconds.
    /// Default: 903_000 ms (~15 min) → 1 tick = 1 simulation day.
    /// 22 years × 365 days = 8030 ticks over 12 real weeks (120,960 min).
    pub tick_interval_ms: u64,
    /// Random seed for deterministic simulation
    pub seed: u32,
    /// Number of initial creatures (globs)
    pub glob_count: usize,
    /// Stage size (square grid side length)
    pub stage_size: f64,
    /// Food per generation (legacy, unused)
    pub food_per_generation: Vec<(f64, f64)>,
    /// Whether the simulation starts paused
    pub start_paused: bool,
    /// Path to save/restore simulation state for persistence across restarts
    pub persistence_path: String,
    /// How often to auto-save state (every N ticks)
    pub autosave_interval: u32,
    /// Anthropic API key for LLM chat (from ANTHROPIC_API_KEY env)
    pub anthropic_api_key: Option<String>,
    /// Bearer token for chat endpoint auth (from CHAT_BEARER_TOKEN env)
    pub chat_bearer_token: Option<String>,
    /// LLM model ID (from CHAT_MODEL env)
    pub chat_model: String,
    /// Max tokens for LLM response (from CHAT_MAX_TOKENS env)
    pub chat_max_tokens: u32,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 3030,
            // 1 tick = 1 Simulationstag, alle ~15 min Echtzeit
            // 22 Jahre × 365 Tage = 8030 Ticks über 12 Wochen (120.960 min)
            // 120.960 min / 8030 Ticks ≈ 15,06 min = 903.000 ms
            // Dev-Tipp: auf 5_000 setzen zum schnellen Testen
            tick_interval_ms: 903_000,
            seed: 118,
            glob_count: 500,
            stage_size: 500.0,
            food_per_generation: vec![(0.0, 50.0)],
            start_paused: true,
            persistence_path: "data/blobtopia_state.json".to_string(),
            autosave_interval: 10,  // save every 10 ticks (~3.7 hours)
            anthropic_api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
            chat_bearer_token: std::env::var("CHAT_BEARER_TOKEN").ok(),
            chat_model: std::env::var("CHAT_MODEL")
                .unwrap_or_else(|_| "claude-haiku-4-5-20251001".to_string()),
            chat_max_tokens: std::env::var("CHAT_MAX_TOKENS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(300),
        }
    }
}
