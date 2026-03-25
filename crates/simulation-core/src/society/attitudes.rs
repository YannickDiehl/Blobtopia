use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::stage::district_profile::DistrictProfile;
use super::latent_traits::LatentTraits;

fn policy_default() -> f64 { 5.0 }

/// Attitudes and dispositions of a Blob citizen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attitudes {
    /// How satisfied is the blob with the current political situation? (0.0 - 10.0)
    pub political_satisfaction: f64,
    /// Links-Rechts-Selbsteinschätzung: 1.0 (links) to 10.0 (rechts)
    pub ideology: f64,
    /// Trust in political institutions (0.0 - 10.0)
    pub institutional_trust: f64,

    // =================================================================
    // Policy-Positionen (0.0 bis 10.0, Neutralpunkt = 5.0)
    // Themenspezifische Einstellungen, die auf Events reagieren.
    // =================================================================

    /// Wirtschaftspolitik: 0 = Staat/Regulation, 10 = Markt/Deregulierung
    #[serde(default = "policy_default")]
    pub policy_economy: f64,
    /// Umweltpolitik: 0 = Umweltschutz Priorität, 10 = Wirtschaftswachstum Priorität
    #[serde(default = "policy_default")]
    pub policy_environment: f64,
    /// Sicherheitspolitik: 0 = Freiheit/Bürgerrechte, 10 = Ordnung/Kontrolle
    #[serde(default = "policy_default")]
    pub policy_security: f64,
    /// Sozialpolitik: 0 = Umverteilung/Solidarität, 10 = Eigenverantwortung
    #[serde(default = "policy_default")]
    pub policy_social: f64,
    /// Migrationspolitik: 0 = offen/liberal, 10 = restriktiv
    #[serde(default = "policy_default")]
    pub policy_migration: f64,
    /// Demokratieverständnis: 0 = direkt/basisdemokratisch, 10 = repräsentativ/elitär
    #[serde(default = "policy_default")]
    pub policy_democracy: f64,
}

impl Attitudes {
    /// Initialize attitudes based on district profile ranges + demographic modifiers.
    pub fn from_profile(
        profile: &DistrictProfile,
        education_level: u8,
        income: f64,
        age: u8,
        rng: &mut SmallRng,
    ) -> Self {
        let r = &profile.attitude_ranges;

        let mut ideology = rng.gen_range(r.ideology.0..r.ideology.1);
        let mut satisfaction = rng.gen_range(r.satisfaction.0..r.satisfaction.1);
        let mut trust = rng.gen_range(r.trust.0..r.trust.1);

        // Demographic modifiers
        ideology += (education_level as f64 - 1.5) * -0.27;
        ideology += (age as f64 - 45.0) * 0.009;
        satisfaction += (income - 3000.0) / 2000.0 * 0.7;
        satisfaction += (education_level as f64 - 1.5) * 0.25;
        trust += (education_level as f64 - 1.5) * 0.3;
        trust += (income - 3000.0) / 2000.0 * 0.35;

        // Policy positions initialized as 5.0 (neutral) — computed from traits in init_policy_positions()
        Attitudes {
            political_satisfaction: satisfaction.clamp(0.0, 10.0),
            ideology: ideology.clamp(1.0, 10.0),
            institutional_trust: trust.clamp(0.0, 10.0),
            policy_economy: 5.0,
            policy_environment: 5.0,
            policy_security: 5.0,
            policy_social: 5.0,
            policy_migration: 5.0,
            policy_democracy: 5.0,
        }
    }

    /// Compute initial policy positions from ideology + latent traits.
    /// Called once after both attitudes and traits are initialized.
    /// All policy values are on a 0.0–10.0 scale (5.0 = neutral).
    pub fn init_policy_positions(&mut self, traits: &LatentTraits) {
        let ideo_centered = (self.ideology - 5.5) / 4.5; // -1..+1

        // Economy: right = pro-market, materialists want less state
        self.policy_economy = (5.0 + ideo_centered * 3.0
            + (traits.economic_security_priority - 5.0) * 0.3).clamp(0.0, 10.0);

        // Environment: postmaterialists = pro-environment
        self.policy_environment = (5.0 + (5.0 - traits.environment_over_economy) * 0.8
            + ideo_centered * 0.5).clamp(0.0, 10.0);

        // Security: authoritarians want order
        self.policy_security = (5.0 + (traits.obedience_value - 5.0) * 0.4
            + (5.0 - traits.freedom_over_order) * 0.4
            + ideo_centered * 0.5).clamp(0.0, 10.0);

        // Social: left = redistribution
        self.policy_social = (5.0 + ideo_centered * 2.5
            + (traits.economic_security_priority - 5.0) * 0.3).clamp(0.0, 10.0);

        // Migration: authoritarians + right = more restrictive
        self.policy_migration = (5.0 + (traits.obedience_value - 5.0) * 0.3
            + (traits.strong_leader_preference - 5.0) * 0.2
            + ideo_centered * 2.0).clamp(0.0, 10.0);

        // Democracy: populists want direct, elitists want representative
        self.policy_democracy = (5.0 + (5.0 - traits.anti_elitism) * 0.4
            + (5.0 - traits.people_centrism) * 0.3
            + (traits.external_efficacy - 5.0) * 0.2).clamp(0.0, 10.0);
    }

    /// Clamp all values to realistic ranges.
    pub fn clamp(&mut self) {
        self.political_satisfaction = self.political_satisfaction.clamp(0.5, 9.5);
        self.ideology = self.ideology.clamp(1.0, 10.0);
        self.institutional_trust = self.institutional_trust.clamp(0.5, 9.5);
        self.policy_economy = self.policy_economy.clamp(0.0, 10.0);
        self.policy_environment = self.policy_environment.clamp(0.0, 10.0);
        self.policy_security = self.policy_security.clamp(0.0, 10.0);
        self.policy_social = self.policy_social.clamp(0.0, 10.0);
        self.policy_migration = self.policy_migration.clamp(0.0, 10.0);
        self.policy_democracy = self.policy_democracy.clamp(0.0, 10.0);
    }
}

impl Default for Attitudes {
    fn default() -> Self {
        Attitudes {
            political_satisfaction: 5.0,
            ideology: 5.5,
            institutional_trust: 5.0,
            policy_economy: 5.0,
            policy_environment: 5.0,
            policy_security: 5.0,
            policy_social: 5.0,
            policy_migration: 5.0,
            policy_democracy: 5.0,
        }
    }
}
