use super::*;

#[derive(Debug, Copy, Clone)]
pub struct HomesickBehaviour;
impl HomesickBehaviour {
    pub fn how_homesick(creature: &Creature) -> Option<Objective> {
        let dist = (creature.home_pos - creature.get_position()).norm();
        let cost = creature.get_motion_energy_cost();
        let steps_to_home = dist / creature.get_speed();
        let homesick_factor = creature.get_energy_left() / cost - steps_to_home;

        let intensity = match homesick_factor {
            x if x > 10.0 => None,
            x if x > 5.0 => Some(ObjectiveIntensity::MinorCraving),
            x if x > 0.0 => Some(ObjectiveIntensity::MajorCraving),
            _ => Some(ObjectiveIntensity::VitalCraving),
        };

        intensity.map(|intensity| Objective {
            pos: creature.home_pos,
            intensity,
            reason: String::from("low energy"),
        })
    }
}

impl StepBehaviour for HomesickBehaviour {
    fn apply(&self, phase: Phase, generation: &mut Generation, _sim: &Simulation) {
        if let Phase::ORIENT = phase {
            generation
                .creatures
                .iter_mut()
                .filter(|c| c.is_active())
                .filter_map(|c| Self::how_homesick(c).map(|i| (c, i)))
                .for_each(|(c, o)| {
                    if c.can_reach(&c.home_pos) {
                        c.sleep();
                    } else {
                        c.add_objective(o);
                    }
                });
        }
    }
}
