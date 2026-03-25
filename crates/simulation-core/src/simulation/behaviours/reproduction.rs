use super::*;

#[derive(Debug, Copy, Clone)]
pub struct BasicReproductionBehaviour;

impl BasicReproductionBehaviour {
    pub fn will_reproduce(creature: &Creature) -> bool {
        creature.foods_eaten.len() > 1
    }

    fn reproduce_creature(&self, creature: &Creature, sim: &Simulation) -> Vec<Creature> {
        if Self::will_reproduce(creature) {
            vec![creature.mutate(&mut sim.rng.lock().unwrap())]
        } else {
            vec![]
        }
    }
}

impl ReproductionBehaviour for BasicReproductionBehaviour {
    fn reproduce(&self, creatures: &Vec<Creature>, sim: &Simulation) -> Vec<Creature> {
        creatures
            .iter()
            .filter(|c| c.is_alive())
            .flat_map(|c| {
                let mut ctrs = self.reproduce_creature(c, sim);
                let grown = c.grow_older();
                ctrs.push(grown);
                ctrs
            })
            .collect()
    }
}
