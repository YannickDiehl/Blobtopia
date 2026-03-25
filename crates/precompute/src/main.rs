/// Blobtopia Timeline Pre-computation
///
/// Runs the full 15-year simulation (5475 ticks) and writes all state,
/// schedules, and events to a SQLite database for playback.

use std::path::Path;
use std::time::Instant;

use std::collections::HashMap;

use simulation_core::society::{
    BlobtopiaSim, BlobtopiaEvent, SocietyConfig,
    timeline_db,
};
use simulation_core::society::events::load_event_calendar;
use simulation_core::stage::city::CityModel;

fn main() {
    let seed: u64 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(118);
    let output = std::env::args()
        .nth(2)
        .unwrap_or_else(|| "data/blobtopia_timeline.db".to_string());
    let blob_count: usize = std::env::args()
        .nth(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500);

    println!("╔══════════════════════════════════════════════╗");
    println!("║   Blobtopia Timeline Pre-computation         ║");
    println!("╚══════════════════════════════════════════════╝");
    println!("  Seed: {}", seed);
    println!("  Output: {}", output);
    println!("  Blobs: {}", blob_count);

    // Load city
    let city_json = std::fs::read_to_string("data/blobtopia-city.json")
        .expect("blobtopia-city.json not found — run `node generate-city.js` first");
    let city = CityModel::from_json(&city_json)
        .expect("Failed to parse blobtopia-city.json");
    println!("  City: {} functional buildings", city.len());

    // Initialize simulation
    let config = SocietyConfig::default();
    let total_ticks = config.ticks_per_year * config.max_years;
    println!("  Config: {} ticks/year × {} years = {} total ticks",
        config.ticks_per_year, config.max_years, total_ticks);

    // Load event calendar
    let events_json = std::fs::read_to_string("data/blobtopia-events.json")
        .unwrap_or_else(|_| {
            println!("  Warning: blobtopia-events.json not found — running without events");
            "[]".to_string()
        });
    let event_calendar = load_event_calendar(&events_json)
        .expect("Failed to parse blobtopia-events.json");
    println!("  Events: {} scheduled events loaded", event_calendar.len());

    // Build tick → events lookup
    let mut events_by_tick: HashMap<u32, Vec<BlobtopiaEvent>> = HashMap::new();
    for entry in &event_calendar {
        events_by_tick
            .entry(entry.tick)
            .or_default()
            .push(entry.event.clone());
    }

    let mut sim = BlobtopiaSim::new_with_city(seed, blob_count, config.clone(), city.clone());
    println!("  Initialized: {} blobs, {} districts", sim.blobs.len(), sim.layout.districts.len());

    if let Some(ref graph) = sim.contact_graph {
        println!("  Contact graph: avg {:.1} contacts/blob", graph.avg_contacts());
    }

    // Open database
    let db_path = Path::new(&output);
    if db_path.exists() {
        std::fs::remove_file(db_path).expect("Failed to remove existing database");
    }
    let conn = timeline_db::open_db(db_path)
        .expect("Failed to create database");

    // Write metadata
    timeline_db::write_meta(&conn, "seed", &seed.to_string()).unwrap();
    timeline_db::write_meta(&conn, "blob_count", &blob_count.to_string()).unwrap();
    timeline_db::write_meta(&conn, "ticks_per_year", &config.ticks_per_year.to_string()).unwrap();
    timeline_db::write_meta(&conn, "max_years", &config.max_years.to_string()).unwrap();
    timeline_db::write_meta(&conn, "total_ticks", &total_ticks.to_string()).unwrap();

    // Write buildings
    timeline_db::write_buildings(&conn, &city).unwrap();
    println!("  Wrote {} buildings to DB", city.len());

    // Write static blob data
    timeline_db::write_blobs(&conn, &sim.blobs).unwrap();
    println!("  Wrote {} blobs to DB", sim.blobs.len());

    // Write initial state (tick 0) — include latent traits
    let initial = sim.current_snapshot();
    timeline_db::write_tick_state(&conn, 0, &initial.blobs, true).unwrap();
    timeline_db::write_latent_traits(&conn, &initial.blobs).unwrap();
    if !initial.daily_schedules.is_empty() {
        timeline_db::write_schedules(&conn, 0, &initial.daily_schedules).unwrap();
    }

    println!("\n  Running simulation...");
    let start = Instant::now();
    let mut last_print = Instant::now();
    let mut last_day_type: Option<u8> = None; // Track day type changes for schedule dedup

    // Use a transaction for bulk writes (massive speedup)
    conn.execute_batch("BEGIN TRANSACTION").unwrap();

    for tick in 1..=total_ticks {
        // Queue events scheduled for this tick
        if let Some(events) = events_by_tick.get(&tick) {
            for event in events {
                sim.queue_event(event.clone());
            }
        }

        let snapshot = sim.tick().clone();

        // Write state (attitudes + political + latent traits every 7 ticks)
        let include_latent = tick % 7 == 0;
        timeline_db::write_tick_state(&conn, tick, &snapshot.blobs, include_latent).unwrap();

        // Only write schedules when day type changes (weekday↔weekend, or event day)
        let day_of_week = tick % 7;
        let current_day_type = if day_of_week >= 5 { 1u8 } else { 0u8 };
        let day_type_changed = last_day_type.map_or(true, |prev| prev != current_day_type);
        let has_events = !snapshot.events_processed.is_empty();

        if (day_type_changed || has_events) && !snapshot.daily_schedules.is_empty() {
            timeline_db::write_schedules(&conn, tick, &snapshot.daily_schedules).unwrap();
        }
        last_day_type = Some(current_day_type);

        // Write events
        if !snapshot.events_processed.is_empty() {
            timeline_db::write_events(&conn, tick, &snapshot.events_processed).unwrap();
        }

        // Write election results
        if let Some(ref results) = snapshot.election_results {
            timeline_db::write_election(&conn, tick, results).unwrap();
        }

        // Commit every 365 ticks (1 year) and start new transaction
        if tick % 365 == 0 {
            conn.execute_batch("COMMIT; BEGIN TRANSACTION").unwrap();
        }

        // Progress output
        if last_print.elapsed().as_secs() >= 2 || tick == total_ticks {
            let elapsed = start.elapsed().as_secs_f64();
            let pct = tick as f64 / total_ticks as f64 * 100.0;
            let ticks_per_sec = tick as f64 / elapsed;
            let eta = (total_ticks - tick) as f64 / ticks_per_sec;
            let year = tick / config.ticks_per_year;
            let month = (tick % config.ticks_per_year / 30).min(11) + 1;

            print!(
                "\r  [{:>5.1}%] Tick {:>5}/{} (Jahr {}, Monat {:>2}) | {:.0} ticks/s | ETA: {:.0}s   ",
                pct, tick, total_ticks, year, month, ticks_per_sec, eta
            );
            last_print = Instant::now();
        }
    }

    // Final commit
    conn.execute_batch("COMMIT").unwrap();

    let elapsed = start.elapsed();
    println!("\n\n  Simulation complete!");
    println!("  Total time: {:.1}s ({:.0} ticks/s)",
        elapsed.as_secs_f64(),
        total_ticks as f64 / elapsed.as_secs_f64());

    // Database size
    let db_size = std::fs::metadata(db_path)
        .map(|m| m.len())
        .unwrap_or(0);
    println!("  Database size: {:.1} MB", db_size as f64 / 1_048_576.0);

    // Verify
    let meta = timeline_db::read_timeline_metadata(&conn).unwrap();
    println!("  Verified: {} ticks, {} blobs, {} events, {} elections",
        meta.max_tick, meta.total_blobs,
        meta.events.len(), meta.election_ticks.len());

    println!("\n  Output: {}", output);
    println!("  Done!");
}
