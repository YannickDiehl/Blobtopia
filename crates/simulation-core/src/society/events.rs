use serde::{Deserialize, Serialize};

/// Events that can be triggered to affect the simulation.
/// Uses externally tagged serde format: "Election" or {"EconomicCrisis": {...}}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum BlobtopiaEvent {
    /// Economic crisis: lower income and satisfaction in affected districts
    EconomicCrisis {
        severity: f64,               // 0.0 - 1.0
        affected_districts: Vec<u8>, // empty = all
    },
    /// Trigger an election
    Election,
    /// Political scandal: lower trust in target party
    Scandal {
        target_party: u8,  // 0-3
        magnitude: f64,    // 0.0 - 1.0
    },
    /// Natural disaster: reduce satisfaction in one district
    NaturalDisaster {
        affected_district: u8,
        severity: f64,  // 0.0 - 1.0
    },
    /// Policy change: shift ideology of all blobs
    PolicyChange {
        name: String,
        ideology_shift: f64,  // negative = left, positive = right
    },
    /// Media campaign: increase party sympathy
    MediaCampaign {
        party: u8,
        reach: f64,  // 0.0 - 1.0 (fraction of population affected)
    },
    /// Education reform: increase education chances in a district
    EducationReform {
        target_district: u8,
    },
    /// Economic boom: increase income and satisfaction
    EconomicBoom {
        magnitude: f64,             // 0.0 - 1.0
        affected_districts: Vec<u8>, // empty = all
    },
    /// Successful civic engagement: increase trust and efficacy
    CivicSuccess {
        affected_district: u8,
        magnitude: f64,  // 0.0 - 1.0
    },
    /// Cultural event: increase social capital and satisfaction
    CulturalEvent {
        affected_district: u8,
        magnitude: f64,  // 0.0 - 1.0
    },
    /// Controversial issue debate: polarizes society along a dimension
    /// (climate, security, inequality). Forces people to take sides.
    IssueDebate {
        topic: String,
        /// Which dimension: "climate", "security", "inequality"
        dimension: String,
        intensity: f64,  // 0.0 - 1.0
    },
    /// Inequality report: reveals income gap, triggers relative deprivation
    InequalityReport {
        magnitude: f64,  // 0.0 - 1.0
    },
    /// Cross-district conflict: two districts clash over values,
    /// strengthening regional identities and pushing apart
    CrossDistrictConflict {
        district_a: u8,
        district_b: u8,
        intensity: f64,  // 0.0 - 1.0
    },
    /// Corruption revelation: global trust collapse, protest wave
    CorruptionRevelation {
        severity: f64,  // 0.0 - 1.0
    },
}

/// A scheduled event entry from the event calendar JSON file.
#[derive(Debug, Clone, Deserialize)]
pub struct EventCalendarEntry {
    pub tick: u32,
    pub event: BlobtopiaEvent,
    /// Optional comment (ignored by simulation, for documentation).
    #[serde(default)]
    pub comment: Option<String>,
}

/// Load event calendar from JSON string.
pub fn load_event_calendar(json_str: &str) -> Result<Vec<EventCalendarEntry>, serde_json::Error> {
    let mut entries: Vec<EventCalendarEntry> = serde_json::from_str(json_str)?;
    entries.sort_by_key(|e| e.tick);
    Ok(entries)
}
