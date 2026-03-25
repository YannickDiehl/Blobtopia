/// Centralized district profile — all district-specific parameters in one place.
///
/// When the map changes (different number of districts, different semantics),
/// only the profile definitions in `GlobtopiaLayout::new()` need updating.

/// Ranges for initial attitude generation (min..max for each dimension).
#[derive(Debug, Clone)]
pub struct AttitudeRanges {
    pub satisfaction: (f64, f64),
    pub ideology: (f64, f64),
    pub trust: (f64, f64),
}

/// District-specific base values for the 5 latent constructs.
#[derive(Debug, Clone)]
pub struct LatentBases {
    pub efficacy: f64,
    pub social: f64,
    pub authoritarianism: f64,
    pub alienation: f64,
    pub materialism: f64,
}

/// All district-specific parameters centralized in one struct.
#[derive(Debug, Clone)]
pub struct DistrictProfile {
    /// District-specific first name pool (70% chance).
    pub first_names: &'static [&'static str],
    /// District-specific last name pool (70% chance).
    pub last_names: &'static [&'static str],
    /// Cumulative education level probabilities: [P(≤0), P(≤1), P(≤2), P(≤3)].
    /// Example: [0.4, 0.8, 1.0, 1.0] → 40% none, 40% basic, 20% higher, 0% academic.
    pub education_cumulative: [f64; 4],
    /// Base salary range (min, max) in EUR before education bonus.
    pub income_range: (f64, f64),
    /// Initial attitude distributions.
    pub attitude_ranges: AttitudeRanges,
    /// Base values for the 5 latent constructs.
    pub latent_bases: LatentBases,
    /// CSS hex color string, e.g. "#4ecca3".
    pub color_hex: &'static str,
    /// Three.js hex color value, e.g. 0x4ecca3.
    pub color_3d: u32,
    /// Default lunch start hour (e.g. 12.0, or 11.0 for shift workers).
    pub lunch_hour: f32,
}

impl Default for DistrictProfile {
    fn default() -> Self {
        DistrictProfile {
            first_names: &[],
            last_names: &[],
            education_cumulative: [0.25, 0.5, 0.75, 1.0],
            income_range: (1500.0, 4000.0),
            attitude_ranges: AttitudeRanges {
                satisfaction: (3.0, 7.0),
                ideology: (-2.0, 2.0),
                trust: (3.0, 7.0),
            },
            latent_bases: LatentBases {
                efficacy: 5.0,
                social: 5.0,
                authoritarianism: 5.0,
                alienation: 5.0,
                materialism: 5.0,
            },
            color_hex: "#666666",
            color_3d: 0x666666,
            lunch_hour: 12.0,
        }
    }
}
