use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};

use super::attitudes::Attitudes;
use super::latent_traits::LatentTraits;

/// Political behavior state of a Blob citizen.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoliticalState {
    /// Party affiliation: 0=Fortschritt(left), 1=Mitte, 2=Tradition(right), 3=Unabhängige
    pub party_affiliation: Option<u8>,
    /// Whether this blob will participate in the next election
    pub will_vote: bool,
    /// Readiness to join a protest (0.0 - 1.0)
    pub protest_readiness: f64,
    /// Party voted for in last election
    pub last_vote: Option<u8>,
    /// Weeks since last party change (cooldown timer)
    #[serde(default)]
    pub party_stability_weeks: u16,
}

impl PoliticalState {
    /// Derive political state from attitudes (initial creation).
    /// Children (age < 18) get no political behavior.
    pub fn from_attitudes(
        attitudes: &Attitudes,
        age: u8,
        education_level: u8,
        latent_traits: &LatentTraits,
        rng: &mut SmallRng,
    ) -> Self {
        if age < 18 {
            return PoliticalState {
                party_affiliation: None,
                will_vote: false,
                protest_readiness: 0.0,
                last_vote: None,
                party_stability_weeks: 0,
            };
        }

        let party = Self::determine_party(attitudes, None, rng);
        let will_vote = Self::determine_will_vote(age, education_level, latent_traits, rng);
        let protest_readiness = Self::compute_protest_readiness(attitudes, latent_traits);

        PoliticalState {
            party_affiliation: Some(party),
            will_vote,
            protest_readiness,
            last_vote: None,
            party_stability_weeks: 0,
        }
    }

    /// Probabilistic party choice using softmax with strong party loyalty.
    ///
    /// Threshold-based switching: party change requires ideology mismatch > 2.0
    /// AND a low random roll. Realistic turnover: ~1-3 switches per 22 years.
    fn determine_party(
        attitudes: &Attitudes,
        current_party: Option<u8>,
        rng: &mut SmallRng,
    ) -> u8 {
        if let Some(party) = current_party {
            let party_center = match party {
                0 => 3.7, 1 => 5.5, 2 => 7.3, _ => 5.5,
            };
            let mismatch = (attitudes.ideology - party_center).abs();

            // Threshold model: only consider switching when ideology strongly
            // diverges from current party center (>2.0 points on 1-10 scale).
            // Even then, inertia keeps most people loyal (base loyalty 92-97%).
            let satisfaction_factor = attitudes.political_satisfaction / 10.0;
            let trust_factor = attitudes.institutional_trust / 10.0;
            let base_loyalty = 0.97 + satisfaction_factor * 0.02 + trust_factor * 0.01;
            let loyalty = if mismatch > 2.0 {
                // Strong mismatch: loyalty drops, but stays above 50%
                (base_loyalty - (mismatch - 2.0) * 0.10).clamp(0.60, 1.0)
            } else {
                base_loyalty.clamp(0.97, 1.0)
            };

            if rng.gen::<f64>() < loyalty {
                return party;
            }
        }

        let temperature = 1.0;
        // Add perceptual noise: voters don't perfectly map ideology→party (issue salience, framing)
        let ideo = attitudes.ideology + rng.gen_range(-0.45..0.45);

        // Unabhängige: high distrust + high alienation → "none of them represent me"
        let alienation_factor = (10.0 - attitudes.political_satisfaction) / 10.0;
        let p_unabh = (((10.0 - attitudes.institutional_trust) / 10.0) * 0.3
            + alienation_factor * 0.15).clamp(0.0, 0.6);

        let remaining = (1.0 - p_unabh).max(0.0);
        let centered = ideo - 5.5; // center ideology for softmax (5.5 = political center)
        let scores = [
            (-centered / temperature).exp(), // Fortschritt (left)
            (0.0f64 / temperature).exp(),    // Mitte (NO artificial advantage)
            (centered / temperature).exp(),  // Tradition (right)
        ];
        let score_sum: f64 = scores.iter().sum();

        let p_fortschritt = remaining * scores[0] / score_sum;
        let p_mitte = remaining * scores[1] / score_sum;
        let p_tradition = remaining * scores[2] / score_sum;

        let roll: f64 = rng.gen();
        if roll < p_fortschritt {
            0
        } else if roll < p_fortschritt + p_mitte {
            1
        } else if roll < p_fortschritt + p_mitte + p_tradition {
            2
        } else {
            3
        }
    }

    /// Probabilistic voter turnout model.
    /// Base probability ~65% (Germany: 70-76%), modified by education, age,
    /// self-efficacy, and political alienation.
    fn determine_will_vote(
        age: u8,
        education_level: u8,
        latent_traits: &LatentTraits,
        rng: &mut SmallRng,
    ) -> bool {
        if age < 18 {
            return false;
        }

        let base_prob = 0.68; // raised from 0.60 — German Kommunalwahl ~55-65%
        let education_bonus = education_level as f64 * 0.015; // halved to reduce 38pp gap to ~15pp
        let age_bonus = if age > 40 { 0.04 } else { -0.03 };
        let efficacy_bonus = (latent_traits.self_efficacy - 5.0) * 0.012; // halved to reduce edu-turnout gap
        // Alienation penalty reduced — even alienated people sometimes vote (protest vote)
        let alienation_penalty = (latent_traits.party_indifference / 10.0) * 0.25; // reduced from 0.40
        let vote_importance_bonus = (latent_traits.vote_importance - 5.0) * 0.02;

        // "Life gets in the way": illness, travel, weather, apathy — random reduction
        let life_penalty = rng.gen_range(0.0..0.15);
        let p_vote = (base_prob + education_bonus + age_bonus + efficacy_bonus
            + vote_importance_bonus - alienation_penalty - life_penalty)
            .clamp(0.35, 0.78); // floor 35%, ceiling 78%
        rng.gen::<f64>() < p_vote
    }

    /// Compute protest readiness from attitudes and latent traits.
    /// Weighted combination of dissatisfaction (40%), distrust (40%),
    /// and low self-efficacy (20%).
    fn compute_protest_readiness(attitudes: &Attitudes, latent_traits: &LatentTraits) -> f64 {
        let dissatisfaction = (10.0 - attitudes.political_satisfaction) / 10.0;
        let distrust = (10.0 - attitudes.institutional_trust) / 10.0;
        let low_efficacy = 1.0 - latent_traits.self_efficacy / 10.0;
        // Offset -0.15: only genuinely dissatisfied blobs show significant readiness
        (dissatisfaction * 0.25 + distrust * 0.25 + low_efficacy * 0.10 - 0.15).clamp(0.0, 1.0)
    }

    /// Update political state after attitude changes (weekly).
    /// Party re-evaluation only after 26-week cooldown to prevent excessive switching.
    pub fn update_from_attitudes(
        &mut self,
        attitudes: &Attitudes,
        age: u8,
        education_level: u8,
        latent_traits: &LatentTraits,
        rng: &mut SmallRng,
    ) {
        if age < 18 {
            self.party_affiliation = None;
            self.will_vote = false;
            self.protest_readiness = 0.0;
            return;
        }

        // Party re-evaluation only after cooldown (52 weeks = ~1 year)
        self.party_stability_weeks = self.party_stability_weeks.saturating_add(1);
        if self.party_stability_weeks >= 52 {
            let old_party = self.party_affiliation;
            self.party_affiliation =
                Some(Self::determine_party(attitudes, self.party_affiliation, rng));
            if self.party_affiliation != old_party {
                self.party_stability_weeks = 0; // reset on change
            }
        }
        self.will_vote = Self::determine_will_vote(age, education_level, latent_traits, rng);
        self.protest_readiness = Self::compute_protest_readiness(attitudes, latent_traits);
    }
}

impl Default for PoliticalState {
    fn default() -> Self {
        PoliticalState {
            party_affiliation: Some(1), // Mitte by default
            will_vote: true,
            protest_readiness: 0.0,
            last_vote: None,
            party_stability_weeks: 0,
        }
    }
}
