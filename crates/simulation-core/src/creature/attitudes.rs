use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};

/// Attitudes and dispositions of a Blob citizen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attitudes {
    /// How satisfied is the blob with the current political situation? (0.0 - 10.0)
    pub political_satisfaction: f64,
    /// Political ideology: -5.0 (left) to +5.0 (right)
    pub ideology: f64,
    /// Trust in political institutions (0.0 - 10.0)
    pub institutional_trust: f64,
}

impl Attitudes {
    /// Initialize attitudes based on district assignment.
    pub fn for_district(district: u8, rng: &mut SmallRng) -> Self {
        match district {
            // Grüntal: low satisfaction, left-leaning, low-medium trust
            0 => Attitudes {
                political_satisfaction: rng.gen_range(3.0..5.0),
                ideology: rng.gen_range(-3.0..0.0),
                institutional_trust: rng.gen_range(2.0..5.0),
            },
            // Sonnenberg: high satisfaction, right-leaning, high trust
            1 => Attitudes {
                political_satisfaction: rng.gen_range(6.0..9.0),
                ideology: rng.gen_range(0.0..3.0),
                institutional_trust: rng.gen_range(6.0..9.0),
            },
            // Hafenviertel: broadly scattered, creative/diverse
            2 => Attitudes {
                political_satisfaction: rng.gen_range(2.0..8.0),
                ideology: rng.gen_range(-3.0..3.0),
                institutional_trust: rng.gen_range(2.0..7.0),
            },
            // Mittelfeld: centrist, medium satisfaction
            3 => Attitudes {
                political_satisfaction: rng.gen_range(4.0..7.0),
                ideology: rng.gen_range(-1.0..1.0),
                institutional_trust: rng.gen_range(4.0..7.0),
            },
            // Industriezone: low satisfaction, left-leaning, low trust
            4 => Attitudes {
                political_satisfaction: rng.gen_range(2.0..4.0),
                ideology: rng.gen_range(-3.0..-1.0),
                institutional_trust: rng.gen_range(1.0..4.0),
            },
            _ => Attitudes {
                political_satisfaction: 5.0,
                ideology: 0.0,
                institutional_trust: 5.0,
            },
        }
    }

    /// Clamp all values to their valid ranges.
    pub fn clamp(&mut self) {
        self.political_satisfaction = self.political_satisfaction.clamp(0.0, 10.0);
        self.ideology = self.ideology.clamp(-5.0, 5.0);
        self.institutional_trust = self.institutional_trust.clamp(0.0, 10.0);
    }
}

impl Default for Attitudes {
    fn default() -> Self {
        Attitudes {
            political_satisfaction: 5.0,
            ideology: 0.0,
            institutional_trust: 5.0,
        }
    }
}
