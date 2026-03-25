use super::*;
use nalgebra::Point2;

/// Social influence behaviour: Globs influence each other's attitudes
/// based on proximity and shared trust.
pub struct SocialInfluenceBehaviour {
    /// How strongly neighbors influence each other (0.0 - 1.0)
    pub influence_strength: f64,
}

impl StepBehaviour for SocialInfluenceBehaviour {
    fn apply(&self, phase: Phase, generation: &mut Generation, _sim: &Simulation) {
        if let Phase::POST = phase {
            // Collect positions and attitudes of all living creatures
            let snapshots: Vec<(Point2<f64>, f64, f64, f64, f64)> = generation
                .creatures
                .iter()
                .filter(|c| c.is_alive())
                .map(|c| (
                    c.get_position(),
                    c.attitudes.political_satisfaction,
                    c.attitudes.ideology,
                    c.attitudes.institutional_trust,
                    c.get_sense_range(),
                ))
                .collect();

            // Apply influence from neighbors
            for creature in generation.creatures.iter_mut().filter(|c| c.is_alive()) {
                let pos = creature.get_position();
                let sense = creature.get_sense_range();
                let mut sat_shift = 0.0;
                let mut ideo_shift = 0.0;
                let mut trust_shift = 0.0;
                let mut neighbor_count = 0.0;

                for (other_pos, other_sat, other_ideo, other_trust, _) in &snapshots {
                    let dist = (pos - other_pos).norm();
                    if dist > 0.1 && dist <= sense {
                        // Weight: closer = stronger influence
                        let weight = 1.0 - (dist / sense);
                        sat_shift += (other_sat - creature.attitudes.political_satisfaction) * weight;
                        ideo_shift += (other_ideo - creature.attitudes.ideology) * weight;
                        trust_shift += (other_trust - creature.attitudes.institutional_trust) * weight;
                        neighbor_count += weight;
                    }
                }

                if neighbor_count > 0.0 {
                    // More extreme positions are harder to shift
                    let ideology_resistance = 1.0 / (1.0 + creature.attitudes.ideology.abs() * 0.2);

                    creature.attitudes.political_satisfaction +=
                        self.influence_strength * sat_shift / neighbor_count;
                    creature.attitudes.ideology +=
                        self.influence_strength * ideology_resistance * ideo_shift / neighbor_count;
                    creature.attitudes.institutional_trust +=
                        self.influence_strength * trust_shift / neighbor_count;
                    creature.attitudes.clamp();

                    // Update political state based on new attitudes
                    creature.political_state.update_from_attitudes(&creature.attitudes);
                }
            }
        }
    }
}
