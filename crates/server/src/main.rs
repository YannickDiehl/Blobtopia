use axum::{
    extract::{Path, State},
    http::Method,
    response::{Html, Json},
    routing::{get, post},
    Router,
};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

use simulation_core::society::{BlobtopiaSim, BlobtopiaEvent, SocietyConfig};
use simulation_core::stage::city::CityModel;

mod anthropic;
mod artifacts;
mod chat;
mod config;
mod persistence;
mod stats;
mod tick;
mod timeline;
mod ws;

use config::ServerConfig;

pub struct AppState {
    pub simulation: Mutex<BlobtopiaSim>,
    pub broadcast_tx: broadcast::Sender<String>,
    pub paused: Mutex<bool>,
    pub config: ServerConfig,
    pub artifacts: Mutex<artifacts::ArtifactGenerator>,
    /// Path to pre-computed timeline DB (if available).
    pub timeline_db_path: Option<String>,
    /// Anthropic API client (None = chat disabled).
    pub anthropic: Option<anthropic::AnthropicClient>,
    /// Semaphore to limit concurrent API calls.
    pub chat_semaphore: Arc<tokio::sync::Semaphore>,
    /// Per-IP rate limiting for chat endpoint.
    pub chat_rate_limits: chat::RateLimitMap,
    /// Bearer token for chat auth (None = no auth required).
    pub chat_bearer_token: Option<String>,
}

/// Patch empty blob names in the timeline database with generated names.
fn patch_empty_names_in_db(db_path: &str, seed: u64) {
    use rand::rngs::SmallRng;
    use rand::SeedableRng;
    use simulation_core::society::Blob;
    use simulation_core::stage::blobtopia_stage::BlobtopiaLayout;

    let conn = match rusqlite::Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Could not open timeline DB for name patching: {}", e);
            return;
        }
    };

    // Find globs with empty names
    let mut stmt = match conn.prepare("SELECT id, district FROM globs WHERE name = '' OR name IS NULL") {
        Ok(s) => s,
        Err(_) => return,
    };
    let empty_blobs: Vec<(String, u32)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .ok()
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default();

    if empty_blobs.is_empty() {
        return;
    }

    info!("Patching {} blobs with empty names in timeline DB", empty_blobs.len());
    let layout = BlobtopiaLayout::new();
    let mut rng = SmallRng::seed_from_u64(seed + 9999);

    for (id, district) in &empty_blobs {
        let profile = &layout.districts[*district as usize].profile;
        let name = Blob::generate_name(profile, &mut rng);
        let _ = conn.execute("UPDATE globs SET name = ?1 WHERE id = ?2", rusqlite::params![name, id]);
    }

    info!("Patched {} blob names in timeline DB", empty_blobs.len());
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok(); // .env-Datei laden (ignoriert fehlende Datei)

    tracing_subscriber::fmt::init();

    let config = ServerConfig::default();
    info!("Starting Blobtopia server with config: {:?}", config);
    info!(
        "Tick interval: {:.1} min ({} ms) — 1 tick = 1 simulation day",
        config.tick_interval_ms as f64 / 60_000.0,
        config.tick_interval_ms
    );

    // Initialize society simulation
    let society_config = SocietyConfig::default();
    info!(
        "Society config: {} ticks/year, {} max years = {} total ticks",
        society_config.ticks_per_year,
        society_config.max_years,
        society_config.ticks_per_year * society_config.max_years,
    );

    // Load city model from blobtopia-city.json
    let city = match std::fs::read_to_string("data/blobtopia-city.json") {
        Ok(json_str) => match CityModel::from_json(&json_str) {
            Ok(city) => {
                info!(
                    "City loaded: {} functional buildings",
                    city.len()
                );
                Some(city)
            }
            Err(e) => {
                tracing::warn!("Failed to parse blobtopia-city.json: {}", e);
                None
            }
        },
        Err(e) => {
            tracing::warn!("blobtopia-city.json not found: {} — running without building assignments", e);
            None
        }
    };

    // Try to restore from saved state
    let sim = if let Some(saved) = persistence::load_state(&config.persistence_path) {
        info!("Restoring simulation from saved state at tick {}", saved.current_tick);
        persistence::restore_sim(saved, config.seed as u64, config.glob_count)
    } else if let Some(city_model) = city {
        let sim = BlobtopiaSim::new_with_city(
            config.seed as u64,
            config.glob_count,
            society_config,
            city_model,
        );
        // Log building assignment stats
        let assigned_homes = sim.blobs.iter().filter(|g| g.home_building_id.is_some()).count();
        let assigned_work = sim.blobs.iter().filter(|g| g.workplace_id.is_some()).count();
        info!(
            "Building assignments: {}/{} homes, {}/{} workplaces",
            assigned_homes, sim.blobs.len(), assigned_work, sim.blobs.len()
        );
        if let Some(ref graph) = sim.contact_graph {
            info!(
                "Contact graph built: avg {:.1} contacts per blob",
                graph.avg_contacts()
            );
        }
        sim
    } else {
        BlobtopiaSim::new(
            config.seed as u64,
            config.glob_count,
            society_config,
        )
    };

    info!(
        "Blobtopia initialized: {} blobs in {} districts (tick {}, {})",
        sim.blobs.len(),
        sim.layout.districts.len(),
        sim.current_tick,
        sim.date_string(),
    );

    // Log distribution
    for d in &sim.layout.districts {
        let count = sim.blobs.iter().filter(|g| g.district == d.id).count();
        info!("  District {} ({}): {} citizens", d.id, d.name, count);
    }

    // Check for pre-computed timeline database
    let timeline_db_path = if std::path::Path::new("data/blobtopia_timeline.db").exists() {
        info!("Timeline database found: blobtopia_timeline.db — playback mode available");
        let db_path = "data/blobtopia_timeline.db".to_string();
        // Patch empty glob names in the timeline DB (legacy data)
        patch_empty_names_in_db(&db_path, config.seed as u64);
        Some(db_path)
    } else {
        info!("No timeline database found — running in live simulation mode only");
        None
    };

    // Broadcast channel
    let (broadcast_tx, _) = broadcast::channel::<String>(64);

    // Initialize Anthropic client if API key is configured
    let anthropic_client = config.anthropic_api_key.as_ref().map(|key| {
        info!("Chat enabled: model={}, max_tokens={}", config.chat_model, config.chat_max_tokens);
        anthropic::AnthropicClient::new(
            key.clone(),
            config.chat_model.clone(),
            config.chat_max_tokens,
        )
    });
    if anthropic_client.is_none() {
        info!("Chat disabled: ANTHROPIC_API_KEY not set");
    }
    if config.chat_bearer_token.is_some() {
        info!("Chat auth enabled: bearer token required");
    }

    let state = Arc::new(AppState {
        simulation: Mutex::new(sim),
        broadcast_tx,
        paused: Mutex::new(config.start_paused),
        anthropic: anthropic_client,
        chat_semaphore: Arc::new(tokio::sync::Semaphore::new(15)),
        chat_rate_limits: Mutex::new(HashMap::new()),
        chat_bearer_token: config.chat_bearer_token.clone(),
        config: config.clone(),
        artifacts: Mutex::new(artifacts::ArtifactGenerator::new()),
        timeline_db_path,
    });

    // Start tick loop only in live simulation mode (not timeline playback)
    if state.timeline_db_path.is_none() {
        let tick_state = state.clone();
        tokio::spawn(async move {
            tick::tick_loop(tick_state).await;
        });
    } else {
        info!("Timeline mode — tick loop disabled");
    }

    // Build router
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/", get(serve_dashboard))
        .route("/ws", get(ws::ws_handler))
        .route("/api/health", get(health))
        .route("/api/status", get(get_status))
        .route("/api/pause", get(pause_simulation))
        .route("/api/resume", get(resume_simulation))
        .route("/api/glob/:id", get(get_glob))
        .route("/api/demographics", get(get_demographics))
        .route("/api/tweets", get(get_tweets))
        .route("/api/gazette", get(get_gazette))
        .route("/api/event", post(trigger_event))
        // Timeline playback API (pre-computed data from SQLite)
        .route("/api/timeline/metadata", get(timeline::get_timeline_metadata))
        .route("/api/timeline/tick/:tick", get(timeline::get_timeline_tick))
        .route("/api/timeline/tweets/all", get(timeline::get_all_tweets))
        // Stats endpoints (Dozenten-Dashboard)
        .route("/api/timeline/stats/attitudes", get(stats::get_attitudes))
        .route("/api/timeline/stats/latent-traits", get(stats::get_latent_traits))
        .route("/api/timeline/stats/elections", get(stats::get_elections))
        .route("/api/timeline/stats/events/impact", get(stats::get_events_impact))
        .route("/api/timeline/stats/glob/:id/history", get(stats::get_glob_history))
        .route("/api/timeline/stats/glob-list", get(stats::get_glob_list))
        .route("/api/timeline/stats/summary", get(stats::get_timeline_summary))
        // Tweet endpoints
        .route("/api/timeline/tweets", get(stats::get_timeline_tweets))
        .route("/api/timeline/stats/tweets-with-traits", get(stats::get_tweets_with_traits))
        // Interview prompt endpoint (Phase 6 preparation)
        .route("/api/interview/prompt/:glob_id/:tick", get(stats::get_interview_prompt))
        // Chat endpoint (LLM interview)
        .route("/api/chat", post(chat::chat_handler))
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    info!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn serve_dashboard() -> Html<&'static str> {
    Html(include_str!("../static/index.html"))
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn get_status(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let sim = state.simulation.lock().await;
    let paused = *state.paused.lock().await;

    // Include district metadata for frontend
    let districts_meta: Vec<serde_json::Value> = sim.layout.districts.iter().map(|d| {
        json!({
            "id": d.id,
            "name": d.name,
            "color_hex": d.color_hex,
            "color_3d": d.color_3d,
        })
    }).collect();

    Json(json!({
        "tick": sim.current_tick,
        "year": sim.current_year(),
        "month": sim.current_month(),
        "day": sim.current_day(),
        "date": sim.date_string(),
        "max_years": sim.config.max_years,
        "population": sim.blobs.len(),
        "paused": paused,
        "finished": sim.is_finished(),
        "tick_interval_ms": state.config.tick_interval_ms,
        "districts": districts_meta,
    }))
}

async fn pause_simulation(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    *state.paused.lock().await = true;
    ws::broadcast_status(&state.broadcast_tx, true);
    // Save state on pause (skip in timeline mode — state is read-only)
    if state.timeline_db_path.is_none() {
        let sim = state.simulation.lock().await;
        persistence::save_state(&state.config.persistence_path, &sim).await;
    }
    Json(json!({ "paused": true }))
}

async fn resume_simulation(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    *state.paused.lock().await = false;
    ws::broadcast_status(&state.broadcast_tx, false);
    Json(json!({ "paused": false }))
}

async fn get_glob(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Json<serde_json::Value> {
    let sim = state.simulation.lock().await;
    if let Some(glob) = sim.blobs.iter().find(|g| g.id.to_string() == id) {
        let r2 = |v: f64| (v * 100.0).round() / 100.0;
        return Json(json!({
            "id": glob.id.to_string(),
            "district": glob.district,
            "education_level": glob.education_level,
            "income": r2(glob.income),
            "age": glob.age,
            // Attitudes
            "satisfaction": r2(glob.attitudes.political_satisfaction),
            "ideology": r2(glob.attitudes.ideology),
            "trust": r2(glob.attitudes.institutional_trust),
            // Political behavior
            "party": glob.political_state.party_affiliation,
            "will_vote": glob.political_state.will_vote,
            "protest_readiness": r2(glob.political_state.protest_readiness),
            // Latent trait indicators
            "latent_traits": {
                "efficacy": {
                    "self_efficacy": r2(glob.latent_traits.self_efficacy),
                    "political_knowledge": r2(glob.latent_traits.political_knowledge),
                    "vote_importance": r2(glob.latent_traits.vote_importance),
                },
                "social_capital": {
                    "network_size": glob.latent_traits.network_size,
                    "neighbor_trust": r2(glob.latent_traits.neighbor_trust),
                    "community_participation": r2(glob.latent_traits.community_participation),
                },
                "authoritarianism": {
                    "obedience_value": r2(glob.latent_traits.obedience_value),
                    "rule_conformity": r2(glob.latent_traits.rule_conformity),
                    "strong_leader_preference": r2(glob.latent_traits.strong_leader_preference),
                },
                "alienation": {
                    "powerlessness": r2(glob.latent_traits.powerlessness),
                    "political_complexity": r2(glob.latent_traits.political_complexity),
                    "party_indifference": r2(glob.latent_traits.party_indifference),
                },
                "materialism": {
                    "economic_security_priority": r2(glob.latent_traits.economic_security_priority),
                    "environment_over_economy": r2(glob.latent_traits.environment_over_economy),
                    "freedom_over_order": r2(glob.latent_traits.freedom_over_order),
                },
            },
            "pos": [glob.pos.x.round(), glob.pos.y.round()],
        }));
    }
    Json(json!({ "error": "Blob not found" }))
}

async fn get_demographics(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    // In timeline mode, demographics should be fetched via /api/timeline/tick/:tick
    // since sim.blobs only holds the initial state.
    if state.timeline_db_path.is_some() {
        return Json(json!({
            "error": "Use /api/timeline/tick/:tick for demographics in timeline mode"
        }));
    }

    let sim = state.simulation.lock().await;

    let mut districts = Vec::new();
    for district in &sim.layout.districts {
        let d = district.id;
        let in_district: Vec<_> = sim.blobs.iter().filter(|g| g.district == d).collect();
        let count = in_district.len();
        if count == 0 {
            districts.push(json!({ "district": d, "name": district.name, "count": 0 }));
            continue;
        }

        let avg = |f: fn(&&simulation_core::society::Blob) -> f64| -> f64 {
            let sum: f64 = in_district.iter().map(f).sum();
            (sum / count as f64 * 100.0).round() / 100.0
        };

        let voters = in_district.iter().filter(|g| g.political_state.will_vote).count();
        let mut parties = [0u32; 4];
        for g in &in_district {
            if let Some(p) = g.political_state.party_affiliation {
                if (p as usize) < 4 { parties[p as usize] += 1; }
            }
        }

        districts.push(json!({
            "district": d,
            "name": district.name,
            "count": count,
            "avg_satisfaction": avg(|g| g.attitudes.political_satisfaction),
            "avg_ideology": avg(|g| g.attitudes.ideology),
            "avg_trust": avg(|g| g.attitudes.institutional_trust),
            "avg_income": avg(|g| g.income),
            "voters": voters,
            "avg_protest_readiness": avg(|g| g.political_state.protest_readiness),
            "parties": {
                "fortschritt": parties[0],
                "mitte": parties[1],
                "tradition": parties[2],
                "unabhaengige": parties[3],
            }
        }));
    }

    Json(json!({
        "tick": sim.current_tick,
        "year": sim.current_year(),
        "month": sim.current_month(),
        "day": sim.current_day(),
        "date": sim.date_string(),
        "total_population": sim.blobs.len(),
        "districts": districts,
    }))
}

async fn get_tweets(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    // Timeline mode: read pre-generated tweets from DB
    if let Some(ref db_path) = state.timeline_db_path {
        let db_path = db_path.clone();
        let result = tokio::task::spawn_blocking(move || {
            let conn = rusqlite::Connection::open(&db_path)
                .map_err(|e| json!({ "error": format!("DB error: {}", e) }))?;

            // Check if tweets table exists
            if conn.prepare("SELECT 1 FROM tweets LIMIT 0").is_err() {
                return Ok(json!({ "tweets": [] }));
            }

            let mut stmt = conn
                .prepare(
                    "SELECT t.glob_id, g.name, g.district, t.tick, t.topic,
                            t.trigger_type, t.tweet_text, t.sentiment
                     FROM tweets t
                     JOIN globs g ON t.glob_id = g.id
                     ORDER BY t.tick DESC
                     LIMIT 50",
                )
                .map_err(|e| json!({ "error": format!("Query error: {}", e) }))?;

            let tweets: Vec<serde_json::Value> = stmt
                .query_map([], |row| {
                    Ok(json!({
                        "glob_id": row.get::<_, String>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "district": row.get::<_, u32>(2)?,
                        "tick": row.get::<_, u32>(3)?,
                        "topic": row.get::<_, String>(4)?,
                        "trigger_type": row.get::<_, String>(5)?,
                        "tweet_text": row.get::<_, String>(6)?,
                        "sentiment": row.get::<_, Option<f64>>(7)?,
                    }))
                })
                .map_err(|e| json!({ "error": format!("Query error: {}", e) }))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(json!({ "tweets": tweets }))
        })
        .await
        .unwrap_or_else(|e| Err(json!({ "error": format!("Task error: {}", e) })));

        return Json(match result {
            Ok(v) => v,
            Err(v) => v,
        });
    }

    // Live mode: in-memory artifacts
    let artifacts = state.artifacts.lock().await;
    Json(json!({ "tweets": artifacts.recent_tweets(50) }))
}

async fn get_gazette(State(state): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let artifacts = state.artifacts.lock().await;
    Json(json!({ "articles": artifacts.all_articles() }))
}

async fn trigger_event(
    State(state): State<Arc<AppState>>,
    Json(event): Json<BlobtopiaEvent>,
) -> Json<serde_json::Value> {
    let mut sim = state.simulation.lock().await;
    let event_desc = format!("{:?}", event);
    sim.queue_event(event);
    info!("Event queued: {}", event_desc);
    Json(json!({ "queued": true, "event": event_desc }))
}
