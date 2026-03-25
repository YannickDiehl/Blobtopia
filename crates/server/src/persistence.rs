use serde::{Deserialize, Serialize};
use tracing::{info, warn, error};

use simulation_core::society::{BlobtopiaSim, SocietyConfig, SocietySnapshot};
use simulation_core::society::Blob;

/// Serializable state for saving/restoring the simulation.
#[derive(Serialize, Deserialize)]
pub struct PersistentState {
    pub current_tick: u32,
    pub config: SocietyConfig,
    pub blobs: Vec<Blob>,
    pub seed: u64,
}

/// Save the current simulation state to a JSON file.
pub async fn save_state(path: &str, sim: &BlobtopiaSim) {
    let state = PersistentState {
        current_tick: sim.current_tick,
        config: sim.config.clone(),
        blobs: sim.blobs.clone(),
        seed: 0, // RNG state is not easily serializable, we just save globs
    };

    match serde_json::to_string(&state) {
        Ok(json) => {
            match tokio::fs::write(path, json).await {
                Ok(_) => info!("State saved to {} (tick {})", path, sim.current_tick),
                Err(e) => error!("Failed to write state file {}: {}", path, e),
            }
        }
        Err(e) => error!("Failed to serialize state: {}", e),
    }
}

/// Try to load simulation state from a JSON file.
/// Returns None if file doesn't exist or is invalid.
pub fn load_state(path: &str) -> Option<PersistentState> {
    match std::fs::read_to_string(path) {
        Ok(json) => {
            match serde_json::from_str::<PersistentState>(&json) {
                Ok(state) => {
                    info!(
                        "Restored state from {} — tick {}, {} blobs",
                        path, state.current_tick, state.blobs.len()
                    );
                    Some(state)
                }
                Err(e) => {
                    warn!("Failed to parse state file {}: {}", path, e);
                    None
                }
            }
        }
        Err(_) => {
            info!("No existing state file at {} — starting fresh", path);
            None
        }
    }
}

/// Restore a BlobtopiaSim from persistent state.
pub fn restore_sim(saved: PersistentState, seed: u64, _glob_count: usize) -> BlobtopiaSim {
    use rand::rngs::SmallRng;
    use rand::SeedableRng;
    use std::sync::{Arc, Mutex};
    use simulation_core::stage::blobtopia_stage::BlobtopiaLayout;

    let layout = BlobtopiaLayout::new();

    // Patch empty names from old persistence data
    let mut rng_for_names = SmallRng::seed_from_u64(seed + 9999);
    let mut saved = saved;
    for glob in &mut saved.blobs {
        if glob.name.is_empty() {
            let profile = &layout.districts[glob.district as usize].profile;
            glob.name = Blob::generate_name(profile, &mut rng_for_names);
        }
    }

    let rng = Arc::new(Mutex::new(SmallRng::seed_from_u64(seed)));

    let config = saved.config.clone();
    let current_tick = saved.current_tick;

    // Create a snapshot from the saved globs
    let snapshot = SocietySnapshot {
        tick: current_tick,
        year: current_tick / config.ticks_per_year,
        month: {
            let doy = current_tick % config.ticks_per_year;
            (doy / 30).min(11) + 1
        },
        day: {
            let doy = current_tick % config.ticks_per_year;
            (doy % 30) + 1
        },
        blobs: saved.blobs.clone(),
        election_results: None,
        events_processed: vec![],
        daily_schedules: std::collections::HashMap::new(),
    };

    BlobtopiaSim {
        rng,
        config,
        layout,
        city: None,
        contact_graph: None,
        households: Vec::new(),
        current_tick,
        blobs: saved.blobs,
        pending_events: Vec::new(),
        history: vec![snapshot],
        protest_active: false,
    }
}
