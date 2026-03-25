use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::path::Path;

use super::blob::Blob;
use super::schedule::DailySchedule;
use crate::stage::city::CityModel;

/// Create the SQLite schema for the pre-computed timeline.
pub fn create_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS buildings (
            id INTEGER PRIMARY KEY,
            x REAL NOT NULL,
            z REAL NOT NULL,
            district INTEGER NOT NULL,
            visual_type TEXT NOT NULL,
            model TEXT NOT NULL,
            label TEXT NOT NULL,
            functional_type TEXT NOT NULL,
            capacity INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS blobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            district INTEGER NOT NULL,
            education_level INTEGER NOT NULL,
            income REAL NOT NULL,
            age INTEGER NOT NULL,
            home_building_id INTEGER,
            workplace_id INTEGER,
            lunch_spot_id INTEGER,
            leisure_spot_id INTEGER,
            base_ideology REAL NOT NULL DEFAULT 5.5,
            base_satisfaction REAL NOT NULL DEFAULT 5.0,
            base_trust REAL NOT NULL DEFAULT 5.0,
            need_for_closure REAL NOT NULL DEFAULT 5.0
        );

        CREATE TABLE IF NOT EXISTS blob_daily_state (
            blob_id TEXT NOT NULL,
            tick INTEGER NOT NULL,
            district INTEGER NOT NULL DEFAULT 0,
            income REAL NOT NULL DEFAULT 0.0,
            satisfaction REAL NOT NULL,
            ideology REAL NOT NULL,
            trust REAL NOT NULL,
            party INTEGER,
            will_vote INTEGER NOT NULL,
            protest_readiness REAL NOT NULL,
            latent_traits_json TEXT,
            emotion_valence REAL NOT NULL DEFAULT 0.0,
            emotion_arousal REAL NOT NULL DEFAULT 0.0,
            emotion_label TEXT NOT NULL DEFAULT 'gelassen',
            emotion_icon TEXT NOT NULL DEFAULT 'calm',
            policy_economy REAL NOT NULL DEFAULT 5.0,
            policy_environment REAL NOT NULL DEFAULT 5.0,
            policy_security REAL NOT NULL DEFAULT 5.0,
            policy_social REAL NOT NULL DEFAULT 5.0,
            policy_migration REAL NOT NULL DEFAULT 5.0,
            policy_democracy REAL NOT NULL DEFAULT 5.0,
            age INTEGER NOT NULL DEFAULT 0,
            education_level INTEGER NOT NULL DEFAULT 0,
            workplace_id INTEGER,
            lunch_spot_id INTEGER,
            leisure_spot_id INTEGER,
            PRIMARY KEY (blob_id, tick)
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS blob_latent_traits (
            blob_id TEXT PRIMARY KEY,
            traits_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_schedules (
            blob_id TEXT NOT NULL,
            tick INTEGER NOT NULL,
            schedule_json TEXT NOT NULL,
            PRIMARY KEY (blob_id, tick)
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS events (
            tick INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            description TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS elections (
            tick INTEGER PRIMARY KEY,
            fortschritt INTEGER NOT NULL,
            mitte INTEGER NOT NULL,
            tradition INTEGER NOT NULL,
            unabhaengige INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_blob_state_tick ON blob_daily_state(tick);
        CREATE INDEX IF NOT EXISTS idx_blob_state_blob_id ON blob_daily_state(blob_id);
        CREATE INDEX IF NOT EXISTS idx_schedule_tick ON daily_schedules(tick);
        CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);
        ",
    )
}

/// Open or create a timeline database.
pub fn open_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    create_schema(&conn)?;
    Ok(conn)
}

/// Write metadata key-value pair.
pub fn write_meta(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

/// Read metadata value.
pub fn read_meta(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM meta WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

/// Write all buildings to the database.
pub fn write_buildings(conn: &Connection, city: &CityModel) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO buildings (id, x, z, district, visual_type, model, label, functional_type, capacity)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    )?;
    for b in &city.buildings {
        stmt.execute(params![
            b.id,
            b.x,
            b.z,
            b.district,
            b.visual_type,
            b.model,
            b.label,
            serde_json::to_string(&b.functional_type).unwrap_or_default().trim_matches('"'),
            b.capacity,
        ])?;
    }
    Ok(())
}

/// Write static blob demographics.
pub fn write_blobs(conn: &Connection, blobs: &[Blob]) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO blobs (id, name, district, education_level, income, age,
         home_building_id, workplace_id, lunch_spot_id, leisure_spot_id,
         base_ideology, base_satisfaction, base_trust, need_for_closure)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
    )?;
    for g in blobs {
        stmt.execute(params![
            g.id.to_string(),
            g.name,
            g.district,
            g.education_level,
            g.income,
            g.age,
            g.home_building_id,
            g.workplace_id,
            g.lunch_spot_id,
            g.leisure_spot_id,
            g.base_ideology,
            g.base_satisfaction,
            g.base_trust,
            g.need_for_closure,
        ])?;
    }
    Ok(())
}

/// Write a single tick's state for all blobs (attitudes + political state + optional latent traits).
/// When `include_latent` is true, latent traits JSON is written; otherwise NULL.
pub fn write_tick_state(conn: &Connection, tick: u32, blobs: &[Blob], include_latent: bool) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO blob_daily_state (blob_id, tick, district, income,
         satisfaction, ideology, trust,
         party, will_vote, protest_readiness, latent_traits_json,
         emotion_valence, emotion_arousal, emotion_label, emotion_icon,
         policy_economy, policy_environment, policy_security,
         policy_social, policy_migration, policy_democracy,
         age, education_level, workplace_id, lunch_spot_id, leisure_spot_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26)",
    )?;
    for g in blobs {
        let latent_json: Option<String> = if include_latent {
            Some(serde_json::to_string(&g.latent_traits).unwrap_or_default())
        } else {
            None
        };
        stmt.execute(params![
            g.id.to_string(),
            tick,
            g.district as i32,
            g.income,
            g.attitudes.political_satisfaction,
            g.attitudes.ideology,
            g.attitudes.institutional_trust,
            g.political_state.party_affiliation,
            g.political_state.will_vote as i32,
            g.political_state.protest_readiness,
            latent_json,
            g.emotion.valence,
            g.emotion.arousal,
            &g.emotion.label,
            &g.emotion.icon,
            g.attitudes.policy_economy,
            g.attitudes.policy_environment,
            g.attitudes.policy_security,
            g.attitudes.policy_social,
            g.attitudes.policy_migration,
            g.attitudes.policy_democracy,
            g.age as i32,
            g.education_level as i32,
            g.workplace_id,
            g.lunch_spot_id,
            g.leisure_spot_id,
        ])?;
    }
    Ok(())
}

/// Write latent traits snapshot (initial state; per-tick changes are in blob_daily_state.latent_traits_json).
pub fn write_latent_traits(conn: &Connection, blobs: &[Blob]) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO blob_latent_traits (blob_id, traits_json) VALUES (?1, ?2)",
    )?;
    for g in blobs {
        let json = serde_json::to_string(&g.latent_traits).unwrap_or_default();
        stmt.execute(params![g.id.to_string(), json])?;
    }
    Ok(())
}

/// Write daily schedules for a tick.
pub fn write_schedules(
    conn: &Connection,
    tick: u32,
    schedules: &HashMap<String, DailySchedule>,
) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO daily_schedules (blob_id, tick, schedule_json) VALUES (?1, ?2, ?3)",
    )?;
    for (blob_id, schedule) in schedules {
        let json = serde_json::to_string(schedule).unwrap_or_default();
        stmt.execute(params![blob_id, tick, json])?;
    }
    Ok(())
}

/// Write events for a tick.
pub fn write_events(conn: &Connection, tick: u32, events: &[String]) -> Result<()> {
    let mut stmt = conn.prepare(
        "INSERT INTO events (tick, event_type, description) VALUES (?1, ?2, ?3)",
    )?;
    for desc in events {
        stmt.execute(params![tick, "event", desc])?;
    }
    Ok(())
}

/// Write election results for a tick.
pub fn write_election(conn: &Connection, tick: u32, results: &[u32; 4]) -> Result<()> {
    conn.execute(
        "INSERT INTO elections (tick, fortschritt, mitte, tradition, unabhaengige)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![tick, results[0], results[1], results[2], results[3]],
    )?;
    Ok(())
}

// ─── Read functions (for playback server) ──────────────────────

/// Read a snapshot for a specific tick.
pub fn read_tick_snapshot(conn: &Connection, tick: u32) -> Result<Option<StoredSnapshot>> {
    // Check if tick exists
    let count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM blob_daily_state WHERE tick = ?1",
        params![tick],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Ok(None);
    }

    // Read blob states (join with static data; latent traits from daily state or fallback table)
    let mut stmt = conn.prepare(
        "SELECT g.id, g.name, s.district, s.education_level, s.income, s.age,
                g.home_building_id, s.workplace_id, s.lunch_spot_id, s.leisure_spot_id,
                s.satisfaction, s.ideology, s.trust, s.party, s.will_vote,
                s.protest_readiness,
                COALESCE(s.latent_traits_json,
                    (SELECT s2.latent_traits_json FROM blob_daily_state s2
                     WHERE s2.blob_id = s.blob_id AND s2.tick <= ?1
                     AND s2.latent_traits_json IS NOT NULL
                     ORDER BY s2.tick DESC LIMIT 1),
                    COALESCE(lt.traits_json, '{}')),
                s.emotion_valence, s.emotion_arousal, s.emotion_label, s.emotion_icon,
                s.policy_economy, s.policy_environment, s.policy_security,
                s.policy_social, s.policy_migration, s.policy_democracy
         FROM blobs g
         JOIN blob_daily_state s ON g.id = s.blob_id
         LEFT JOIN blob_latent_traits lt ON g.id = lt.blob_id
         WHERE s.tick = ?1",
    )?;
    let blob_states: Vec<StoredBlobState> = stmt
        .query_map(params![tick], |row| {
            Ok(StoredBlobState {
                id: row.get(0)?,
                name: row.get(1)?,
                district: row.get(2)?,
                education_level: row.get(3)?,
                income: row.get(4)?,
                age: row.get(5)?,
                home_building_id: row.get(6)?,
                workplace_id: row.get(7)?,
                lunch_spot_id: row.get(8)?,
                leisure_spot_id: row.get(9)?,
                satisfaction: row.get(10)?,
                ideology: row.get(11)?,
                trust: row.get(12)?,
                party: row.get(13)?,
                will_vote: row.get::<_, i32>(14)? != 0,
                protest_readiness: row.get(15)?,
                latent_traits_json: row.get(16)?,
                emotion_valence: row.get(17)?,
                emotion_arousal: row.get(18)?,
                emotion_label: row.get(19)?,
                emotion_icon: row.get(20)?,
                policy_economy: row.get::<_, f64>(21).unwrap_or(5.0),
                policy_environment: row.get::<_, f64>(22).unwrap_or(5.0),
                policy_security: row.get::<_, f64>(23).unwrap_or(5.0),
                policy_social: row.get::<_, f64>(24).unwrap_or(5.0),
                policy_migration: row.get::<_, f64>(25).unwrap_or(5.0),
                policy_democracy: row.get::<_, f64>(26).unwrap_or(5.0),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Read schedules
    let mut sched_stmt = conn.prepare(
        "SELECT blob_id, schedule_json FROM daily_schedules WHERE tick = ?1",
    )?;
    let schedules: HashMap<String, String> = sched_stmt
        .query_map(params![tick], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Read events
    let mut ev_stmt = conn.prepare("SELECT description FROM events WHERE tick = ?1")?;
    let events: Vec<String> = ev_stmt
        .query_map(params![tick], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    // Read election
    let election: Option<[u32; 4]> = conn
        .query_row(
            "SELECT fortschritt, mitte, tradition, unabhaengige FROM elections WHERE tick = ?1",
            params![tick],
            |row| Ok([row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?]),
        )
        .ok();

    Ok(Some(StoredSnapshot {
        tick,
        blob_states,
        schedules,
        events,
        election,
    }))
}

/// Read timeline metadata.
pub fn read_timeline_metadata(conn: &Connection) -> Result<TimelineMetadata> {
    let max_tick: u32 = conn
        .query_row("SELECT MAX(tick) FROM blob_daily_state", [], |r| r.get(0))
        .unwrap_or(0);
    let total_blobs: u32 = conn
        .query_row("SELECT COUNT(*) FROM blobs", [], |r| r.get(0))
        .unwrap_or(0);

    let mut ev_stmt = conn.prepare("SELECT DISTINCT tick, description FROM events ORDER BY tick")?;
    let events: Vec<(u32, String)> = ev_stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let mut el_stmt = conn.prepare("SELECT tick FROM elections ORDER BY tick")?;
    let election_ticks: Vec<u32> = el_stmt
        .query_map([], |row| row.get(0))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(TimelineMetadata {
        max_tick,
        total_blobs,
        events,
        election_ticks,
    })
}

// ─── Data structures for reading ────────────────────────────────

#[derive(Debug)]
pub struct StoredBlobState {
    pub id: String,
    pub name: String,
    pub district: u8,
    pub education_level: u8,
    pub income: f64,
    pub age: u8,
    pub home_building_id: Option<u32>,
    pub workplace_id: Option<u32>,
    pub lunch_spot_id: Option<u32>,
    pub leisure_spot_id: Option<u32>,
    pub satisfaction: f64,
    pub ideology: f64,
    pub trust: f64,
    pub party: Option<u8>,
    pub will_vote: bool,
    pub protest_readiness: f64,
    pub latent_traits_json: String,
    pub emotion_valence: f64,
    pub emotion_arousal: f64,
    pub emotion_label: String,
    pub emotion_icon: String,
    pub policy_economy: f64,
    pub policy_environment: f64,
    pub policy_security: f64,
    pub policy_social: f64,
    pub policy_migration: f64,
    pub policy_democracy: f64,
}

#[derive(Debug)]
pub struct StoredSnapshot {
    pub tick: u32,
    pub blob_states: Vec<StoredBlobState>,
    pub schedules: HashMap<String, String>,
    pub events: Vec<String>,
    pub election: Option<[u32; 4]>,
}

#[derive(Debug)]
pub struct TimelineMetadata {
    pub max_tick: u32,
    pub total_blobs: u32,
    pub events: Vec<(u32, String)>,
    pub election_ticks: Vec<u32>,
}
