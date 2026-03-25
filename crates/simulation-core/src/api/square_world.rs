use super::*;
use crate::math::Interpolator;

pub struct SquareWorld {
    pub sim: Simulation,
    pub creatures: Vec<Creature>,
}

impl SquareWorld {
    pub fn new(
        size: f64,
        seed: u32,
        food_per_generation: Vec<(f64, f64)>,
        preset_cfg: PresetConfig,
    ) -> Self {
        let stage = Box::new(stage::SquareStage(size));
        let mut sim = Simulation::new(stage, seed as u64, Interpolator::new(&food_per_generation));
        use_preset(&mut sim, &preset_cfg);

        Self {
            sim,
            creatures: vec![],
        }
    }

    pub fn add_creatures(&mut self, creature_cfg: RandomCreatureConfig) {
        let count = creature_cfg.count;

        for _i in 0..count {
            let pos = self
                .sim
                .stage
                .get_nearest_edge_point(&self.sim.get_random_location());
            let c = creature_cfg.template.with_new_position(&pos);
            self.creatures.push(c);
        }
    }

    pub fn run(&mut self, max_generations_to_run: u32) {
        let mut creatures = vec![];
        std::mem::swap(&mut creatures, &mut self.creatures);
        self.sim.run(creatures, max_generations_to_run);
        self.creatures = self
            .sim
            .exec_reproduction(&self.sim.generations.last().unwrap().creatures);
    }

    /// Advance by one generation (tick-based mode for server).
    pub fn advance(&mut self) -> Option<&Generation> {
        self.sim.advance()
    }

    pub fn can_continue(&self) -> bool {
        match self.sim.generations.last() {
            None => true,
            Some(l) => l.creatures.iter().any(|c| c.is_alive()),
        }
    }

    pub fn get_results(&self) -> SimulationResults {
        SimulationResults {
            generations: self.sim.generations.clone(),
        }
    }

    pub fn get_generation(&self, index: usize) -> &Generation {
        &self.sim.generations[index]
    }

    pub fn get_statistics(&self, species_filter: Option<String>) -> SimulationStatistics {
        get_statistics(&self.sim, species_filter)
    }
}
