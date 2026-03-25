use std::sync::Arc;
use std::time::Duration;
use tracing::{info, warn};

use crate::AppState;
use crate::ws::broadcast_generation;
use crate::persistence;

/// Main tick loop: advances the society simulation by one tick
/// and broadcasts the result to all connected WebSocket clients.
pub async fn tick_loop(state: Arc<AppState>) {
    let tick_interval = Duration::from_millis(state.config.tick_interval_ms);

    info!(
        "Tick loop started (interval: {}ms = {:.1} min per tick)",
        tick_interval.as_millis(),
        tick_interval.as_secs_f64() / 60.0,
    );

    loop {
        tokio::time::sleep(tick_interval).await;

        // Check if paused
        if *state.paused.lock().await {
            continue;
        }

        // Advance simulation by one tick
        let snapshot_data = {
            let mut sim = state.simulation.lock().await;

            if sim.is_finished() {
                warn!("Simulation reached max years ({}) — halted", sim.config.max_years);
                *state.paused.lock().await = true;
                continue;
            }

            let snapshot = sim.tick();
            let tick = snapshot.tick;
            let year = snapshot.year;
            let month = snapshot.month;
            let day = snapshot.day;
            let pop = snapshot.blobs.len();
            let events = snapshot.events_processed.clone();
            let election = snapshot.election_results;
            let snapshot_json = serde_json::to_value(snapshot).unwrap_or_default();

            info!(
                "Tick {} (Jahr {}, Monat {}, Tag {}) — {} blobs{}",
                tick,
                year,
                month,
                day,
                pop,
                if events.is_empty() {
                    String::new()
                } else {
                    format!(" — Events: {}", events.join(", "))
                }
            );

            if let Some(results) = election {
                info!(
                    "  Election results: Fortschritt={}, Mitte={}, Tradition={}, Unabh.={}",
                    results[0], results[1], results[2], results[3]
                );
            }

            // Generate artifacts (tweets less frequently — not every day)
            if tick % 3 == 0 {
                let snapshot_clone = sim.current_snapshot().clone();
                let mut artifacts = state.artifacts.lock().await;
                let mut rng = sim.rng.lock().unwrap();
                artifacts.generate_for_generation_society(
                    &snapshot_clone,
                    &mut rng,
                );
            }

            // Autosave persistence
            if tick % state.config.autosave_interval == 0 {
                persistence::save_state(&state.config.persistence_path, &sim).await;
            }

            Some((tick as usize, snapshot_json))
        };

        // Broadcast
        if let Some((tick, json)) = snapshot_data {
            broadcast_generation(&state.broadcast_tx, tick, &json);
        }
    }
}
