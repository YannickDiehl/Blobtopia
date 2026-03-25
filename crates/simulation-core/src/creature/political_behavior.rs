use serde::{Deserialize, Serialize};

use super::attitudes::Attitudes;

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
}

impl PoliticalState {
    /// Derive political state from attitudes.
    pub fn from_attitudes(attitudes: &Attitudes) -> Self {
        let party = Self::determine_party(attitudes);
        let will_vote = attitudes.political_satisfaction > 2.0
            && attitudes.institutional_trust > 1.5;
        let protest_readiness = ((5.0 - attitudes.political_satisfaction)
            * (5.0 - attitudes.institutional_trust)
            / 25.0)
            .max(0.0)
            .min(1.0);

        PoliticalState {
            party_affiliation: Some(party),
            will_vote,
            protest_readiness,
            last_vote: None,
        }
    }

    /// Determine party based on ideology and trust.
    fn determine_party(attitudes: &Attitudes) -> u8 {
        // Disaffected citizens with very low trust → Independents
        if attitudes.institutional_trust < 3.0 {
            return 3; // Unabhängige
        }

        match attitudes.ideology {
            x if x < -1.5 => 0,  // Fortschritt (left)
            x if x <= 1.5 => 1,  // Mitte (center)
            _ => 2,              // Tradition (right)
        }
    }

    /// Update political state after attitude changes.
    pub fn update_from_attitudes(&mut self, attitudes: &Attitudes) {
        self.party_affiliation = Some(Self::determine_party(attitudes));
        self.will_vote = attitudes.political_satisfaction > 2.0
            && attitudes.institutional_trust > 1.5;
        self.protest_readiness = ((5.0 - attitudes.political_satisfaction)
            * (5.0 - attitudes.institutional_trust)
            / 25.0)
            .max(0.0)
            .min(1.0);
    }
}

impl Default for PoliticalState {
    fn default() -> Self {
        PoliticalState {
            party_affiliation: Some(1), // Mitte by default
            will_vote: true,
            protest_readiness: 0.0,
            last_vote: None,
        }
    }
}
