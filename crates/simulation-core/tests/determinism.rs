//! Characterization tests for the society simulation.
//!
//! The whole pipeline (precompute → SQLite → export → frontend) relies on the
//! simulation being a pure function of (seed, blob_count, config). These tests
//! pin that property down so dependency upgrades or refactorings that silently
//! break determinism fail CI instead of producing a subtly different city.

use simulation_core::society::{BlobtopiaSim, SocietyConfig};

const BLOBS: usize = 50;
const TICKS: u32 = 30;

/// Serializes everything about the final blob state EXCEPT the ids:
/// blob ids come from `Uuid::new_v4()` (OS randomness, not the seed), so they
/// differ between runs by design. The dynamics themselves must not.
fn run_serialized(seed: u64, ticks: u32) -> String {
    let mut sim = BlobtopiaSim::new(seed, BLOBS, SocietyConfig::default());
    for _ in 0..ticks {
        sim.tick();
    }
    let state: Vec<_> = sim
        .current_snapshot()
        .blobs
        .iter()
        .map(|b| {
            (
                b.name.clone(),
                serde_json::to_value(&b.attitudes).unwrap(),
                serde_json::to_value(&b.political_state).unwrap(),
                serde_json::to_value(&b.latent_traits).unwrap(),
                b.income,
                b.age,
                b.district,
            )
        })
        .collect();
    serde_json::to_string(&state).unwrap()
}

#[test]
fn same_seed_yields_identical_state() {
    assert_eq!(
        run_serialized(118, TICKS),
        run_serialized(118, TICKS),
        "two runs with the same seed must produce bit-identical blob state"
    );
}

#[test]
fn different_seed_yields_different_state() {
    assert_ne!(
        run_serialized(118, TICKS),
        run_serialized(119, TICKS),
        "different seeds must not collapse onto the same state"
    );
}

#[test]
fn snapshot_invariants_hold() {
    let mut sim = BlobtopiaSim::new(118, BLOBS, SocietyConfig::default());
    for _ in 0..TICKS {
        sim.tick();
    }
    let snap = sim.current_snapshot();
    assert_eq!(snap.tick, TICKS);
    assert_eq!(snap.blobs.len(), BLOBS, "no blob may appear or vanish");

    for b in &snap.blobs {
        let a = &b.attitudes;
        for (name, v) in [
            ("political_satisfaction", a.political_satisfaction),
            ("ideology", a.ideology),
            ("institutional_trust", a.institutional_trust),
            ("policy_economy", a.policy_economy),
            ("policy_environment", a.policy_environment),
            ("policy_security", a.policy_security),
            ("policy_social", a.policy_social),
        ] {
            assert!(
                (0.0..=10.0).contains(&v),
                "{} of blob {} out of range: {}",
                name,
                b.id,
                v
            );
        }
    }
}
