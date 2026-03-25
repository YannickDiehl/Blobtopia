use crate::simulation::{Edible, FoodType, Step};
use crate::math::*;
use nalgebra::{Point2, Unit, Vector2};
use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

const ENERGY_COST_SCALE_FACTOR: f64 = 1. / 10_000.;

fn get_uuid() -> Uuid {
    Uuid::new_v4()
}

mod mutatable;
use mutatable::*;

pub mod attitudes;
pub use attitudes::Attitudes;

pub mod political_behavior;
pub use political_behavior::PoliticalState;

#[derive(Debug, Copy, Clone, Serialize, Deserialize)]
enum CreatureState {
    DEAD,
    ASLEEP,
    ACTIVE,
}

// automatically ordered top to bottom
#[derive(Debug, Copy, Clone, Serialize, Deserialize, Eq, PartialEq, PartialOrd)]
pub enum ObjectiveIntensity {
    // Meh level
    MinorCraving,
    MinorAversion,
    // Kind of want this
    ModerateCraving,
    ModerateAversion,
    // Seriously starving
    MajorCraving,
    MajorAversion,
    // Will die unless this happens
    VitalCraving,
    VitalAversion,
}

// current target of the creature's desire
// and its intensity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Objective {
    pub pos: Point2<f64>,
    pub intensity: ObjectiveIntensity,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Creature {
    pub id: Uuid,
    pub species: String,
    // mutatable biological traits
    speed: PositiveNonZeroMutatable<f64>,
    size: PositiveNonZeroMutatable<f64>,
    sense_range: PositiveMutatable<f64>,
    reach: PositiveNonZeroMutatable<f64>,
    flee_distance: PositiveMutatable<f64>,
    life_span: PositiveNonZeroMutatable<f64>,

    // --- Blobtopia social layer ---
    /// District assignment: 0=Grüntal, 1=Sonnenberg, 2=Hafenviertel, 3=Mittelfeld, 4=Industriezone
    pub district: u8,
    /// Education level: 0=none, 1=basic, 2=higher, 3=academic
    pub education_level: u8,
    /// Income level (1.0 - 10.0)
    pub income: f64,
    /// Age group: 0=young, 1=middle, 2=older
    pub age_group: u8,
    /// Political attitudes and dispositions
    pub attitudes: Attitudes,
    /// Political behavior state
    pub political_state: PoliticalState,

    // other
    pub foods_eaten: Vec<(Step, Uuid, FoodType)>,
    pub energy: f64,
    pub energy_consumed: f64,
    pub age: u32,
    pub pos: Point2<f64>,
    pub home_pos: Point2<f64>,

    // array of position vectors
    pub movement_history: Vec<Point2<f64>>,
    pub status_history: Vec<String>,

    state: CreatureState,
    objective: Option<Objective>,
}

impl Edible for Creature {
    fn get_edible_id(&self) -> Uuid {
        self.id
    }
    fn get_type(&self) -> FoodType {
        "creature".into()
    }
}

impl Creature {
    pub fn default(pos: &Point2<f64>) -> Self {
        Creature {
            id: get_uuid(),
            species: "default".to_string(),
            state: CreatureState::ACTIVE,
            speed: PositiveNonZeroMutatable(1.0, 1.),
            size: PositiveNonZeroMutatable(1.0, 1.),
            sense_range: PositiveMutatable(1.0, 1.0),
            reach: PositiveNonZeroMutatable(1.0, 1.0),
            flee_distance: PositiveMutatable(1.0, 1.0),
            life_span: PositiveNonZeroMutatable(1.0, 1.0),
            energy: 500.0,

            // Social layer defaults
            district: 0,
            education_level: 0,
            income: 5.0,
            age_group: 1,
            attitudes: Attitudes::default(),
            political_state: PoliticalState::default(),

            foods_eaten: vec![],
            energy_consumed: 0.0,

            age: 0,

            pos: *pos,
            home_pos: *pos,
            movement_history: vec![*pos],
            status_history: vec![],
            objective: None,
        }
    }

    /// Create a creature with the standard "primer" trait values
    /// matching the original frontend defaults.
    pub fn primer_default(pos: &Point2<f64>) -> Self {
        Creature {
            id: get_uuid(),
            species: "default".to_string(),
            state: CreatureState::ACTIVE,
            speed: PositiveNonZeroMutatable(10.0, 0.5),
            size: PositiveNonZeroMutatable(10.0, 0.5),
            sense_range: PositiveMutatable(20.0, 0.5),
            reach: PositiveNonZeroMutatable(1.0, 0.0),
            flee_distance: PositiveMutatable(1e12, 0.0),
            life_span: PositiveNonZeroMutatable(1e4, 0.0),
            energy: 500.0,

            district: 0,
            education_level: 0,
            income: 5.0,
            age_group: 1,
            attitudes: Attitudes::default(),
            political_state: PoliticalState::default(),

            foods_eaten: vec![],
            energy_consumed: 0.0,
            age: 0,

            pos: *pos,
            home_pos: *pos,
            movement_history: vec![*pos],
            status_history: vec![],
            objective: None,
        }
    }

    /// Create a Blobtopia citizen for a specific district with appropriate demographics.
    pub fn globtopia_citizen(pos: &Point2<f64>, district: u8, rng: &mut SmallRng) -> Self {
        let education_level = Self::generate_education(district, rng);
        let income = Self::generate_income(district, education_level, rng);
        let age_group: u8 = rng.gen_range(0..3);
        let attitudes = Attitudes::for_district(district, rng);
        let political_state = PoliticalState::from_attitudes(&attitudes);

        // sense_range correlates with education (social reach)
        let sense_range = 15.0 + (education_level as f64) * 5.0;
        // size correlates subtly with income (visual wealth indicator)
        let size = 8.0 + (income - 1.0) * 0.4;

        Creature {
            id: get_uuid(),
            species: "blob".to_string(),
            state: CreatureState::ACTIVE,
            speed: PositiveNonZeroMutatable(10.0, 0.5),
            size: PositiveNonZeroMutatable(size, 0.2),
            sense_range: PositiveMutatable(sense_range, 0.3),
            reach: PositiveNonZeroMutatable(1.0, 0.0),
            flee_distance: PositiveMutatable(1e12, 0.0),
            life_span: PositiveNonZeroMutatable(1e4, 0.0),
            energy: 500.0,

            district,
            education_level,
            income,
            age_group,
            attitudes,
            political_state,

            foods_eaten: vec![],
            energy_consumed: 0.0,
            age: 0,

            pos: *pos,
            home_pos: *pos,
            movement_history: vec![*pos],
            status_history: vec![],
            objective: None,
        }
    }

    /// Generate education level based on district.
    fn generate_education(district: u8, rng: &mut SmallRng) -> u8 {
        match district {
            0 => {  // Grüntal: basic-medium (0-2)
                let r: f64 = rng.gen();
                if r < 0.4 { 0 } else if r < 0.8 { 1 } else { 2 }
            }
            1 => {  // Sonnenberg: higher-academic (2-3)
                let r: f64 = rng.gen();
                if r < 0.1 { 1 } else if r < 0.5 { 2 } else { 3 }
            }
            2 => {  // Hafenviertel: mixed (0-3)
                rng.gen_range(0..4)
            }
            3 => {  // Mittelfeld: medium-higher (1-3)
                let r: f64 = rng.gen();
                if r < 0.3 { 1 } else if r < 0.7 { 2 } else { 3 }
            }
            4 => {  // Industriezone: basic (0-1)
                let r: f64 = rng.gen();
                if r < 0.6 { 0 } else { 1 }
            }
            _ => 1,
        }
    }

    /// Generate income based on district and education.
    fn generate_income(district: u8, education: u8, rng: &mut SmallRng) -> f64 {
        let base = match district {
            0 => rng.gen_range(2.0..4.0),   // Grüntal: low
            1 => rng.gen_range(7.0..10.0),  // Sonnenberg: high
            2 => rng.gen_range(2.0..7.0),   // Hafenviertel: mixed
            3 => rng.gen_range(4.0..7.0),   // Mittelfeld: medium
            4 => rng.gen_range(3.0..5.0),   // Industriezone: low-medium
            _ => 5.0,
        };
        let education_bonus = (education as f64) * 0.5;
        let variation: f64 = rng.gen_range(-0.5..0.5);
        (base + education_bonus + variation).clamp(1.0, 10.0)
    }

    pub fn with_new_position(&self, pos: &Point2<f64>) -> Self {
        let mut ret = self.clone();
        ret.id = get_uuid();
        ret.pos = *pos;
        ret.home_pos = *pos;
        ret.movement_history = vec![*pos];
        ret
    }

    // mutate the creature properties and return a new instance (offspring)
    pub fn mutate(&self, rng: &mut SmallRng) -> Self {
        // Offspring inherits district, may gain education
        let education_upgrade: u8 = if rng.gen::<f64>() < 0.1 { 1 } else { 0 };
        let new_education = (self.education_level + education_upgrade).min(3);
        let income_variation: f64 = rng.gen_range(-0.5..0.5);
        let new_income = (self.income + income_variation).clamp(1.0, 10.0);

        let mut new_attitudes = self.attitudes.clone();
        // Slight random drift in offspring attitudes
        new_attitudes.political_satisfaction += rng.gen_range(-0.3..0.3);
        new_attitudes.ideology += rng.gen_range(-0.2..0.2);
        new_attitudes.institutional_trust += rng.gen_range(-0.2..0.2);
        new_attitudes.clamp();

        let political_state = PoliticalState::from_attitudes(&new_attitudes);

        let mut offspring = Creature {
            speed: self.speed.get_mutated(rng),
            size: self.size.get_mutated(rng),
            sense_range: self.sense_range.get_mutated(rng),
            reach: self.reach.get_mutated(rng),
            flee_distance: self.flee_distance.get_mutated(rng),
            life_span: self.life_span.get_mutated(rng),
            energy: self.energy,
            species: self.species.clone(),

            ..Creature::default(&self.home_pos)
        };
        offspring.district = self.district;
        offspring.education_level = new_education;
        offspring.income = new_income;
        offspring.age_group = 0; // offspring are young
        offspring.attitudes = new_attitudes;
        offspring.political_state = political_state;
        offspring
    }

    // copy self, but increase age.
    pub fn grow_older(&self) -> Self {
        let Creature {
            id,
            speed,
            size,
            sense_range,
            reach,
            flee_distance,
            life_span,
            energy,
            ..
        } = *self;

        let mut grown = Creature {
            id,
            speed,
            size,
            sense_range,
            reach,
            flee_distance,
            life_span,
            energy,
            age: self.age + 1,
            species: self.species.clone(),

            ..Creature::default(&self.home_pos)
        };
        // Preserve social layer
        grown.district = self.district;
        grown.education_level = self.education_level;
        grown.income = self.income;
        grown.age_group = self.age_group;
        grown.attitudes = self.attitudes.clone();
        grown.political_state = self.political_state.clone();
        grown
    }

    pub fn get_size(&self) -> f64 {
        self.size.0
    }
    pub fn get_speed(&self) -> f64 {
        self.speed.0 * self.size.0 / 10.
    }
    pub fn set_speed(&mut self, speed: f64) {
        self.speed.0 = speed
    }
    pub fn get_sense_range(&self) -> f64 {
        self.sense_range.0
    }
    pub fn set_sense_range(&mut self, sense: f64) {
        self.sense_range.0 = sense
    }
    pub fn get_reach(&self) -> f64 {
        self.reach.0.max(self.get_size() / 4.)
    }
    pub fn get_life_span(&self) -> f64 {
        self.life_span.0
    }

    pub fn get_traits(&self) -> HashMap<&'static str, (f64, f64)> {
        let mut traits = HashMap::new();
        traits.insert("size", self.size.into());
        traits.insert("speed", self.speed.into());
        traits.insert("sense_range", self.sense_range.into());
        traits.insert("reach", self.reach.into());
        traits.insert("life_span", self.life_span.into());
        traits.insert("flee_distance", self.flee_distance.into());
        traits
    }

    pub fn is_alive(&self) -> bool {
        !matches!(self.state, CreatureState::DEAD)
    }

    pub fn is_active(&self) -> bool {
        matches!(self.state, CreatureState::ACTIVE)
    }

    pub fn move_to(&mut self, pos: Point2<f64>) {
        self.pos = pos;
        self.movement_history.push(pos);
        let cost = self.get_motion_energy_cost();
        self.apply_energy_cost(cost);
    }

    pub fn get_motion_energy_cost(&self) -> f64 {
        ENERGY_COST_SCALE_FACTOR
            * (self.get_size().powi(3) * self.get_speed().powi(2) + self.get_sense_range())
    }

    pub fn get_direction(&self) -> Unit<Vector2<f64>> {
        let disp = self
            .objective
            .as_ref()
            .map(|o| {
                let d = o.pos - self.pos;
                match o.intensity {
                    ObjectiveIntensity::MinorAversion
                    | ObjectiveIntensity::ModerateAversion
                    | ObjectiveIntensity::MajorAversion
                    | ObjectiveIntensity::VitalAversion => -1. * d,
                    _ => d,
                }
            })
            .filter(|d| d.norm() != 0.)
            .unwrap_or_else(|| {
                self.get_last_position()
                    .map(|last| self.pos - last)
                    .unwrap_or_else(|| Vector2::x())
            });

        Unit::new_normalize(disp)
    }

    pub fn add_objective(&mut self, obj: Objective) {
        match &self.objective {
            None => self.objective = Some(obj),
            Some(o) if obj.intensity > o.intensity => self.objective = Some(obj),
            Some(o) if obj.intensity == o.intensity => {
                let pos = self.get_position();
                let dist_to_old = (pos - o.pos).norm();
                let dist_to_new = (pos - obj.pos).norm();

                if dist_to_new < dist_to_old {
                    self.objective = Some(obj)
                }
            }
            Some(_) => {}
        };
    }

    pub fn get_objective(&self) -> Option<Objective> {
        self.objective.clone()
    }

    pub fn reset_objective(&mut self) {
        self.objective = None;
    }

    pub fn eat_food(&mut self, step: Step, food: &dyn Edible) {
        self.foods_eaten
            .push((step, food.get_edible_id(), food.get_type()))
    }

    pub fn sleep(&mut self) {
        self.state = CreatureState::ASLEEP;
    }

    pub fn kill(&mut self) {
        self.state = CreatureState::DEAD;
    }

    pub fn get_position(&self) -> Point2<f64> {
        self.pos
    }

    pub fn get_last_position(&self) -> Option<Point2<f64>> {
        let len = self.movement_history.len();
        if len <= 1 {
            return None;
        }
        Some(self.movement_history[len - 2])
    }

    pub fn can_see(&self, pt: &Point2<f64>) -> bool {
        (pt - self.pos).norm() <= self.get_sense_range()
    }

    pub fn can_reach(&self, pt: &Point2<f64>) -> bool {
        if self.can_reach_now(pt) {
            return true;
        }

        let last = self.get_last_position();
        if last.is_none() {
            return false;
        }

        distance_to_line(&self.get_position(), &last.unwrap(), pt)
            .map(|d| d <= self.get_reach())
            .unwrap_or(false)
    }

    pub fn within_flee_distance(&self, pt: &Point2<f64>) -> bool {
        if self.can_see(pt) {
            let d = (self.get_position() - pt).norm();
            d < self.flee_distance.0
        } else {
            false
        }
    }

    pub fn can_reach_now(&self, pt: &Point2<f64>) -> bool {
        (pt - self.pos).norm() <= self.get_reach()
    }

    pub fn get_energy_left(&self) -> f64 {
        (self.energy - self.energy_consumed).max(0.)
    }

    pub fn apply_energy_cost(&mut self, cost: f64) {
        self.energy_consumed += cost;

        if self.get_energy_left() <= 0. {
            self.state = CreatureState::DEAD;
        }
    }
}
