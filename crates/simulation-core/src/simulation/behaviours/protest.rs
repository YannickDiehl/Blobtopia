use super::*;
use nalgebra::Point2;

/// Protest behaviour: Globs with high protest readiness may protest.
/// When a district's average protest_readiness exceeds the threshold,
/// blobs in that district set the central square as their objective.
pub struct ProtestBehaviour {
    /// Threshold for district-average protest readiness to trigger protest (0.0-1.0)
    pub threshold: f64,
    /// Position of the central square (Zentralplatz)
    pub central_square: Point2<f64>,
}

impl ProtestBehaviour {
    pub fn new(threshold: f64) -> Self {
        ProtestBehaviour {
            threshold,
            central_square: Point2::new(250.0, 210.0),
        }
    }
}

impl StepBehaviour for ProtestBehaviour {
    fn apply(&self, phase: Phase, generation: &mut Generation, _sim: &Simulation) {
        if let Phase::ORIENT = phase {
            // Calculate average protest readiness per district
            let mut district_readiness = [0.0f64; 5];
            let mut district_counts = [0u32; 5];

            for creature in generation.creatures.iter().filter(|c| c.is_alive()) {
                let d = creature.district as usize;
                if d < 5 {
                    district_readiness[d] += creature.political_state.protest_readiness;
                    district_counts[d] += 1;
                }
            }

            // Determine which districts are protesting
            let mut protesting_districts = [false; 5];
            for d in 0..5 {
                if district_counts[d] > 0 {
                    let avg = district_readiness[d] / district_counts[d] as f64;
                    protesting_districts[d] = avg > self.threshold;
                }
            }

            // Set protest objective for blobs in protesting districts
            for creature in generation.creatures.iter_mut().filter(|c| c.is_active()) {
                let d = creature.district as usize;
                if d < 5 && protesting_districts[d] && creature.political_state.protest_readiness > 0.3 {
                    creature.add_objective(Objective {
                        pos: self.central_square,
                        intensity: ObjectiveIntensity::ModerateCraving,
                        reason: String::from("protesting"),
                    });
                }
            }
        }
    }
}
