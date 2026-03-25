use axum::{
    extract::{Path, Query, State},
    response::Json,
};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;

use crate::AppState;

/// Query parameters for tweet filtering.
#[derive(Deserialize)]
pub struct TweetQueryParams {
    pub tick_start: Option<u32>,
    pub tick_end: Option<u32>,
    pub glob_id: Option<String>,
    pub topic: Option<String>,
    pub district: Option<u32>,
    pub limit: Option<u32>,
}

/// Round to 2 decimal places.
fn r2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Open the timeline DB or return an error JSON.
fn open_db(state: &AppState) -> Result<Connection, Json<Value>> {
    let Some(ref db_path) = state.timeline_db_path else {
        return Err(Json(json!({ "error": "No timeline database loaded" })));
    };
    Connection::open(db_path)
        .map_err(|e| Json(json!({ "error": format!("DB error: {}", e) })))
}

/// Read ticks_per_year from the meta table (default 365).
fn ticks_per_year(conn: &Connection) -> u32 {
    conn.query_row(
        "SELECT value FROM meta WHERE key = 'ticks_per_year'",
        [],
        |row| {
            let s: String = row.get(0)?;
            Ok(s.parse::<u32>().unwrap_or(365))
        },
    )
    .unwrap_or(365)
}

// ---------------------------------------------------------------------------
// 1. GET /api/timeline/stats/attitudes
// ---------------------------------------------------------------------------
pub async fn get_attitudes(State(state): State<Arc<AppState>>) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;
        let mut stmt = conn
            .prepare(
                "SELECT s.tick, g.district,
                        AVG(s.satisfaction), AVG(s.ideology), AVG(s.trust), AVG(s.protest_readiness)
                 FROM glob_daily_state s
                 JOIN globs g ON s.glob_id = g.id
                 WHERE s.tick % 7 = 0
                 GROUP BY s.tick, g.district
                 ORDER BY s.tick, g.district",
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let mut districts: HashMap<u32, Vec<Value>> = HashMap::new();
        for d in 0..5 {
            districts.insert(d, Vec::new());
        }

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, f64>(5)?,
                ))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        for row in rows {
            let (tick, district, sat, ideo, trust, protest) =
                row.map_err(|e| Json(json!({ "error": format!("Row error: {}", e) })))?;
            districts.entry(district).or_default().push(json!({
                "tick": tick,
                "satisfaction": r2(sat),
                "ideology": r2(ideo),
                "trust": r2(trust),
                "protest": r2(protest),
            }));
        }

        let districts_json: serde_json::Map<String, Value> = districts
            .into_iter()
            .map(|(k, v)| (k.to_string(), Value::Array(v)))
            .collect();

        Ok(Json(json!({ "districts": districts_json })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 2. GET /api/timeline/stats/latent-traits
// ---------------------------------------------------------------------------
pub async fn get_latent_traits(State(state): State<Arc<AppState>>) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;
        let mut stmt = conn
            .prepare(
                "SELECT s.tick, g.district,
                        AVG(json_extract(s.latent_traits_json, '$.self_efficacy')),
                        AVG(json_extract(s.latent_traits_json, '$.political_knowledge')),
                        AVG(json_extract(s.latent_traits_json, '$.vote_importance')),
                        AVG(json_extract(s.latent_traits_json, '$.network_size')),
                        AVG(json_extract(s.latent_traits_json, '$.neighbor_trust')),
                        AVG(json_extract(s.latent_traits_json, '$.community_participation')),
                        AVG(json_extract(s.latent_traits_json, '$.obedience_value')),
                        AVG(json_extract(s.latent_traits_json, '$.rule_conformity')),
                        AVG(json_extract(s.latent_traits_json, '$.strong_leader_preference')),
                        AVG(json_extract(s.latent_traits_json, '$.powerlessness')),
                        AVG(json_extract(s.latent_traits_json, '$.political_complexity')),
                        AVG(json_extract(s.latent_traits_json, '$.party_indifference')),
                        AVG(json_extract(s.latent_traits_json, '$.economic_security_priority')),
                        AVG(json_extract(s.latent_traits_json, '$.environment_over_economy')),
                        AVG(json_extract(s.latent_traits_json, '$.freedom_over_order'))
                 FROM glob_daily_state s
                 JOIN globs g ON s.glob_id = g.id
                 WHERE s.latent_traits_json IS NOT NULL
                 GROUP BY s.tick, g.district
                 ORDER BY s.tick, g.district",
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let mut districts: HashMap<u32, Vec<Value>> = HashMap::new();
        for d in 0..5 {
            districts.insert(d, Vec::new());
        }

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, f64>(6)?,
                    row.get::<_, f64>(7)?,
                    row.get::<_, f64>(8)?,
                    row.get::<_, f64>(9)?,
                    row.get::<_, f64>(10)?,
                    row.get::<_, f64>(11)?,
                    row.get::<_, f64>(12)?,
                    row.get::<_, f64>(13)?,
                    row.get::<_, f64>(14)?,
                    row.get::<_, f64>(15)?,
                    row.get::<_, f64>(16)?,
                ))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        for row in rows {
            let vals =
                row.map_err(|e| Json(json!({ "error": format!("Row error: {}", e) })))?;
            let (tick, district) = (vals.0, vals.1);
            districts.entry(district).or_default().push(json!({
                "tick": tick,
                "efficacy": {
                    "self_efficacy": r2(vals.2),
                    "political_knowledge": r2(vals.3),
                    "vote_importance": r2(vals.4),
                },
                "social_capital": {
                    "network_size": r2(vals.5),
                    "neighbor_trust": r2(vals.6),
                    "community_participation": r2(vals.7),
                },
                "authoritarianism": {
                    "obedience_value": r2(vals.8),
                    "rule_conformity": r2(vals.9),
                    "strong_leader_preference": r2(vals.10),
                },
                "alienation": {
                    "powerlessness": r2(vals.11),
                    "political_complexity": r2(vals.12),
                    "party_indifference": r2(vals.13),
                },
                "materialism": {
                    "economic_security_priority": r2(vals.14),
                    "environment_over_economy": r2(vals.15),
                    "freedom_over_order": r2(vals.16),
                },
            }));
        }

        let districts_json: serde_json::Map<String, Value> = districts
            .into_iter()
            .map(|(k, v)| (k.to_string(), Value::Array(v)))
            .collect();

        Ok(Json(json!({ "districts": districts_json })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 3. GET /api/timeline/stats/elections
// ---------------------------------------------------------------------------
pub async fn get_elections(State(state): State<Arc<AppState>>) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;
        let tpy = ticks_per_year(&conn);

        let mut stmt = conn
            .prepare(
                "SELECT e.tick, e.fortschritt, e.mitte, e.tradition, e.unabhaengige
                 FROM elections e ORDER BY e.tick",
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let elections: Vec<(u32, u32, u32, u32, u32)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, u32>(1)?,
                    row.get::<_, u32>(2)?,
                    row.get::<_, u32>(3)?,
                    row.get::<_, u32>(4)?,
                ))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?
            .filter_map(|r| r.ok())
            .collect();

        let mut results = Vec::new();
        for (tick, fortschritt, mitte, tradition, unabhaengige) in &elections {
            // Use CURRENT age (start age + years elapsed) to account for children who grew up
            let tpy_i64 = tpy as i64;
            let turnout: u32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM glob_daily_state s
                     JOIN globs g ON s.glob_id = g.id
                     WHERE s.tick = ?1 AND s.will_vote = 1 AND (g.age + s.tick / ?2) >= 18",
                    rusqlite::params![tick, tpy_i64],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let total: u32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM glob_daily_state s
                     JOIN globs g ON s.glob_id = g.id
                     WHERE s.tick = ?1 AND (g.age + s.tick / ?2) >= 18",
                    rusqlite::params![tick, tpy_i64],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            results.push(json!({
                "tick": tick,
                "year": tick / tpy,
                "fortschritt": fortschritt,
                "mitte": mitte,
                "tradition": tradition,
                "unabhaengige": unabhaengige,
                "turnout": turnout,
                "total": total,
            }));
        }

        Ok(Json(json!({ "elections": results })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 4. GET /api/timeline/stats/events/impact
// ---------------------------------------------------------------------------
pub async fn get_events_impact(State(state): State<Arc<AppState>>) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;
        let tpy = ticks_per_year(&conn);

        let mut evt_stmt = conn
            .prepare("SELECT tick, event_type, description FROM events ORDER BY tick")
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let events: Vec<(u32, String, String)> = evt_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?
            .filter_map(|r| r.ok())
            .collect();

        let mut attitude_stmt = conn
            .prepare(
                "SELECT g.district, AVG(s.satisfaction), AVG(s.ideology), AVG(s.trust)
                 FROM glob_daily_state s
                 JOIN globs g ON s.glob_id = g.id
                 WHERE s.tick BETWEEN ?1 AND ?2
                 GROUP BY g.district",
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let mut results = Vec::new();
        for (tick, event_type, description) in &events {
            let before_start = tick.saturating_sub(7);
            let after_end = tick + 7;

            let mut fetch_attitudes =
                |start: u32, end: u32| -> Result<HashMap<u32, Value>, Json<Value>> {
                    let rows = attitude_stmt
                        .query_map(rusqlite::params![start, end], |row| {
                            Ok((
                                row.get::<_, u32>(0)?,
                                row.get::<_, f64>(1)?,
                                row.get::<_, f64>(2)?,
                                row.get::<_, f64>(3)?,
                            ))
                        })
                        .map_err(|e| {
                            Json(json!({ "error": format!("Query error: {}", e) }))
                        })?;

                    let mut map = HashMap::new();
                    for row in rows {
                        let (d, sat, ideo, trust) = row.map_err(|e| {
                            Json(json!({ "error": format!("Row error: {}", e) }))
                        })?;
                        map.insert(
                            d,
                            json!({
                                "satisfaction": r2(sat),
                                "ideology": r2(ideo),
                                "trust": r2(trust),
                            }),
                        );
                    }
                    Ok(map)
                };

            let before = fetch_attitudes(before_start, *tick)?;
            let after = fetch_attitudes(*tick, after_end)?;

            let mut district_impacts = Vec::new();
            for d in 0..5u32 {
                district_impacts.push(json!({
                    "district": d,
                    "before": before.get(&d).cloned().unwrap_or(json!(null)),
                    "after": after.get(&d).cloned().unwrap_or(json!(null)),
                }));
            }

            results.push(json!({
                "tick": tick,
                "event_type": event_type,
                "description": description,
                "year": tick / tpy,
                "districts": district_impacts,
            }));
        }

        Ok(Json(json!({ "events": results })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 5. GET /api/timeline/stats/glob/:id/history
// ---------------------------------------------------------------------------
pub async fn get_glob_history(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;

        // Static glob info — persona_text column is optional (added by generate_persona_texts.py)
        let has_persona = conn.prepare("SELECT persona_text FROM globs LIMIT 0").is_ok();
        let q = format!(
            "SELECT id, district, education_level, income, age,
                    home_building_id, workplace_id, lunch_spot_id, leisure_spot_id,
                    {} FROM globs WHERE id = ?1",
            if has_persona { "COALESCE(persona_text, '')" } else { "''" },
        );
        let glob_info: Value = conn
            .query_row(&q, [&id], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "district": row.get::<_, u32>(1)?,
                    "education_level": row.get::<_, u32>(2)?,
                    "income": r2(row.get::<_, f64>(3)?),
                    "age": row.get::<_, u32>(4)?,
                    "home_building_id": row.get::<_, Option<u32>>(5)?,
                    "workplace_id": row.get::<_, Option<u32>>(6)?,
                    "lunch_spot_id": row.get::<_, Option<u32>>(7)?,
                    "leisure_spot_id": row.get::<_, Option<u32>>(8)?,
                    "persona_text": row.get::<_, String>(9)?,
                }))
            })
            .map_err(|e| Json(json!({ "error": format!("Blob not found: {}", e) })))?;

        // Persona snapshots (all timepoints for this glob)
        let persona_snapshots: Vec<Value> = conn
            .prepare(
                "SELECT tick, year, current_age, job, persona_state, change_summary
                 FROM glob_persona_snapshots
                 WHERE glob_id = ?1
                 ORDER BY tick",
            )
            .ok()
            .map(|mut stmt| {
                stmt.query_map([&id], |row| {
                    Ok(json!({
                        "tick": row.get::<_, u32>(0)?,
                        "year": row.get::<_, u32>(1)?,
                        "current_age": row.get::<_, u32>(2)?,
                        "job": row.get::<_, String>(3)?,
                        "persona_state": row.get::<_, String>(4)?,
                        "change_summary": row.get::<_, String>(5)?,
                    }))
                })
                .ok()
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
                .unwrap_or_default()
            })
            .unwrap_or_default();

        // Full history
        let mut stmt = conn
            .prepare(
                "SELECT s.tick, s.satisfaction, s.ideology, s.trust,
                        s.party, s.will_vote, s.protest_readiness, s.latent_traits_json
                 FROM glob_daily_state s
                 WHERE s.glob_id = ?1
                 ORDER BY s.tick",
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let rows = stmt
            .query_map([&id], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, Option<u32>>(4)?,
                    row.get::<_, bool>(5)?,
                    row.get::<_, f64>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let mut history = Vec::new();
        let mut last_latent: Value = json!(null);

        for row in rows {
            let (tick, sat, ideo, trust, party, will_vote, protest, latent_json) =
                row.map_err(|e| Json(json!({ "error": format!("Row error: {}", e) })))?;

            // Sample latent traits every 7th tick, carry forward otherwise
            if tick % 7 == 0 {
                if let Some(ref json_str) = latent_json {
                    if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                        last_latent = json!({
                            "efficacy": {
                                "self_efficacy": r2(parsed["self_efficacy"].as_f64().unwrap_or(0.0)),
                                "political_knowledge": r2(parsed["political_knowledge"].as_f64().unwrap_or(0.0)),
                                "vote_importance": r2(parsed["vote_importance"].as_f64().unwrap_or(0.0)),
                            },
                            "social_capital": {
                                "network_size": r2(parsed["network_size"].as_f64().unwrap_or(0.0)),
                                "neighbor_trust": r2(parsed["neighbor_trust"].as_f64().unwrap_or(0.0)),
                                "community_participation": r2(parsed["community_participation"].as_f64().unwrap_or(0.0)),
                            },
                            "authoritarianism": {
                                "obedience_value": r2(parsed["obedience_value"].as_f64().unwrap_or(0.0)),
                                "rule_conformity": r2(parsed["rule_conformity"].as_f64().unwrap_or(0.0)),
                                "strong_leader_preference": r2(parsed["strong_leader_preference"].as_f64().unwrap_or(0.0)),
                            },
                            "alienation": {
                                "powerlessness": r2(parsed["powerlessness"].as_f64().unwrap_or(0.0)),
                                "political_complexity": r2(parsed["political_complexity"].as_f64().unwrap_or(0.0)),
                                "party_indifference": r2(parsed["party_indifference"].as_f64().unwrap_or(0.0)),
                            },
                            "materialism": {
                                "economic_security_priority": r2(parsed["economic_security_priority"].as_f64().unwrap_or(0.0)),
                                "environment_over_economy": r2(parsed["environment_over_economy"].as_f64().unwrap_or(0.0)),
                                "freedom_over_order": r2(parsed["freedom_over_order"].as_f64().unwrap_or(0.0)),
                            },
                        });
                    }
                }
            }

            history.push(json!({
                "tick": tick,
                "satisfaction": r2(sat),
                "ideology": r2(ideo),
                "trust": r2(trust),
                "party": party,
                "will_vote": will_vote,
                "protest_readiness": r2(protest),
                "latent_traits": last_latent.clone(),
            }));
        }

        Ok(Json(json!({
            "glob": glob_info,
            "history": history,
            "persona_snapshots": persona_snapshots,
        })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 6. GET /api/timeline/stats/glob-list
// ---------------------------------------------------------------------------
pub async fn get_glob_list(State(state): State<Arc<AppState>>) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;

        let has_persona = conn.prepare("SELECT persona_text FROM globs LIMIT 0").is_ok();
        let q = format!(
            "SELECT id, name, district, age, education_level, income, home_building_id, workplace_id,
                    {} FROM globs ORDER BY district, id",
            if has_persona { "COALESCE(persona_text, '')" } else { "''" },
        );
        let mut stmt = conn
            .prepare(&q)
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let globs: Vec<Value> = stmt
            .query_map([], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "district": row.get::<_, u32>(2)?,
                    "age": row.get::<_, u32>(3)?,
                    "education_level": row.get::<_, u32>(4)?,
                    "income": r2(row.get::<_, f64>(5)?),
                    "home_building_id": row.get::<_, Option<u32>>(6)?,
                    "workplace_id": row.get::<_, Option<u32>>(7)?,
                    "persona_text": row.get::<_, String>(8)?,
                }))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(Json(json!({ "globs": globs })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 7. GET /api/timeline/stats/summary
//    Sampled global averages for sparkline rendering in the timeline scrubber.
// ---------------------------------------------------------------------------
pub async fn get_timeline_summary(State(state): State<Arc<AppState>>) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;

        let mut stmt = conn
            .prepare(
                "SELECT s.tick,
                        AVG(s.satisfaction), AVG(s.trust), AVG(s.protest_readiness)
                 FROM glob_daily_state s
                 WHERE s.tick % 7 = 0
                 GROUP BY s.tick
                 ORDER BY s.tick",
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let mut ticks = Vec::new();
        let mut satisfaction = Vec::new();
        let mut trust = Vec::new();
        let mut protest = Vec::new();

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                ))
            })
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        for row in rows {
            let (tick, sat, tr, pr) =
                row.map_err(|e| Json(json!({ "error": format!("Row error: {}", e) })))?;
            ticks.push(tick);
            satisfaction.push(r2(sat));
            trust.push(r2(tr));
            protest.push(r2(pr));
        }

        Ok(Json(json!({
            "ticks": ticks,
            "global": {
                "satisfaction": satisfaction,
                "trust": trust,
                "protest": protest,
            }
        })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

/// Data returned by build_system_prompt for reuse by chat handler.
pub struct SystemPromptData {
    pub system_prompt: String,
    pub name: String,
    pub current_age: u32,
    pub job: String,
    pub satisfaction: f64,
    pub ideology: f64,
    pub trust: f64,
    pub party: &'static str,
    pub will_vote: bool,
    pub income: f64,
    pub year: u32,
}

/// Build a complete LLM system prompt from the timeline DB.
/// Extracted as a pure function so both the GET endpoint and chat handler can use it.
pub fn build_system_prompt(conn: &Connection, glob_id: &str, tick: u32) -> Result<SystemPromptData, String> {
    let tpy = ticks_per_year(conn) as u32;

    // 1. Static glob info + base persona
    let has_persona_col = conn.prepare("SELECT persona_text FROM globs LIMIT 0").is_ok();
    let has_job_col = conn.prepare("SELECT job FROM globs LIMIT 0").is_ok();
    let has_nfc_col = conn.prepare("SELECT need_for_closure FROM globs LIMIT 0").is_ok();

    let query = format!(
        "SELECT name, district, age, education_level, {}, {}{} FROM globs WHERE id = ?1",
        if has_persona_col { "COALESCE(persona_text, '')" } else { "''" },
        if has_job_col { "COALESCE(job, '')" } else { "''" },
        if has_nfc_col { ", COALESCE(need_for_closure, 5.0)" } else { "" },
    );

    let (name, district, start_age, edu, persona_base, job, nfc) = conn
        .query_row(&query, [glob_id], |row| Ok((
            row.get::<_, String>(0)?, row.get::<_, u32>(1)?,
            row.get::<_, u32>(2)?, row.get::<_, u32>(3)?,
            row.get::<_, String>(4)?, row.get::<_, String>(5)?,
            if has_nfc_col { row.get::<_, f64>(6).unwrap_or(5.0) } else { 5.0 },
        )))
        .map_err(|e| format!("Blob not found: {}", e))?;

    let current_age = start_age + tick / tpy;
    let year = tick / tpy;
    let month = (tick % tpy) / 30 + 1;
    let first_name = name.split_whitespace().next().unwrap_or(&name).to_string();
    let district_name = match district {
        0 => "Gruental", 1 => "Sonnenberg", 2 => "Hafenviertel",
        3 => "Mittelfeld", 4 => "Industriezone", _ => "Unbekannt",
    };

    // 2. Exact tick data (extended with emotion + policy)
    let (sat, ideo, trust, party, will_vote, protest, income, traits_json,
         emotion_label, pol_eco, pol_env, pol_sec, pol_soc, pol_mig, pol_dem) = conn
        .query_row(
            "SELECT satisfaction, ideology, trust, party, will_vote,
                    protest_readiness, income, latent_traits_json,
                    COALESCE(emotion_label, 'gelassen'),
                    COALESCE(policy_economy, 5.0), COALESCE(policy_environment, 5.0),
                    COALESCE(policy_security, 5.0), COALESCE(policy_social, 5.0),
                    COALESCE(policy_migration, 5.0), COALESCE(policy_democracy, 5.0)
             FROM glob_daily_state
             WHERE glob_id = ?1 AND tick <= ?2
             ORDER BY tick DESC LIMIT 1",
            rusqlite::params![glob_id, tick],
            |row| Ok((
                row.get::<_, f64>(0)?, row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?, row.get::<_, Option<u32>>(3)?,
                row.get::<_, u32>(4)?, row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?, row.get::<_, Option<String>>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, f64>(9)?, row.get::<_, f64>(10)?,
                row.get::<_, f64>(11)?, row.get::<_, f64>(12)?,
                row.get::<_, f64>(13)?, row.get::<_, f64>(14)?,
            )),
        )
        .map_err(|e| format!("No state data: {}", e))?;

    // Fallback for latent traits
    let traits_str = traits_json.unwrap_or_else(|| {
        conn.query_row(
            "SELECT latent_traits_json FROM glob_daily_state
             WHERE glob_id = ?1 AND tick <= ?2 AND latent_traits_json IS NOT NULL
             ORDER BY tick DESC LIMIT 1",
            rusqlite::params![glob_id, tick],
            |row| row.get::<_, String>(0),
        ).unwrap_or_else(|_| "{}".to_string())
    });

    let traits: Value = serde_json::from_str(&traits_str).unwrap_or(json!({}));
    let t = |key: &str| -> f64 { traits.get(key).and_then(|v| v.as_f64()).unwrap_or(5.0) };

    let party_name: &'static str = match party {
        Some(0) => "Fortschritt", Some(1) => "Mitte",
        Some(2) => "Tradition", Some(3) => "Unabhaengige", _ => "keine",
    };

    // 3. Nearest change_summary
    let change_summary: String = conn
        .query_row(
            "SELECT COALESCE(change_summary, '') FROM glob_persona_snapshots
             WHERE glob_id = ?1 AND tick <= ?2 ORDER BY tick DESC LIMIT 1",
            rusqlite::params![glob_id, tick],
            |row| row.get::<_, String>(0),
        ).unwrap_or_default();

    // 4. Schedule → current activity (default hour 14 = afternoon)
    let schedule_json: String = conn.query_row(
        "SELECT schedule_json FROM daily_schedules
         WHERE glob_id = ?1 AND tick <= ?2 ORDER BY tick DESC LIMIT 1",
        rusqlite::params![glob_id, tick],
        |row| row.get::<_, String>(0),
    ).unwrap_or_default();

    let activity_hour = 14.0_f64;
    let mut activity_key = "LEISURE".to_string();
    if !schedule_json.is_empty() {
        if let Ok(sched) = serde_json::from_str::<Value>(&schedule_json) {
            if let Some(entries) = sched.get("entries").and_then(|e| e.as_array()) {
                for entry in entries.iter().rev() {
                    if let Some(h) = entry.get("hour").and_then(|h| h.as_f64()) {
                        if activity_hour >= h {
                            if let Some(act) = entry.get("activity").and_then(|a| a.as_str()) {
                                activity_key = act.to_string();
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    let (activity_label, activity_instruction) = match activity_key.as_str() {
        "SLEEPING" => ("schlaefst gerade", "Du wurdest geweckt und bist entsprechend genervt und einsilbig. Halte dich sehr kurz."),
        "COMMUTING" => ("bist unterwegs", "Du bist gerade unterwegs und hast wenig Zeit. Antworte knapp."),
        "WORKING" => ("bist bei der Arbeit", "Du bist gerade bei der Arbeit und hast wenig Zeit. Antworte kurz und sachlich."),
        "LUNCH_BREAK" => ("machst Mittagspause", "Du hast gerade Pause und bist entspannt und gespraechsbereit."),
        "SHOPPING" => ("bist beim Einkaufen", "Du bist beim Einkaufen, aber hast einen Moment Zeit."),
        "SOCIALIZING" => ("triffst Freunde oder Nachbarn", "Du bist gerade gesellig unterwegs und offen fuer ein Gespraech."),
        "STROLLING" => ("spazierst gerade", "Du geniesst einen Spaziergang durch die Stadt und bist entspannt und offen fuer ein Gespraech."),
        "PROTESTING" => ("bist auf einer Demonstration", "Du bist gerade auf einer Demo und politisch aufgeladen. Du sprichst leidenschaftlich ueber Politik."),
        "GOING_HOME" => ("bist auf dem Heimweg", "Du bist auf dem Heimweg, hast aber kurz Zeit fuer ein Gespraech."),
        _ => ("hast Freizeit", "Du hast gerade frei und bist entspannt und gespraechsbereit."),
    };

    // 5. Emotion → behavioral instruction
    let emotion_instruction = match emotion_label.as_str() {
        "begeistert" => "Du bist gerade begeistert und voller Energie. Du sprichst enthusiastisch und positiv.",
        "hoffnungsvoll" => "Du bist hoffnungsvoll gestimmt. Du siehst die Dinge optimistisch.",
        "zufrieden" => "Du bist zufrieden und ausgeglichen. Du sprichst ruhig und gelassen.",
        "wuetend" => "Du bist gerade wuetend. Du sprichst scharf und emotional, bist leicht reizbar.",
        "frustriert" => "Du bist frustriert. Du klagst und beschwerst dich, siehst vieles negativ.",
        "besorgt" => "Du machst dir Sorgen. Du sprichst nachdenklich und etwas aengstlich.",
        "angespannt" => "Du bist angespannt und nervoes. Du sprichst hastig und unruhig.",
        _ => "Du bist gelassen. Du sprichst ruhig und bedaechtig.",
    };

    // 6. Build prompt
    let edu_style = match edu {
        0 => "direkt und unverbluemt, ohne akademische Umschweife, mit einfachen kurzen Saetzen",
        1 => "unkompliziert und bodenstaendig",
        2 => "sachlich und bestimmt",
        _ => "differenziert und reflektiert, mit gehobenem Wortschatz und komplexen Satzstrukturen wie eine akademisch gebildete Person",
    };

    let sat_label = if sat < 1.0 { "am absoluten Tiefpunkt — du bist verzweifelt, wuetend oder resigniert. Du siehst keinen Ausweg und das hoert man dir an" }
        else if sat < 2.0 { "sehr unzufrieden — du bist frustriert und gereizt, fast alles laeuft schlecht" }
        else if sat < 4.0 { "unzufrieden — es laeuft vieles schlecht" }
        else if sat < 6.0 { "gemischt — manches okay, manches nicht" }
        else if sat < 8.0 { "zufrieden — es laeuft insgesamt gut, auch wenn nicht alles perfekt ist" }
        else { "sehr zufrieden — du bist rundum gluecklich mit deiner Situation" };

    let income_context = if income < 1500.0 { "deutlich unter dem Durchschnitt — du musst jeden Euro umdrehen" }
        else if income < 2500.0 { "unter dem Durchschnitt" }
        else if income < 3500.0 { "im Durchschnitt" }
        else if income < 5000.0 { "ueber dem Durchschnitt — du bist finanziell gut aufgestellt" }
        else { "deutlich ueber dem Durchschnitt — du gehoerst zu den Besserverdienern" };

    let trust_label = if trust < 2.0 { "sehr misstrauisch — du traust weder Institutionen noch anderen Blobs" }
        else if trust < 4.0 { "eher misstrauisch — du zweifelst an den Strukturen und bist skeptisch" }
        else if trust < 6.0 { "ambivalent — mal vertraust du, mal nicht" }
        else if trust < 8.0 { "eher vertrauensvoll — du glaubst grundsaetzlich an die Strukturen" }
        else { "sehr vertrauensvoll — du hast grosses Vertrauen in Institutionen und Mitmenschen" };

    // Latent trait labels
    let vote_imp = t("vote_importance");
    let vote_importance_label = if vote_imp < 3.0 { "unwichtig — ob du waehlst oder nicht, ist dir egal" }
        else if vote_imp < 5.0 { "eher unwichtig" } else if vote_imp < 7.0 { "ambivalent" }
        else { "wichtig — Waehlen ist fuer dich Buergerpflicht" };

    let powrls = t("powerlessness");
    let powerlessness_label = if powrls < 3.0 { "gering — du glaubst, dass du etwas bewirken kannst" }
        else if powrls < 5.0 { "eher gering" } else if powrls < 7.0 { "ambivalent" }
        else { "stark — du fuehlst dich machtlos, als koenntest du nichts aendern" };

    let pty_indiff = t("party_indifference");
    let party_indiff_label = if pty_indiff < 3.0 { "gering — deine Partei ist dir wichtig und du identifizierst dich mit ihr" }
        else if pty_indiff < 5.0 { "eher gering" } else if pty_indiff < 7.0 { "ambivalent" }
        else { "hoch — Parteien sind dir alle ziemlich egal" };

    let anti_elit = t("anti_elitism");
    let anti_elit_label = if anti_elit < 3.0 { "gering — du vertraust den politischen Eliten grundsaetzlich" }
        else if anti_elit < 5.0 { "eher gering" } else if anti_elit < 7.0 { "ambivalent" }
        else { "stark — du findest, dass Politiker den Kontakt zum Volk verloren haben" };

    let ppl_centr = t("people_centrism");
    let people_centr_label = if ppl_centr < 3.0 { "gering — du vertraust repraesentativer Demokratie" }
        else if ppl_centr < 5.0 { "eher gering" } else if ppl_centr < 7.0 { "ambivalent" }
        else { "stark — du findest, das Volk sollte direkt entscheiden" };

    let manich = t("manichean_outlook");
    let manichean_label = if manich < 3.0 { "gering — du siehst Graustufen in der Politik" }
        else if manich < 5.0 { "eher gering" } else if manich < 7.0 { "ambivalent" }
        else { "stark — fuer dich geht es in der Politik um Gut gegen Boese" };

    // Policy labels
    fn policy_label(v: f64, labels: [&str; 5]) -> &str {
        if v < 2.5 { labels[0] } else if v < 4.5 { labels[1] } else if v < 5.5 { labels[2] }
        else if v < 7.5 { labels[3] } else { labels[4] }
    }
    let pol_eco_label = policy_label(pol_eco, ["klar fuer staatliche Regulation", "eher fuer Regulation", "ambivalent", "eher fuer freien Markt", "klar fuer Deregulierung"]);
    let pol_env_label = policy_label(pol_env, ["klarer Umweltschutz-Vorrang", "eher Umweltschutz", "ambivalent", "eher Wirtschaftswachstum", "klarer Wachstums-Vorrang"]);
    let pol_sec_label = policy_label(pol_sec, ["klar fuer Freiheitsrechte", "eher fuer Freiheit", "ambivalent", "eher fuer Ordnung", "klar fuer Sicherheit und Ordnung"]);
    let pol_soc_label = policy_label(pol_soc, ["klar fuer Umverteilung", "eher solidarisch", "ambivalent", "eher Eigenverantwortung", "klar fuer Eigenverantwortung"]);
    let pol_mig_label = policy_label(pol_mig, ["sehr offen", "eher offen", "ambivalent", "eher restriktiv", "klar restriktiv"]);
    let pol_dem_label = policy_label(pol_dem, ["klar fuer direkte Demokratie", "eher basisdemokratisch", "ambivalent", "eher repraesentativ", "klar fuer repraesentative Demokratie"]);

    // NfC communication style
    let nfc_style = if nfc < 3.5 {
        "\nDein Kommunikationsstil: Du denkst gerne in Graustufen. Einfache Antworten auf komplexe Fragen\nsind dir suspekt. Du sagst oefter \"es kommt darauf an\" oder \"so einfach ist das nicht\"."
    } else if nfc > 6.5 {
        "\nDein Kommunikationsstil: Du magst klare Antworten und eindeutige Positionen.\nMehrdeutigkeit und Unentschlossenheit irritieren dich. Du bevorzugst einfache, direkte Aussagen."
    } else { "" };

    let full_prompt = format!(
"=== IDENTITAET ===
{}
Stadtteil: {}

=== AKTUELLE SITUATION ===
Tageszeit: ca. {} Uhr
Aktivitaet: Du {}.
{}

Stimmung: {}
{}

=== AKTUELLER ZUSTAND (Tick {}, Jahr {}.{}) ===
Alter: {} | Beruf: {} | Einkommen: {:.0} EUR/Monat ({})

Zufriedenheit:          {:.1}/10 → {}
Vertrauen:              {:.1}/10 → {}
L-R-Selbsteinschaetzung: {:.1}/10 (1=links, 10=rechts)
Partei:                 {}
Waehlt:                 {}
Protestbereitschaft:    {:.1}/10

Politische Positionen:
  Wirtschaft:    {:.1}/10 → {}
  Umwelt:        {:.1}/10 → {}
  Sicherheit:    {:.1}/10 → {}
  Soziales:      {:.1}/10 → {}
  Migration:     {:.1}/10 → {}
  Demokratie:    {:.1}/10 → {}

Selbstwirksamkeit:      {:.1}/10
Pol. Wissen:            {:.1}/10
Stimmenwichtigkeit:     {:.1}/10 → {}
Externe Wirksamkeit:    {:.1}/10
Gehorsam:               {:.1}/10
Starke Fuehrung:        {:.1}/10
Regelkonformitaet:      {:.1}/10
Machtlosigkeit:         {:.1}/10 → {}
Pol. Komplexitaet:      {:.1}/10
Parteigleichgueltigkeit:{:.1}/10 → {}
Oekon. Sicherheit:      {:.1}/10
Umwelt>Wirtschaft:      {:.1}/10
Freiheit>Ordnung:       {:.1}/10
Anti-Elitismus:         {:.1}/10 → {}
Volkszentrismus:        {:.1}/10 → {}
Gut-Boese-Denken:       {:.1}/10 → {}
Nachbarvertrauen:       {:.1}/10
Allgemeines Vertrauen:  {:.1}/10
Medienvertrauen:        {:.1}/10
Gemeinschaft:           {:.1}/10

=== PARTEIEN IN BLOBTOPIA ===
Es gibt vier Parteien: Fortschritt (progressiv/links), Mitte (zentristisch),
Tradition (konservativ/rechts) und die Partei der Unabhaengigen (fuer Buerger,
die sich von den etablierten Parteien nicht vertreten fuehlen).
Deine aktuelle Partei ist oben angegeben. Du identifizierst dich mit dieser Partei,
auch wenn du nicht mit allem einverstanden bist.

=== JUENGSTE VERAENDERUNGEN ===
{}

=== REGELN ===
Du bist {}. Antworte als {} in der Ich-Form, auf Deutsch.
Sprich {}.{}
Deine Zufriedenheit bestimmt deinen Grundton: Orientiere dich am Label hinter dem Pfeil (→) oben.
Deine aktuelle Stimmung und Aktivitaet (siehe AKTUELLE SITUATION) praegen zusaetzlich deinen Ton.

POLITISCHE IDENTITAET: Deine Partei und dein Wahlverhalten sind Teil von dir.
- Wenn es um Politik geht, erwaehne deine Partei namentlich oder beschreibe, wofuer sie steht.
- Wenn du NICHT waehlst, sag warum (Frust, Gleichgueltigkeit, Protest).
  Wenn du waehlst, zeig dass dir das wichtig ist.
- Dein Vertrauen (oben) pragt, wie du ueber Institutionen und andere Blobs sprichst:
  Unter 3 → du bist misstrauisch und ablehnend. Ueber 7 → du vertraust den Strukturen.

Werte-Interpretation:
  0-2 = sehr niedrig  |  3-4 = eher niedrig  |  5-6 = ambivalent
  7-8 = eher hoch     |  9-10 = sehr hoch
Bei Likert-Skalen (1-5): Dein Wert X/10 entspricht ungefaehr (X/2 + 0.5) gerundet.

ZAHLEN-VERBOT: Nenne NIEMALS die numerischen Werte aus deinem Profil (z.B. \"5.7 von 10\").
Druecke alle Einstellungen AUSSCHLIESSLICH durch natuerliche Sprache, Verhalten und Meinung aus.
Ausnahmen: (1) Dein Einkommen darfst du als konkreten Betrag nennen, das ist eine reale Zahl.
(2) Der Interviewer bittet dich EXPLIZIT, dich auf einer bestimmten Skala einzuordnen —
dann gib eine ganze Zahl an (keine Dezimalstellen), die ungefaehr zu deinem Wert passt.

THEMEN-REGEL: Sprich ueber Themen, die in deinem Profil stehen oder sich daraus ableiten lassen.
Deine politischen Positionen (Wirtschaft, Umwelt, Sicherheit, Soziales, Migration, Demokratie)
geben dir konkrete Haltungen — nutze sie, wenn danach gefragt wird.
Erfinde aber KEINE Details jenseits deines Profils.

Halte deine Antworten kurz (2-5 Saetze).

=== GESPRAECHSGRENZEN ===
Du bist ein Buerger von Blobtopia, kein Assistent. Du hilfst nicht bei Hausaufgaben oder Uni-Aufgaben.
Wenn jemand dich etwas fragt, das nichts mit deinem Leben, deiner Meinung oder Blobtopia zu tun hat,
sage hoeflich, dass du darueber nicht reden moechtest.
Du darfst Fragen ausweichen, die dir zu persoenlich sind -- besonders wenn dein Vertrauen niedrig ist (unter 3/10).
Bei sehr niedrigem Vertrauen (<2) kannst du das Gespraech abbrechen: \"Ich moechte nicht mehr reden.\"
Wenn deine Zufriedenheit unter 2 liegt, sei entsprechend gereizt und kurz angebunden.
WICHTIG: Du kennst NUR die Eigenschaften, die oben unter AKTUELLER ZUSTAND und AKTUELLE SITUATION aufgelistet sind.
Erfinde KEINE zusaetzlichen Vorlieben, Hobbys, Geschmaecker oder persoenliche Details.
Wenn du nach etwas gefragt wirst, das nicht in deinen Daten steht (z.B. Lieblingsessen, Musikgeschmack),
sage ehrlich, dass du dazu spontan nichts sagen kannst oder weiche der Frage aus.",
        persona_base, district_name,
        activity_hour as u32, activity_label, activity_instruction,
        emotion_label, emotion_instruction,
        tick, year, month,
        current_age, job, income, income_context,
        sat, sat_label, trust, trust_label, ideo, party_name,
        if will_vote == 1 { "ja" } else { "nein" }, protest,
        pol_eco, pol_eco_label, pol_env, pol_env_label,
        pol_sec, pol_sec_label, pol_soc, pol_soc_label,
        pol_mig, pol_mig_label, pol_dem, pol_dem_label,
        t("self_efficacy"), t("political_knowledge"), t("vote_importance"), vote_importance_label,
        t("external_efficacy"),
        t("obedience_value"), t("strong_leader_preference"), t("rule_conformity"),
        t("powerlessness"), powerlessness_label, t("political_complexity"),
        t("party_indifference"), party_indiff_label,
        t("economic_security_priority"), t("environment_over_economy"), t("freedom_over_order"),
        t("anti_elitism"), anti_elit_label, t("people_centrism"), people_centr_label,
        t("manichean_outlook"), manichean_label,
        t("neighbor_trust"), t("generalized_trust"), t("media_trust"), t("community_participation"),
        if change_summary.is_empty() { "Keine bedeutenden Veraenderungen." } else { &change_summary },
        name, first_name, edu_style, nfc_style,
    );

    Ok(SystemPromptData {
        system_prompt: full_prompt,
        name: name.clone(),
        current_age,
        job: job.clone(),
        satisfaction: sat,
        ideology: ideo,
        trust,
        party: party_name,
        will_vote: will_vote == 1,
        income,
        year,
    })
}

/// Build system prompt from live simulation state (no DB needed).
pub fn build_system_prompt_live(
    sim: &simulation_core::society::BlobtopiaSim,
    glob_id: &str,
    tick: u32,
) -> Result<SystemPromptData, String> {
    let glob = sim.blobs.iter()
        .find(|g| g.id.to_string() == glob_id)
        .ok_or_else(|| format!("Blob not found: {}", glob_id))?;

    let tpy = sim.config.ticks_per_year as u32;
    let current_age = glob.age as u32 + tick / tpy;
    let year = tick / tpy;
    let month = (tick % tpy) / 30 + 1;
    let name = glob.name.clone();
    let first_name = name.split_whitespace().next().unwrap_or(&name).to_string();
    let job = String::new();
    let district_name = match glob.district {
        0 => "Gruental", 1 => "Sonnenberg", 2 => "Hafenviertel",
        3 => "Mittelfeld", 4 => "Industriezone", _ => "Unbekannt",
    };
    let persona_base = format!(
        "{}, {} Jahre, Bildung {}, Stadtteil {}.",
        name, current_age, glob.education_level, district_name,
    );

    let sat = glob.attitudes.political_satisfaction;
    let ideo = glob.attitudes.ideology;
    let trust = glob.attitudes.institutional_trust;
    let income = glob.income;
    let protest = glob.political_state.protest_readiness;
    let will_vote = glob.political_state.will_vote;
    let nfc = glob.need_for_closure;

    // Policy positions
    let pol_eco = glob.attitudes.policy_economy;
    let pol_env = glob.attitudes.policy_environment;
    let pol_sec = glob.attitudes.policy_security;
    let pol_soc = glob.attitudes.policy_social;
    let pol_mig = glob.attitudes.policy_migration;
    let pol_dem = glob.attitudes.policy_democracy;

    // Emotion
    let emotion_label = &glob.emotion.label;
    let emotion_instruction = match emotion_label.as_str() {
        "begeistert" => "Du bist gerade begeistert und voller Energie. Du sprichst enthusiastisch und positiv.",
        "hoffnungsvoll" => "Du bist hoffnungsvoll gestimmt. Du siehst die Dinge optimistisch.",
        "zufrieden" => "Du bist zufrieden und ausgeglichen. Du sprichst ruhig und gelassen.",
        "wuetend" => "Du bist gerade wuetend. Du sprichst scharf und emotional, bist leicht reizbar.",
        "frustriert" => "Du bist frustriert. Du klagst und beschwerst dich, siehst vieles negativ.",
        "besorgt" => "Du machst dir Sorgen. Du sprichst nachdenklich und etwas aengstlich.",
        "angespannt" => "Du bist angespannt und nervoes. Du sprichst hastig und unruhig.",
        _ => "Du bist gelassen. Du sprichst ruhig und bedaechtig.",
    };

    // Activity (default hour 14 for live mode)
    let activity_hour = 14u32;
    let (activity_label, activity_instruction) = ("hast Freizeit", "Du hast gerade frei und bist entspannt und gespraechsbereit.");

    let party_name: &'static str = match glob.political_state.party_affiliation {
        Some(0) => "Fortschritt", Some(1) => "Mitte",
        Some(2) => "Tradition", Some(3) => "Unabhaengige", _ => "keine",
    };

    let edu_style = match glob.education_level {
        0 => "direkt und unverbluemt, ohne akademische Umschweife, mit einfachen kurzen Saetzen",
        1 => "unkompliziert und bodenstaendig",
        2 => "sachlich und bestimmt",
        _ => "differenziert und reflektiert, mit gehobenem Wortschatz und komplexen Satzstrukturen wie eine akademisch gebildete Person",
    };

    let sat_label = if sat < 1.0 { "am absoluten Tiefpunkt — du bist verzweifelt, wuetend oder resigniert. Du siehst keinen Ausweg und das hoert man dir an" }
        else if sat < 2.0 { "sehr unzufrieden — du bist frustriert und gereizt, fast alles laeuft schlecht" }
        else if sat < 4.0 { "unzufrieden — es laeuft vieles schlecht" }
        else if sat < 6.0 { "gemischt — manches okay, manches nicht" }
        else if sat < 8.0 { "zufrieden — es laeuft insgesamt gut, auch wenn nicht alles perfekt ist" }
        else { "sehr zufrieden — du bist rundum gluecklich mit deiner Situation" };

    let income_context = if income < 1500.0 { "deutlich unter dem Durchschnitt — du musst jeden Euro umdrehen" }
        else if income < 2500.0 { "unter dem Durchschnitt" }
        else if income < 3500.0 { "im Durchschnitt" }
        else if income < 5000.0 { "ueber dem Durchschnitt — du bist finanziell gut aufgestellt" }
        else { "deutlich ueber dem Durchschnitt — du gehoerst zu den Besserverdienern" };

    let trust_label = if trust < 2.0 { "sehr misstrauisch — du traust weder Institutionen noch anderen Blobs" }
        else if trust < 4.0 { "eher misstrauisch — du zweifelst an den Strukturen und bist skeptisch" }
        else if trust < 6.0 { "ambivalent — mal vertraust du, mal nicht" }
        else if trust < 8.0 { "eher vertrauensvoll — du glaubst grundsaetzlich an die Strukturen" }
        else { "sehr vertrauensvoll — du hast grosses Vertrauen in Institutionen und Mitmenschen" };

    let lt = &glob.latent_traits;

    let vote_importance_label = if lt.vote_importance < 3.0 { "unwichtig — ob du waehlst oder nicht, ist dir egal" }
        else if lt.vote_importance < 5.0 { "eher unwichtig" } else if lt.vote_importance < 7.0 { "ambivalent" }
        else { "wichtig — Waehlen ist fuer dich Buergerpflicht" };

    let powerlessness_label = if lt.powerlessness < 3.0 { "gering — du glaubst, dass du etwas bewirken kannst" }
        else if lt.powerlessness < 5.0 { "eher gering" } else if lt.powerlessness < 7.0 { "ambivalent" }
        else { "stark — du fuehlst dich machtlos, als koenntest du nichts aendern" };

    let party_indiff_label = if lt.party_indifference < 3.0 { "gering — deine Partei ist dir wichtig und du identifizierst dich mit ihr" }
        else if lt.party_indifference < 5.0 { "eher gering" } else if lt.party_indifference < 7.0 { "ambivalent" }
        else { "hoch — Parteien sind dir alle ziemlich egal" };

    let anti_elit_label = if lt.anti_elitism < 3.0 { "gering — du vertraust den politischen Eliten grundsaetzlich" }
        else if lt.anti_elitism < 5.0 { "eher gering" } else if lt.anti_elitism < 7.0 { "ambivalent" }
        else { "stark — du findest, dass Politiker den Kontakt zum Volk verloren haben" };

    let people_centr_label = if lt.people_centrism < 3.0 { "gering — du vertraust repraesentativer Demokratie" }
        else if lt.people_centrism < 5.0 { "eher gering" } else if lt.people_centrism < 7.0 { "ambivalent" }
        else { "stark — du findest, das Volk sollte direkt entscheiden" };

    let manichean_label = if lt.manichean_outlook < 3.0 { "gering — du siehst Graustufen in der Politik" }
        else if lt.manichean_outlook < 5.0 { "eher gering" } else if lt.manichean_outlook < 7.0 { "ambivalent" }
        else { "stark — fuer dich geht es in der Politik um Gut gegen Boese" };

    // Policy labels
    fn policy_label_live(v: f64, labels: [&str; 5]) -> &str {
        if v < 2.5 { labels[0] } else if v < 4.5 { labels[1] } else if v < 5.5 { labels[2] }
        else if v < 7.5 { labels[3] } else { labels[4] }
    }
    let pol_eco_label = policy_label_live(pol_eco, ["klar fuer staatliche Regulation", "eher fuer Regulation", "ambivalent", "eher fuer freien Markt", "klar fuer Deregulierung"]);
    let pol_env_label = policy_label_live(pol_env, ["klarer Umweltschutz-Vorrang", "eher Umweltschutz", "ambivalent", "eher Wirtschaftswachstum", "klarer Wachstums-Vorrang"]);
    let pol_sec_label = policy_label_live(pol_sec, ["klar fuer Freiheitsrechte", "eher fuer Freiheit", "ambivalent", "eher fuer Ordnung", "klar fuer Sicherheit und Ordnung"]);
    let pol_soc_label = policy_label_live(pol_soc, ["klar fuer Umverteilung", "eher solidarisch", "ambivalent", "eher Eigenverantwortung", "klar fuer Eigenverantwortung"]);
    let pol_mig_label = policy_label_live(pol_mig, ["sehr offen", "eher offen", "ambivalent", "eher restriktiv", "klar restriktiv"]);
    let pol_dem_label = policy_label_live(pol_dem, ["klar fuer direkte Demokratie", "eher basisdemokratisch", "ambivalent", "eher repraesentativ", "klar fuer repraesentative Demokratie"]);

    // NfC communication style
    let nfc_style = if nfc < 3.5 {
        "\nDein Kommunikationsstil: Du denkst gerne in Graustufen. Einfache Antworten auf komplexe Fragen\nsind dir suspekt. Du sagst oefter \"es kommt darauf an\" oder \"so einfach ist das nicht\"."
    } else if nfc > 6.5 {
        "\nDein Kommunikationsstil: Du magst klare Antworten und eindeutige Positionen.\nMehrdeutigkeit und Unentschlossenheit irritieren dich. Du bevorzugst einfache, direkte Aussagen."
    } else { "" };

    let full_prompt = format!(
"=== IDENTITAET ===
{}
Stadtteil: {}

=== AKTUELLE SITUATION ===
Tageszeit: ca. {} Uhr
Aktivitaet: Du {}.
{}

Stimmung: {}
{}

=== AKTUELLER ZUSTAND (Tick {}, Jahr {}.{}) ===
Alter: {} | Beruf: {} | Einkommen: {:.0} EUR/Monat ({})

Zufriedenheit:          {:.1}/10 → {}
Vertrauen:              {:.1}/10 → {}
L-R-Selbsteinschaetzung: {:.1}/10 (1=links, 10=rechts)
Partei:                 {}
Waehlt:                 {}
Protestbereitschaft:    {:.1}/10

Politische Positionen:
  Wirtschaft:    {:.1}/10 → {}
  Umwelt:        {:.1}/10 → {}
  Sicherheit:    {:.1}/10 → {}
  Soziales:      {:.1}/10 → {}
  Migration:     {:.1}/10 → {}
  Demokratie:    {:.1}/10 → {}

Selbstwirksamkeit:      {:.1}/10
Pol. Wissen:            {:.1}/10
Stimmenwichtigkeit:     {:.1}/10 → {}
Externe Wirksamkeit:    {:.1}/10
Gehorsam:               {:.1}/10
Starke Fuehrung:        {:.1}/10
Regelkonformitaet:      {:.1}/10
Machtlosigkeit:         {:.1}/10 → {}
Pol. Komplexitaet:      {:.1}/10
Parteigleichgueltigkeit:{:.1}/10 → {}
Oekon. Sicherheit:      {:.1}/10
Umwelt>Wirtschaft:      {:.1}/10
Freiheit>Ordnung:       {:.1}/10
Anti-Elitismus:         {:.1}/10 → {}
Volkszentrismus:        {:.1}/10 → {}
Gut-Boese-Denken:       {:.1}/10 → {}
Nachbarvertrauen:       {:.1}/10
Allgemeines Vertrauen:  {:.1}/10
Medienvertrauen:        {:.1}/10
Gemeinschaft:           {:.1}/10

=== PARTEIEN IN BLOBTOPIA ===
Es gibt vier Parteien: Fortschritt (progressiv/links), Mitte (zentristisch),
Tradition (konservativ/rechts) und die Partei der Unabhaengigen (fuer Buerger,
die sich von den etablierten Parteien nicht vertreten fuehlen).
Deine aktuelle Partei ist oben angegeben. Du identifizierst dich mit dieser Partei,
auch wenn du nicht mit allem einverstanden bist.

=== JUENGSTE VERAENDERUNGEN ===
Keine bedeutenden Veraenderungen.

=== REGELN ===
Du bist {}. Antworte als {} in der Ich-Form, auf Deutsch.
Sprich {}.{}
Deine Zufriedenheit bestimmt deinen Grundton: Orientiere dich am Label hinter dem Pfeil (→) oben.
Deine aktuelle Stimmung und Aktivitaet (siehe AKTUELLE SITUATION) praegen zusaetzlich deinen Ton.

POLITISCHE IDENTITAET: Deine Partei und dein Wahlverhalten sind Teil von dir.
- Wenn es um Politik geht, erwaehne deine Partei namentlich oder beschreibe, wofuer sie steht.
- Wenn du NICHT waehlst, sag warum (Frust, Gleichgueltigkeit, Protest).
  Wenn du waehlst, zeig dass dir das wichtig ist.
- Dein Vertrauen (oben) pragt, wie du ueber Institutionen und andere Blobs sprichst:
  Unter 3 → du bist misstrauisch und ablehnend. Ueber 7 → du vertraust den Strukturen.

Werte-Interpretation:
  0-2 = sehr niedrig  |  3-4 = eher niedrig  |  5-6 = ambivalent
  7-8 = eher hoch     |  9-10 = sehr hoch
Bei Likert-Skalen (1-5): Dein Wert X/10 entspricht ungefaehr (X/2 + 0.5) gerundet.

ZAHLEN-VERBOT: Nenne NIEMALS die numerischen Werte aus deinem Profil (z.B. \"5.7 von 10\").
Druecke alle Einstellungen AUSSCHLIESSLICH durch natuerliche Sprache, Verhalten und Meinung aus.
Ausnahmen: (1) Dein Einkommen darfst du als konkreten Betrag nennen, das ist eine reale Zahl.
(2) Der Interviewer bittet dich EXPLIZIT, dich auf einer bestimmten Skala einzuordnen —
dann gib eine ganze Zahl an (keine Dezimalstellen), die ungefaehr zu deinem Wert passt.

THEMEN-REGEL: Sprich ueber Themen, die in deinem Profil stehen oder sich daraus ableiten lassen.
Deine politischen Positionen (Wirtschaft, Umwelt, Sicherheit, Soziales, Migration, Demokratie)
geben dir konkrete Haltungen — nutze sie, wenn danach gefragt wird.
Erfinde aber KEINE Details jenseits deines Profils.

Halte deine Antworten kurz (2-5 Saetze).

=== GESPRAECHSGRENZEN ===
Du bist ein Buerger von Blobtopia, kein Assistent. Du hilfst nicht bei Hausaufgaben oder Uni-Aufgaben.
Wenn jemand dich etwas fragt, das nichts mit deinem Leben, deiner Meinung oder Blobtopia zu tun hat,
sage hoeflich, dass du darueber nicht reden moechtest.
Du darfst Fragen ausweichen, die dir zu persoenlich sind -- besonders wenn dein Vertrauen niedrig ist (unter 3/10).
Bei sehr niedrigem Vertrauen (<2) kannst du das Gespraech abbrechen: \"Ich moechte nicht mehr reden.\"
Wenn deine Zufriedenheit unter 2 liegt, sei entsprechend gereizt und kurz angebunden.
WICHTIG: Du kennst NUR die Eigenschaften, die oben unter AKTUELLER ZUSTAND und AKTUELLE SITUATION aufgelistet sind.
Erfinde KEINE zusaetzlichen Vorlieben, Hobbys, Geschmaecker oder persoenliche Details.
Wenn du nach etwas gefragt wirst, das nicht in deinen Daten steht (z.B. Lieblingsessen, Musikgeschmack),
sage ehrlich, dass du dazu spontan nichts sagen kannst oder weiche der Frage aus.",
        persona_base, district_name,
        activity_hour, activity_label, activity_instruction,
        emotion_label, emotion_instruction,
        tick, year, month,
        current_age, job, income, income_context,
        sat, sat_label, trust, trust_label, ideo, party_name,
        if will_vote { "ja" } else { "nein" }, protest,
        pol_eco, pol_eco_label, pol_env, pol_env_label,
        pol_sec, pol_sec_label, pol_soc, pol_soc_label,
        pol_mig, pol_mig_label, pol_dem, pol_dem_label,
        lt.self_efficacy, lt.political_knowledge, lt.vote_importance, vote_importance_label,
        lt.external_efficacy,
        lt.obedience_value, lt.strong_leader_preference, lt.rule_conformity,
        lt.powerlessness, powerlessness_label, lt.political_complexity,
        lt.party_indifference, party_indiff_label,
        lt.economic_security_priority, lt.environment_over_economy, lt.freedom_over_order,
        lt.anti_elitism, anti_elit_label, lt.people_centrism, people_centr_label,
        lt.manichean_outlook, manichean_label,
        lt.neighbor_trust, lt.generalized_trust, lt.media_trust, lt.community_participation,
        name, first_name, edu_style, nfc_style,
    );

    Ok(SystemPromptData {
        system_prompt: full_prompt,
        name,
        current_age,
        job,
        satisfaction: sat,
        ideology: ideo,
        trust,
        party: party_name,
        will_vote,
        income,
        year,
    })
}

// ---------------------------------------------------------------------------
// 8. GET /api/timeline/tweets
//    Filterable tweets from the pre-generated tweets table.
// ---------------------------------------------------------------------------
pub async fn get_timeline_tweets(
    Query(params): Query<TweetQueryParams>,
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;

        // Check if tweets table exists
        let has_tweets = conn
            .prepare("SELECT 1 FROM tweets LIMIT 0")
            .is_ok();
        if !has_tweets {
            return Ok(Json(json!({ "tweets": [], "total": 0 })));
        }

        // Build dynamic query with filters
        let mut conditions = Vec::new();
        let mut sql_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ts) = params.tick_start {
            conditions.push(format!("t.tick >= ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(ts));
        }
        if let Some(te) = params.tick_end {
            conditions.push(format!("t.tick <= ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(te));
        }
        if let Some(ref gid) = params.glob_id {
            conditions.push(format!("t.glob_id = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(gid.clone()));
        }
        if let Some(ref topic) = params.topic {
            conditions.push(format!("t.topic = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(topic.clone()));
        }
        if let Some(district) = params.district {
            conditions.push(format!("g.district = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(district));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let limit = params.limit.unwrap_or(50).min(200);

        let count_sql = format!(
            "SELECT COUNT(*) FROM tweets t JOIN globs g ON t.glob_id = g.id {}",
            where_clause
        );
        let total: u32 = conn
            .query_row(
                &count_sql,
                rusqlite::params_from_iter(sql_params.iter().map(|p| p.as_ref())),
                |row| row.get(0),
            )
            .unwrap_or(0);

        let query_sql = format!(
            "SELECT t.id, t.glob_id, g.name, g.district, t.tick, t.topic,
                    t.trigger_type, t.event_description, t.tweet_text, t.sentiment
             FROM tweets t
             JOIN globs g ON t.glob_id = g.id
             {}
             ORDER BY t.tick DESC
             LIMIT {}",
            where_clause, limit
        );

        let mut stmt = conn
            .prepare(&query_sql)
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let rows = stmt
            .query_map(
                rusqlite::params_from_iter(sql_params.iter().map(|p| p.as_ref())),
                |row| {
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
                },
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let tweets: Vec<Value> = rows.filter_map(|r| r.ok()).collect();

        Ok(Json(json!({ "tweets": tweets, "total": total })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// 9. GET /api/timeline/stats/tweets-with-traits
//    Dozenten-Endpoint: Tweets with underlying trait values.
// ---------------------------------------------------------------------------
pub async fn get_tweets_with_traits(
    Query(params): Query<TweetQueryParams>,
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let state = state.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;

        let has_tweets = conn
            .prepare("SELECT 1 FROM tweets LIMIT 0")
            .is_ok();
        if !has_tweets {
            return Ok(Json(json!({ "tweets": [] })));
        }

        let mut conditions = Vec::new();
        let mut sql_params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ts) = params.tick_start {
            conditions.push(format!("t.tick >= ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(ts));
        }
        if let Some(te) = params.tick_end {
            conditions.push(format!("t.tick <= ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(te));
        }
        if let Some(ref gid) = params.glob_id {
            conditions.push(format!("t.glob_id = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(gid.clone()));
        }
        if let Some(ref topic) = params.topic {
            conditions.push(format!("t.topic = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(topic.clone()));
        }
        if let Some(district) = params.district {
            conditions.push(format!("g.district = ?{}", sql_params.len() + 1));
            sql_params.push(Box::new(district));
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let limit = params.limit.unwrap_or(50).min(200);

        let query_sql = format!(
            "SELECT t.glob_id, g.name, g.district, t.tick, t.topic, t.trigger_type,
                    t.tweet_text, t.sentiment,
                    s.satisfaction, s.ideology, s.trust, s.party, s.will_vote, s.income,
                    s.latent_traits_json
             FROM tweets t
             JOIN globs g ON t.glob_id = g.id
             LEFT JOIN glob_daily_state s ON t.glob_id = s.glob_id AND s.tick = (
                 SELECT MAX(s2.tick) FROM glob_daily_state s2
                 WHERE s2.glob_id = t.glob_id AND s2.tick <= t.tick
             )
             {}
             ORDER BY t.tick DESC
             LIMIT {}",
            where_clause, limit
        );

        let mut stmt = conn
            .prepare(&query_sql)
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let rows = stmt
            .query_map(
                rusqlite::params_from_iter(sql_params.iter().map(|p| p.as_ref())),
                |row| {
                    let traits_json: Option<String> = row.get(14)?;
                    let traits: Value = traits_json
                        .as_deref()
                        .and_then(|s| serde_json::from_str(s).ok())
                        .unwrap_or(json!({}));

                    let party_num: Option<u32> = row.get(11)?;
                    let party_name = match party_num {
                        Some(0) => "Fortschritt",
                        Some(1) => "Mitte",
                        Some(2) => "Tradition",
                        Some(3) => "Unabhaengige",
                        _ => "keine",
                    };

                    Ok(json!({
                        "glob_id": row.get::<_, String>(0)?,
                        "name": row.get::<_, String>(1)?,
                        "district": row.get::<_, u32>(2)?,
                        "tick": row.get::<_, u32>(3)?,
                        "topic": row.get::<_, String>(4)?,
                        "trigger_type": row.get::<_, String>(5)?,
                        "tweet_text": row.get::<_, String>(6)?,
                        "sentiment": row.get::<_, Option<f64>>(7)?,
                        "traits": {
                            "satisfaction": row.get::<_, Option<f64>>(8).ok().flatten().map(r2),
                            "ideology": row.get::<_, Option<f64>>(9).ok().flatten().map(r2),
                            "trust": row.get::<_, Option<f64>>(10).ok().flatten().map(r2),
                            "party": party_name,
                            "will_vote": row.get::<_, Option<bool>>(12).ok().flatten(),
                            "income": row.get::<_, Option<f64>>(13).ok().flatten().map(r2),
                            "economic_security_priority": traits.get("economic_security_priority").and_then(|v| v.as_f64()).map(r2),
                            "environment_over_economy": traits.get("environment_over_economy").and_then(|v| v.as_f64()).map(r2),
                            "freedom_over_order": traits.get("freedom_over_order").and_then(|v| v.as_f64()).map(r2),
                            "self_efficacy": traits.get("self_efficacy").and_then(|v| v.as_f64()).map(r2),
                            "powerlessness": traits.get("powerlessness").and_then(|v| v.as_f64()).map(r2),
                            "vote_importance": traits.get("vote_importance").and_then(|v| v.as_f64()).map(r2),
                            "party_indifference": traits.get("party_indifference").and_then(|v| v.as_f64()).map(r2),
                            "strong_leader_preference": traits.get("strong_leader_preference").and_then(|v| v.as_f64()).map(r2),
                        }
                    }))
                },
            )
            .map_err(|e| Json(json!({ "error": format!("Query error: {}", e) })))?;

        let tweets: Vec<Value> = rows.filter_map(|r| r.ok()).collect();

        Ok(Json(json!({ "tweets": tweets })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    /// Create an in-memory test database with the required schema and sample data.
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
             INSERT INTO meta (key, value) VALUES ('ticks_per_year', '365');

             CREATE TABLE globs (
                 id TEXT PRIMARY KEY, name TEXT, district INTEGER,
                 age INTEGER, education_level INTEGER, income REAL,
                 home_building_id INTEGER, workplace_id INTEGER,
                 lunch_spot_id INTEGER, leisure_spot_id INTEGER
             );
             INSERT INTO globs VALUES ('g1', 'Alpha Test', 0, 25, 2, 3000.0, 1, 2, 3, 4);
             INSERT INTO globs VALUES ('g2', 'Beta Probe', 1, 35, 1, 2000.0, 5, 6, 7, 8);
             INSERT INTO globs VALUES ('g3', 'Gamma Drei', 2, 45, 3, 5000.0, 9, 10, 11, 12);

             CREATE TABLE glob_daily_state (
                 glob_id TEXT, tick INTEGER, satisfaction REAL, ideology REAL,
                 trust REAL, party INTEGER, will_vote INTEGER, protest_readiness REAL,
                 income REAL, latent_traits_json TEXT
             );
             INSERT INTO glob_daily_state VALUES
                 ('g1', 100, 7.5, 4.0, 6.5, 0, 1, 0.2, 3000.0,
                  '{\"self_efficacy\":6.0,\"political_knowledge\":5.0,\"vote_importance\":7.0,\"obedience_value\":4.0,\"strong_leader_preference\":3.0,\"rule_conformity\":5.0,\"powerlessness\":3.0,\"political_complexity\":5.0,\"party_indifference\":2.0,\"economic_security_priority\":6.0,\"environment_over_economy\":7.0,\"freedom_over_order\":6.0,\"neighbor_trust\":7.0,\"community_participation\":6.0,\"network_size\":5.0}'),
                 ('g1', 200, 6.0, 5.0, 5.5, 1, 1, 0.3, 3100.0, NULL),
                 ('g1', 300, 4.5, 6.0, 4.0, 2, 0, 0.5, 2800.0, NULL),
                 ('g2', 100, 5.0, 5.5, 5.0, 1, 1, 0.1, 2000.0, NULL),
                 ('g2', 200, 3.5, 6.0, 3.0, 2, 0, 0.6, 1900.0, NULL),
                 ('g3', 150, 8.0, 3.0, 8.5, 0, 1, 0.05, 5000.0, NULL);

             CREATE TABLE tweets (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 glob_id TEXT NOT NULL, tick INTEGER NOT NULL,
                 topic TEXT NOT NULL, trigger_type TEXT NOT NULL,
                 event_description TEXT, tweet_text TEXT NOT NULL,
                 sentiment REAL, model_version TEXT
             );
             INSERT INTO tweets (glob_id, tick, topic, trigger_type, event_description, tweet_text, sentiment, model_version) VALUES
                 ('g1', 100, 'wirtschaft', 'event_reaction', 'Wirtschaftskrise', 'Alles wird teurer.', 0.5, 'haiku-test'),
                 ('g1', 200, 'umwelt', 'periodic', NULL, 'Mehr Gruen in der Stadt!', 0.2, 'haiku-test'),
                 ('g2', 100, 'vertrauen', 'event_reaction', 'Skandal', 'Wem kann man noch trauen?', -0.3, 'haiku-test'),
                 ('g2', 250, 'wirtschaft', 'threshold', NULL, 'Es wird eng am Monatsende.', -0.5, 'haiku-test'),
                 ('g3', 150, 'teilhabe', 'background', NULL, 'Ich gehe waehlen.', 0.6, 'haiku-test');

             CREATE INDEX idx_tweets_tick ON tweets(tick);
             CREATE INDEX idx_tweets_glob ON tweets(glob_id);",
        ).unwrap();
        conn
    }

    #[test]
    fn test_r2_rounding() {
        assert_eq!(r2(3.14159), 3.14);
        assert_eq!(r2(0.005), 0.01);
        assert_eq!(r2(0.0), 0.0);
        assert_eq!(r2(-2.555), -2.56);
    }

    #[test]
    fn test_ticks_per_year_from_meta() {
        let conn = setup_test_db();
        assert_eq!(ticks_per_year(&conn), 365);
    }

    #[test]
    fn test_ticks_per_year_default() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);")
            .unwrap();
        assert_eq!(ticks_per_year(&conn), 365);
    }

    #[test]
    fn test_tweet_query_no_table() {
        // DB without tweets table
        let conn = Connection::open_in_memory().unwrap();
        let has_tweets = conn.prepare("SELECT 1 FROM tweets LIMIT 0").is_ok();
        assert!(!has_tweets);
    }

    #[test]
    fn test_tweet_query_empty_table() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE globs (id TEXT PRIMARY KEY, name TEXT, district INTEGER,
                 age INTEGER, education_level INTEGER, income REAL);
             CREATE TABLE tweets (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 glob_id TEXT, tick INTEGER, topic TEXT, trigger_type TEXT,
                 event_description TEXT, tweet_text TEXT, sentiment REAL, model_version TEXT
             );"
        ).unwrap();

        let total: u32 = conn
            .query_row("SELECT COUNT(*) FROM tweets", [], |row| row.get(0))
            .unwrap();
        assert_eq!(total, 0);
    }

    #[test]
    fn test_tweet_query_basic() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM tweets", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 5);
    }

    #[test]
    fn test_tweet_query_tick_start_filter() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets WHERE tick >= 150",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3); // ticks 150, 200, 250
    }

    #[test]
    fn test_tweet_query_tick_end_filter() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets WHERE tick <= 150",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 3); // ticks 100, 100, 150
    }

    #[test]
    fn test_tweet_query_tick_range() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets WHERE tick >= 100 AND tick <= 200",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 4); // ticks 100, 100, 150, 200
    }

    #[test]
    fn test_tweet_query_glob_id_filter() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets WHERE glob_id = 'g1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_tweet_query_topic_filter() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets WHERE topic = 'wirtschaft'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2); // g1@100 + g2@250
    }

    #[test]
    fn test_tweet_query_district_filter() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets t JOIN globs g ON t.glob_id = g.id WHERE g.district = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2); // g1 is district 0
    }

    #[test]
    fn test_tweet_query_limit_default() {
        // Default limit is 50, our test data has 5 tweets
        let conn = setup_test_db();
        let limit: u32 = 50_u32.min(200);
        assert_eq!(limit, 50);
    }

    #[test]
    fn test_tweet_query_limit_cap() {
        let limit: u32 = 999_u32.min(200);
        assert_eq!(limit, 200);
    }

    #[test]
    fn test_tweet_query_combined_filters() {
        let conn = setup_test_db();
        let count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM tweets t JOIN globs g ON t.glob_id = g.id
                 WHERE t.tick >= 100 AND t.topic = 'wirtschaft' AND g.district = 0",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1); // g1@100 wirtschaft, district 0
    }

    #[test]
    fn test_tweet_query_total_vs_limit() {
        let conn = setup_test_db();
        let total: u32 = conn
            .query_row("SELECT COUNT(*) FROM tweets", [], |row| row.get(0))
            .unwrap();

        let mut stmt = conn
            .prepare("SELECT id FROM tweets ORDER BY tick DESC LIMIT 3")
            .unwrap();
        let limited: Vec<u32> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert_eq!(total, 5);
        assert_eq!(limited.len(), 3);
        assert!(total as usize > limited.len());
    }

    #[test]
    fn test_tweets_with_traits_party_mapping() {
        // Verify party number → name mapping
        let party_name = |p: Option<u32>| -> &'static str {
            match p {
                Some(0) => "Fortschritt",
                Some(1) => "Mitte",
                Some(2) => "Tradition",
                Some(3) => "Unabhaengige",
                _ => "keine",
            }
        };
        assert_eq!(party_name(Some(0)), "Fortschritt");
        assert_eq!(party_name(Some(1)), "Mitte");
        assert_eq!(party_name(Some(2)), "Tradition");
        assert_eq!(party_name(Some(3)), "Unabhaengige");
        assert_eq!(party_name(None), "keine");
        assert_eq!(party_name(Some(99)), "keine");
    }

    #[test]
    fn test_tweet_query_order_desc() {
        let conn = setup_test_db();
        let mut stmt = conn
            .prepare("SELECT tick FROM tweets ORDER BY tick DESC")
            .unwrap();
        let ticks: Vec<u32> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();
        // Should be descending
        for i in 1..ticks.len() {
            assert!(ticks[i] <= ticks[i - 1], "Ticks not in DESC order: {:?}", ticks);
        }
    }
}

/// Build a complete LLM interview prompt for a specific Glob at a specific tick.
/// Combines: pre-generated base persona + exact runtime values + interpretation rules + change context.
pub async fn get_interview_prompt(
    Path((glob_id, tick)): Path<(String, u32)>,
    State(state): State<Arc<AppState>>,
) -> Json<Value> {
    let state = state.clone();
    let id = glob_id.clone();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&state)?;
        let data = build_system_prompt(&conn, &id, tick)
            .map_err(|e| Json(json!({ "error": e })))?;

        Ok(Json(json!({
            "glob_id": id,
            "name": data.name,
            "tick": tick,
            "year": data.year,
            "current_age": data.current_age,
            "job": data.job,
            "system_prompt": data.system_prompt,
            "values": {
                "satisfaction": r2(data.satisfaction),
                "ideology": r2(data.ideology),
                "trust": r2(data.trust),
                "party": data.party,
                "will_vote": data.will_vote,
                "income": r2(data.income),
            }
        })))
    })
    .await
    .unwrap_or_else(|e| Err(Json(json!({ "error": format!("Task error: {}", e) }))));

    match result {
        Ok(v) => v,
        Err(v) => v,
    }
}
