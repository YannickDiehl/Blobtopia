use nalgebra::Point2;
use rand::{rngs::SmallRng, Rng};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::district_profile::*;
use crate::society::blob::{
    FIRST_NAMES_D0, FIRST_NAMES_D1, FIRST_NAMES_D2, FIRST_NAMES_D3, FIRST_NAMES_D4,
    LAST_NAMES_D0, LAST_NAMES_D1, LAST_NAMES_D2, LAST_NAMES_D3, LAST_NAMES_D4,
};

/// District definition with geographic bounds, visual properties, and behavioral profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct District {
    pub id: u8,
    pub name: String,
    /// Grid bounds: (x_min, y_min, x_max, y_max)
    pub bounds: (f64, f64, f64, f64),
    /// Target number of blobs
    pub target_population: usize,
    /// CSS hex color (e.g. "#4ecca3")
    pub color_hex: String,
    /// Three.js hex color (e.g. 0x4ecca3)
    pub color_3d: u32,
    /// All district-specific behavioral parameters (skipped in serialization).
    #[serde(skip)]
    pub profile: DistrictProfile,
}

/// A notable structure in the city.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Structure {
    pub id: Uuid,
    pub structure_type: StructureType,
    pub position: Point2<f64>,
    pub radius: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum StructureType {
    Parliament,
    Marketplace,
    MediaCenter,
    CentralSquare,
    University,
    Library,
}

/// The Blobtopia city layout with districts.
pub struct BlobtopiaLayout {
    pub districts: Vec<District>,
    pub structures: Vec<Structure>,
}

impl BlobtopiaLayout {
    pub fn new() -> Self {
        let districts = vec![
            District {
                id: 0,
                name: "Grüntal".to_string(),
                bounds: (64.0, 0.0, 176.0, 80.0),  // Grüntal (from editor districtMap)
                target_population: 80,
                color_hex: "#4ecca3".to_string(),
                color_3d: 0x4ecca3,
                profile: DistrictProfile {
                    first_names: FIRST_NAMES_D0,
                    last_names: LAST_NAMES_D0,
                    // Grüntal: mostly basic, some higher/academic (no district is 100% homogeneous)
                    // P(none)=0.30, P(basic)=0.40, P(higher)=0.20, P(academic)=0.10
                    education_cumulative: [0.30, 0.70, 0.90, 1.0],
                    income_range: (1200.0, 3500.0),  // wider, more overlap with other districts
                    attitude_ranges: AttitudeRanges {
                        satisfaction: (3.0, 7.0),    // wider range (was 3.0-5.0)
                        ideology: (5.05, 7.75),      // narrower conservative (1-10 scale)
                        trust: (2.5, 6.0),           // raised floor (was 2.0-5.0)
                    },
                    latent_bases: LatentBases {
                        efficacy: 4.0,   // raised from 3.0 (no district below 3.5)
                        social: 6.0,
                        authoritarianism: 6.0,
                        alienation: 6.0,
                        materialism: 6.0,
                    },
                    color_hex: "#4ecca3",
                    color_3d: 0x4ecca3,
                    lunch_hour: 12.0,
                },
            },
            District {
                id: 1,
                name: "Sonnenberg".to_string(),
                bounds: (0.0, 0.0, 176.0, 216.0),  // Sonnenberg (from editor districtMap)
                target_population: 80,
                color_hex: "#f0c929".to_string(),
                color_3d: 0xf0c929,
                profile: DistrictProfile {
                    first_names: FIRST_NAMES_D1,
                    last_names: LAST_NAMES_D1,
                    // Sonnenberg: mostly academic, but some lower education (realistic mix)
                    // P(none)=0.05, P(basic)=0.10, P(higher)=0.35, P(academic)=0.50
                    education_cumulative: [0.05, 0.15, 0.50, 1.0],
                    income_range: (2500.0, 5500.0),   // lowered floor for overlap
                    attitude_ranges: AttitudeRanges {
                        satisfaction: (4.0, 8.0),
                        ideology: (3.7, 6.4),         // progressive-leaning (1-10 scale)
                        trust: (4.0, 7.5),
                    },
                    latent_bases: LatentBases {
                        efficacy: 6.5,   // lowered from 7.0
                        social: 5.5,     // raised from 5.0
                        authoritarianism: 3.5,  // raised from 3.0 (no district below 3.5)
                        alienation: 3.5,        // raised from 2.5
                        materialism: 4.0,
                    },
                    color_hex: "#f0c929",
                    color_3d: 0xf0c929,
                    lunch_hour: 12.0,
                },
            },
            District {
                id: 2,
                name: "Hafenviertel".to_string(),
                bounds: (56.0, 0.0, 248.0, 248.0),  // Hafenviertel (from editor districtMap)
                target_population: 120,
                color_hex: "#5c9ded".to_string(),
                color_3d: 0x5c9ded,
                profile: DistrictProfile {
                    first_names: FIRST_NAMES_D2,
                    last_names: LAST_NAMES_D2,
                    // Hafenviertel: uniform mix (most diverse district)
                    education_cumulative: [0.25, 0.50, 0.75, 1.0],
                    income_range: (1200.0, 4500.0),
                    attitude_ranges: AttitudeRanges {
                        satisfaction: (2.5, 7.5),    // slightly narrowed extremes
                        ideology: (3.25, 7.75),      // most diverse district (1-10 scale)
                        trust: (2.5, 7.0),           // raised floor
                    },
                    latent_bases: LatentBases {
                        efficacy: 5.0,
                        social: 5.0,     // raised from 4.5
                        authoritarianism: 4.5,  // raised from 3.5 (closer to center)
                        alienation: 5.0,
                        materialism: 5.0,  // raised from 4.5
                    },
                    color_hex: "#5c9ded",
                    color_3d: 0x5c9ded,
                    lunch_hour: 12.0,
                },
            },
            District {
                id: 3,
                name: "Mittelfeld".to_string(),
                bounds: (0.0, 104.0, 64.0, 248.0),  // Mittelfeld (from editor districtMap)
                target_population: 120,
                color_hex: "#f09a40".to_string(),
                color_3d: 0xf09a40,
                profile: DistrictProfile {
                    first_names: FIRST_NAMES_D3,
                    last_names: LAST_NAMES_D3,
                    // Mittelfeld: medium-higher (adds 5% none for realism)
                    // P(none)=0.05, P(basic)=0.25, P(higher)=0.40, P(academic)=0.30
                    education_cumulative: [0.05, 0.30, 0.70, 1.0],
                    income_range: (1800.0, 4500.0),   // wider
                    attitude_ranges: AttitudeRanges {
                        satisfaction: (3.5, 7.5),     // wider (was 4.0-7.0)
                        ideology: (4.15, 6.85),       // centrist (1-10 scale)
                        trust: (3.5, 7.0),            // slightly wider
                    },
                    latent_bases: LatentBases {
                        efficacy: 5.5,
                        social: 6.0,     // lowered from 6.5
                        authoritarianism: 5.0,
                        alienation: 4.5,  // raised from 4.0
                        materialism: 5.5,
                    },
                    color_hex: "#f09a40",
                    color_3d: 0xf09a40,
                    lunch_hour: 12.0,
                },
            },
            District {
                id: 4,
                name: "Industriezone".to_string(),
                bounds: (176.0, 0.0, 248.0, 184.0),  // Industriezone (from editor districtMap)
                target_population: 100,
                color_hex: "#999999".to_string(),
                color_3d: 0x999999,
                profile: DistrictProfile {
                    first_names: FIRST_NAMES_D4,
                    last_names: LAST_NAMES_D4,
                    // Industriezone: mostly basic, but some higher education (realistic mix)
                    // P(none)=0.40, P(basic)=0.40, P(higher)=0.15, P(academic)=0.05
                    education_cumulative: [0.40, 0.80, 0.95, 1.0],
                    income_range: (1200.0, 3200.0),   // wider overlap
                    attitude_ranges: AttitudeRanges {
                        satisfaction: (2.5, 6.5),     // raised floor+ceiling (was 1.5-5.0)
                        ideology: (3.7, 7.3),         // symmetric (1-10 scale)
                        trust: (2.0, 5.5),            // raised floor (was 0.5-5.0)
                    },
                    latent_bases: LatentBases {
                        efficacy: 3.5,   // raised from 2.5
                        social: 6.5,     // lowered from 7.0
                        authoritarianism: 6.0,
                        alienation: 6.0,  // lowered from 7.0
                        materialism: 6.5,  // lowered from 7.0
                    },
                    color_hex: "#999999",
                    color_3d: 0x999999,
                    lunch_hour: 11.0,
                },
            },
        ];

        let structures = vec![
            Structure {
                id: Uuid::new_v4(),
                structure_type: StructureType::Parliament,
                position: Point2::new(125.0, 125.0),
                radius: 10.0,
            },
            Structure {
                id: Uuid::new_v4(),
                structure_type: StructureType::Marketplace,
                position: Point2::new(125.0, 115.0),
                radius: 15.0,
            },
            Structure {
                id: Uuid::new_v4(),
                structure_type: StructureType::MediaCenter,
                position: Point2::new(115.0, 120.0),
                radius: 6.0,
            },
            Structure {
                id: Uuid::new_v4(),
                structure_type: StructureType::CentralSquare,
                position: Point2::new(125.0, 105.0),
                radius: 12.0,
            },
            Structure {
                id: Uuid::new_v4(),
                structure_type: StructureType::University,
                position: Point2::new(125.0, 200.0),
                radius: 9.0,
            },
            Structure {
                id: Uuid::new_v4(),
                structure_type: StructureType::Library,
                position: Point2::new(125.0, 25.0),
                radius: 6.0,
            },
        ];

        BlobtopiaLayout {
            districts,
            structures,
        }
    }

    /// Get a random location within a specific district.
    pub fn get_random_location_in_district(&self, district: u8, rng: &mut SmallRng) -> Point2<f64> {
        let d = &self.districts[district as usize];
        let x = rng.gen_range(d.bounds.0..d.bounds.2);
        let y = rng.gen_range(d.bounds.1..d.bounds.3);
        Point2::new(x, y)
    }

    /// Determine which district a position falls in. Returns None if outside all districts.
    pub fn get_district_for_position(&self, pos: &Point2<f64>) -> Option<u8> {
        for d in &self.districts {
            if pos.x >= d.bounds.0
                && pos.x <= d.bounds.2
                && pos.y >= d.bounds.1
                && pos.y <= d.bounds.3
            {
                return Some(d.id);
            }
        }
        None
    }

    /// Get the population distribution: how many blobs per district for N total.
    pub fn get_population_distribution(&self, total: usize) -> Vec<(u8, usize)> {
        let total_target: usize = self.districts.iter().map(|d| d.target_population).sum();
        self.districts
            .iter()
            .map(|d| {
                let count = (d.target_population as f64 / total_target as f64 * total as f64).round() as usize;
                (d.id, count)
            })
            .collect()
    }

    /// Number of districts.
    pub fn num_districts(&self) -> u8 {
        self.districts.len() as u8
    }

    /// Get the profile for a district by ID. Panics if out of bounds.
    pub fn profile(&self, district: u8) -> &DistrictProfile {
        &self.districts[district as usize].profile
    }

    /// Get district name by ID.
    pub fn district_name(&self, district: u8) -> &str {
        &self.districts[district as usize].name
    }
}
