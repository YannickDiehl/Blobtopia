use axum::{
    extract::{Path, State},
    response::Json,
};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::Arc;

use simulation_core::society::timeline_db;

use crate::AppState;

/// GET /api/timeline/metadata — overview of the pre-computed timeline
pub async fn get_timeline_metadata(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let Some(ref db_path) = state.timeline_db_path else {
        return Json(json!({ "error": "No timeline database loaded" }));
    };

    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => return Json(json!({ "error": format!("DB error: {}", e) })),
    };

    match timeline_db::read_timeline_metadata(&conn) {
        Ok(meta) => {
            let ticks_per_year: u32 = timeline_db::read_meta(&conn, "ticks_per_year")
                .ok()
                .flatten()
                .and_then(|s| s.parse().ok())
                .unwrap_or(365);

            Json(json!({
                "max_tick": meta.max_tick,
                "total_globs": meta.total_blobs,
                "ticks_per_year": ticks_per_year,
                "events": meta.events.iter().map(|(tick, desc)| {
                    json!({ "tick": tick, "description": desc, "year": tick / ticks_per_year })
                }).collect::<Vec<_>>(),
                "election_ticks": meta.election_ticks,
            }))
        }
        Err(e) => Json(json!({ "error": format!("Read error: {}", e) })),
    }
}

/// GET /api/timeline/tick/:tick — full snapshot for a specific day
pub async fn get_timeline_tick(
    State(state): State<Arc<AppState>>,
    Path(tick): Path<u32>,
) -> Json<Value> {
    let Some(ref db_path) = state.timeline_db_path else {
        return Json(json!({ "error": "No timeline database loaded" }));
    };

    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => return Json(json!({ "error": format!("DB error: {}", e) })),
    };

    let ticks_per_year: u32 = timeline_db::read_meta(&conn, "ticks_per_year")
        .ok()
        .flatten()
        .and_then(|s| s.parse().ok())
        .unwrap_or(365);

    match timeline_db::read_tick_snapshot(&conn, tick) {
        Ok(Some(snapshot)) => {
            let year = tick / ticks_per_year;
            let month = (tick % ticks_per_year / 30).min(11) + 1;
            let day = (tick % ticks_per_year % 30) + 1;

            // Convert glob states to the format the frontend expects
            let globs: Vec<Value> = snapshot.blob_states.iter().map(|g| {
                let latent: Value = serde_json::from_str(&g.latent_traits_json)
                    .unwrap_or(json!({}));

                // Get building position from DB for home_pos
                json!({
                    "id": g.id,
                    "name": g.name,
                    "district": g.district,
                    "education_level": g.education_level,
                    "income": g.income,
                    "age": g.age,
                    "home_building_id": g.home_building_id,
                    "workplace_id": g.workplace_id,
                    "lunch_spot_id": g.lunch_spot_id,
                    "leisure_spot_id": g.leisure_spot_id,
                    "attitudes": {
                        "political_satisfaction": g.satisfaction,
                        "ideology": g.ideology,
                        "institutional_trust": g.trust,
                        "policy_economy": g.policy_economy,
                        "policy_environment": g.policy_environment,
                        "policy_security": g.policy_security,
                        "policy_social": g.policy_social,
                        "policy_migration": g.policy_migration,
                        "policy_democracy": g.policy_democracy,
                    },
                    "political_state": {
                        "party_affiliation": g.party,
                        "will_vote": g.will_vote,
                        "protest_readiness": g.protest_readiness,
                        "last_vote": null,
                    },
                    "latent_traits": latent,
                    "emotion": {
                        "valence": g.emotion_valence,
                        "arousal": g.emotion_arousal,
                        "label": g.emotion_label,
                        "icon": g.emotion_icon,
                    },
                    // Position: use home building position (frontend will animate from schedule)
                    "pos": g.home_building_id.and_then(|bid| {
                        get_building_pos(&conn, bid)
                    }).unwrap_or(json!([156.0, 180.0])),
                    "home_pos": g.home_building_id.and_then(|bid| {
                        get_building_pos(&conn, bid)
                    }).unwrap_or(json!([156.0, 180.0])),
                })
            }).collect();

            // Parse schedules
            let daily_schedules: Value = snapshot.schedules.iter().map(|(id, json_str)| {
                let sched: Value = serde_json::from_str(json_str).unwrap_or(json!(null));
                (id.clone(), sched)
            }).collect::<serde_json::Map<String, Value>>().into();

            Json(json!({
                "tick": tick,
                "year": year,
                "month": month,
                "day": day,
                "globs": globs,
                "daily_schedules": daily_schedules,
                "election_results": snapshot.election,
                "events_processed": snapshot.events,
            }))
        }
        Ok(None) => Json(json!({ "error": "Tick not found", "tick": tick })),
        Err(e) => Json(json!({ "error": format!("Read error: {}", e) })),
    }
}

/// GET /api/timeline/tweets/all — all tweets, loaded once at app start
pub async fn get_all_tweets(
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let Some(ref db_path) = state.timeline_db_path else {
        return Json(json!({ "tweets": [] }));
    };

    let conn = match Connection::open(db_path) {
        Ok(c) => c,
        Err(_) => return Json(json!({ "tweets": [] })),
    };

    let has_tweets = conn.prepare("SELECT 1 FROM tweets LIMIT 0").is_ok();
    if !has_tweets {
        return Json(json!({ "tweets": [] }));
    }

    let mut stmt = match conn.prepare(
        "SELECT t.id, t.glob_id, g.name, g.district, t.tick, t.topic,
                t.trigger_type, t.event_description, t.tweet_text, t.sentiment
         FROM tweets t
         JOIN globs g ON t.glob_id = g.id
         ORDER BY t.tick ASC"
    ) {
        Ok(s) => s,
        Err(_) => return Json(json!({ "tweets": [] })),
    };

    let tweets: Vec<Value> = stmt.query_map([], |row| {
        Ok(json!({
            "id": row.get::<_, u32>(0)?,
            "glob_id": row.get::<_, String>(1)?,
            "name": row.get::<_, String>(2)?,
            "district": row.get::<_, u32>(3)?,
            "tick": row.get::<_, u32>(4)?,
            "topic": row.get::<_, String>(5)?,
            "trigger_type": row.get::<_, String>(6)?,
            "event_description": row.get::<_, Option<String>>(7)?,
            "tweet_text": row.get::<_, String>(8)?,
            "sentiment": row.get::<_, Option<f64>>(9)?,
        }))
    }).ok()
      .map(|rows| rows.filter_map(|r| r.ok()).collect())
      .unwrap_or_default();

    Json(json!({ "tweets": tweets }))
}

/// Helper: get building position from DB as sim coordinates [x/4, z/4]
fn get_building_pos(conn: &Connection, building_id: u32) -> Option<Value> {
    conn.query_row(
        "SELECT x, z FROM buildings WHERE id = ?1",
        [building_id],
        |row| {
            let x: f64 = row.get(0)?;
            let z: f64 = row.get(1)?;
            // Convert world coords (0-2000) to sim coords (0-500)
            Ok(json!([x / 4.0, z / 4.0]))
        },
    )
    .ok()
}
