use nalgebra::Point2;
use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::attitudes::Attitudes;
use super::latent_traits::LatentTraits;
use super::political_behavior::PoliticalState;
use crate::stage::district_profile::DistrictProfile;

/// Emotional state of a Blob — computed from attitude changes and events.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BlobEmotion {
    /// -1.0 (very negative) to +1.0 (very positive)
    pub valence: f64,
    /// 0.0 (calm) to 1.0 (highly aroused/activated)
    pub arousal: f64,
    /// Human-readable label ("zufrieden", "wütend", etc.)
    pub label: String,
    /// Icon identifier for the thought bubble
    pub icon: String,
}

impl BlobEmotion {
    /// Compute emotion from current state and deltas.
    pub fn compute(
        satisfaction: f64,
        delta_satisfaction: f64,
        delta_trust: f64,
        protest_readiness: f64,
        has_event: bool,
    ) -> Self {
        // Valence: mix of absolute satisfaction level + recent change
        // Normalize by 3.0 (not 5.0) so typical satisfaction range 3-7 spans -0.67 to +0.67
        let valence = ((satisfaction - 5.0) / 3.0 * 0.6
                      + delta_satisfaction.clamp(-1.0, 1.0) * 0.4)
                      .clamp(-1.0, 1.0);

        // Arousal: how activated/agitated is the Blob?
        // Boosted weights for more emotional diversity
        let arousal = (delta_satisfaction.abs() * 0.5
                      + delta_trust.abs() * 0.4
                      + protest_readiness * 0.3
                      + if has_event { 0.4 } else { 0.0 })
                      .clamp(0.0, 1.0);

        // Map to label + icon via valence×arousal quadrants (lowered thresholds for diversity)
        let (label, icon) = if valence > 0.25 && arousal > 0.35 {
            ("begeistert", "excited")
        } else if valence > 0.15 && arousal > 0.1 {
            ("hoffnungsvoll", "hopeful")
        } else if valence > 0.1 {
            ("zufrieden", "satisfied")
        } else if valence < -0.15 && arousal > 0.25 {
            ("wuetend", "angry")
        } else if valence < -0.2 {
            ("frustriert", "frustrated")
        } else if valence < -0.05 && arousal > 0.15 {
            ("besorgt", "worried")
        } else if arousal > 0.3 {
            ("angespannt", "tense")
        } else {
            ("gelassen", "calm")
        };

        BlobEmotion {
            valence,
            arousal,
            label: label.into(),
            icon: icon.into(),
        }
    }
}

/// A Blob citizen of Blobtopia — a stable social actor (no death/reproduction).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Blob {
    pub id: Uuid,

    /// Full name (first + last)
    #[serde(default)]
    pub name: String,

    // --- Demographics (stable, rarely change) ---
    /// District ID (index into layout.districts).
    pub district: u8,
    /// Education: 0=none, 1=basic, 2=higher, 3=academic
    pub education_level: u8,
    /// Monthly net income in EUR (800 - 7000).
    pub income: f64,
    /// Age in years (2–78). Metric variable.
    #[serde(alias = "age_group")]
    pub age: u8,

    // --- Attitudes (change over time via social influence) ---
    pub attitudes: Attitudes,

    // --- Political behavior (derived from attitudes) ---
    pub political_state: PoliticalState,

    // --- Latent constructs (measurable only through indicators) ---
    pub latent_traits: LatentTraits,

    // --- Personality anchors (initial attitude values, for anchoring force) ---
    #[serde(default)]
    pub base_ideology: f64,
    #[serde(default)]
    pub base_satisfaction: f64,
    #[serde(default)]
    pub base_trust: f64,
    /// Initial income at spawn — target for income recovery after crises
    #[serde(default)]
    pub base_income: f64,

    // --- Latent trait personality anchors (initial values, for anchoring force) ---
    #[serde(default)]
    pub base_latent_traits: LatentTraits,

    // --- Personality traits (stable, Big Five-adjacent) ---
    /// Need for Cognitive Closure (Webster & Kruglanski 1994): 0.0-10.0
    /// High = needs clear answers, dislikes ambiguity, susceptible to simple narratives
    /// Low = tolerates ambiguity, open to complexity, resistant to populist framing
    /// Modulates: social influence susceptibility, ideology change speed, auth activation
    #[serde(default = "default_nfcc")]
    pub need_for_closure: f64,

    // --- Emotional state (computed each tick from attitude deltas) ---
    #[serde(default)]
    pub emotion: BlobEmotion,

    // --- Position in the city ---
    pub pos: Point2<f64>,
    pub home_pos: Point2<f64>,

    // --- Building assignments (persistent, set once at spawn) ---
    /// The building where this Blob lives. None until assigned.
    #[serde(default)]
    pub home_building_id: Option<u32>,
    /// Where this Blob works. None for unemployed or until assigned.
    #[serde(default)]
    pub workplace_id: Option<u32>,
    /// Preferred lunch/dining spot.
    #[serde(default)]
    pub lunch_spot_id: Option<u32>,
    /// Preferred leisure/social venue.
    #[serde(default)]
    pub leisure_spot_id: Option<u32>,
    /// Household this Blob belongs to. None for legacy/unassigned.
    #[serde(default)]
    pub household_id: Option<u32>,
}

// ═══════════════════════════════════════════════════════════════
// Name pools — district-weighted to create realistic ethnic clustering.
// Each district has a "local pool" (70% chance) and shares a "city-wide pool" (30%).
// This creates visible migration networks: Turkish families in Industriezone,
// academics with international names in Sonnenberg, diverse Hafenviertel, etc.
// ═══════════════════════════════════════════════════════════════

// City-wide first names (used by all districts, 30% chance)
pub(crate) const FIRST_NAMES_COMMON: &[&str] = &[
    "Alma", "Anton", "Clara", "Elias", "Finja", "Hanna", "Jonas", "Lina",
    "Milo", "Nora", "Oskar", "Paula", "Rosa", "Tilda", "Felix", "Greta",
    "Hugo", "Ida", "Leo", "Mara", "Nico", "Thea", "Emil", "Leni",
    "Karl", "Ella", "Tim", "Mika", "Nele", "Ben", "Pia", "Finn",
];

// District-specific first names (70% chance)
// 0=Grüntal: traditional German, rural/community-oriented
pub(crate) const FIRST_NAMES_D0: &[&str] = &[
    "Heike", "Jürgen", "Monika", "Uwe", "Sabine", "Dieter", "Petra",
    "Gerd", "Renate", "Bernd", "Karin", "Manfred", "Brigitte", "Rolf",
    "Ingrid", "Horst", "Hannelore", "Werner", "Christa", "Klaus",
    // Russlanddeutsche (significant group in rural Germany)
    "Sergej", "Olga", "Irina", "Viktor", "Tatjana", "Andrej",
];
// 1=Sonnenberg: cosmopolitan, academic, international
pub(crate) const FIRST_NAMES_D1: &[&str] = &[
    "Charlotte", "Maximilian", "Sophia", "Alexander", "Victoria", "Sebastian",
    "Isabelle", "Konstantin", "Amelie", "Valentin", "Johanna", "Theodor",
    "Helena", "Friedrich", "Luisa", "Nikolai", "Emilia", "Leonard",
    "Marie", "Julian", "Annika", "Henrik",
    // International academics
    "Priya", "Wei", "Tomoko", "Rafael",
];
// 2=Hafenviertel: diverse — Southern European, Eastern European, Syrian/Arab, African
pub(crate) const FIRST_NAMES_D2: &[&str] = &[
    // Southern European
    "Dario", "Marco", "Luca", "Paolo", "Enrico", "Giulia", "Chiara",
    // Eastern European / Balkan
    "Ivan", "Alina", "Mira", "Dragan",
    // Syrian / Arabic (post-2015 wave)
    "Ahmad", "Mohammed", "Fatima", "Aisha", "Hassan", "Layla", "Youssef",
    "Amira", "Rami", "Nour", "Tariq", "Samira",
    // Turkish 2nd gen
    "Selin", "Elif", "Cem", "Emin",
    // Sub-Saharan African
    "Mamadou", "Awa", "Ibrahim", "Aminata",
];
// 3=Mittelfeld: mixed German + 2nd/3rd-generation migrant names
pub(crate) const FIRST_NAMES_D3: &[&str] = &[
    // 2nd/3rd gen Turkish-German (modern names, not 1st gen)
    "Emre", "Leyla", "Deniz", "Can", "Mert", "Defne", "Elif", "Arda",
    "Selin", "Kerem", "Yagmur",
    // German mainstream
    "Jana", "Laura", "Sarah", "Lisa", "Julia", "Anna", "Nina",
    "Sami", "Yannis", "Sinan",
    // German mixed
    "Katharina", "Melanie", "Sandra", "Stefanie",
];
// 4=Industriezone: Turkish (1st+2nd gen), Polish, Romanian, Vietnamese, working class
pub(crate) const FIRST_NAMES_D4: &[&str] = &[
    // Turkish 1st generation
    "Mehmet", "Fatma", "Ali", "Ayse", "Hasan", "Hatice", "Mustafa", "Zeynep",
    "Ahmet", "Emine", "Yusuf", "Merve", "Ömer", "Nur",
    // Turkish 2nd generation
    "Emre", "Elif", "Mert", "Derya", "Deniz",
    // Polish
    "Piotr", "Katarzyna", "Mateusz", "Agnieszka", "Tomasz", "Anna",
    // Romanian
    "Marius", "Elena", "Andrei", "Maria", "Cristian", "Ionela",
    // Vietnamese
    "Tuan", "Linh", "Duc", "Thanh", "Minh", "Hoa",
];

// City-wide last names (30% chance)
pub(crate) const LAST_NAMES_COMMON: &[&str] = &[
    "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner",
    "Becker", "Schulz", "Hoffmann", "Koch", "Bauer", "Klein", "Wolf",
    "Braun", "Hartmann", "Lange", "Werner", "König", "Walter",
];

// District-specific last names
// 0=Grüntal: traditional German rural + some Russlanddeutsche
pub(crate) const LAST_NAMES_D0: &[&str] = &[
    "Bachmann", "Bergmann", "Weidner", "Lindner", "Ackermann", "Grünwald",
    "Huber", "Mayer", "Eder", "Brunner", "Wimmer", "Steiner", "Hofer",
    "Felder", "Kirchner", "Lehner", "Wirth", "Stadler", "Pichler", "Hauser",
    // Russlanddeutsche (often have German-sounding surnames)
    "Braun", "Keller", "Herz", "Schäfer",
];
// 1=Sonnenberg: established German + academic/international
pub(crate) const LAST_NAMES_D1: &[&str] = &[
    "von Stein", "Schiller", "Steinberg", "Lindemann", "Brinkmann",
    "Kronberg", "Hesse", "Blumenthal", "Friedmann",
    "Lichtenberg", "Ehrenberg", "Rosenfeld",
    // Academic international
    "Petersen", "Jansen", "Svensson", "Nielsen",
    // Upper-middle German
    "Vogt", "Baumann", "Krüger", "Schröder", "Engel", "Wendt",
];
// 2=Hafenviertel: Southern/Eastern European, Syrian/Arab, African, diverse
pub(crate) const LAST_NAMES_D2: &[&str] = &[
    // Italian
    "Rossi", "Esposito", "Ferrara", "Moretti", "Russo", "Colombo",
    // Greek
    "Papadopoulos", "Stavridis", "Nikolaidis",
    // Balkan / Ex-Yugoslav
    "Kovačević", "Nikolić", "Petrović", "Jovanović",
    // Syrian / Arabic (post-2015)
    "Al-Ahmad", "Al-Hussein", "Mansour", "Khoury", "Haddad", "Nasser",
    "Bakir", "Khalil", "Jabari",
    // Sub-Saharan African
    "Diallo", "Traoré", "Touré", "Ouedraogo",
    // Polish (some)
    "Kowalski", "Nowak",
];
// 3=Mittelfeld: mixed German + 2nd-generation Turkish/diverse
pub(crate) const LAST_NAMES_D3: &[&str] = &[
    // Turkish-German (2nd/3rd gen, well-established)
    "Yildiz", "Celik", "Sahin", "Kaya", "Arslan", "Demirci",
    "Polat", "Aksoy", "Erdogan",
    // Mainstream German
    "Richter", "Krause", "Schmitz", "Neumann", "Schwarz", "Zimmermann",
    "Meier", "Schulze", "Lehmann", "Frank", "Berger", "Roth",
];
// 4=Industriezone: Turkish, Polish, Romanian, Vietnamese
pub(crate) const LAST_NAMES_D4: &[&str] = &[
    // Turkish (largest group)
    "Yilmaz", "Özdemir", "Demir", "Kara", "Koç", "Doğan",
    "Çetin", "Aslan", "Bulut", "Yıldırım",
    // Polish
    "Kowalczyk", "Wiśniewski", "Wójcik", "Zielinski", "Nowak", "Kaminski",
    // Romanian
    "Popescu", "Ionescu", "Popa", "Moldovan", "Stanescu",
    // Vietnamese
    "Nguyen", "Pham", "Tran", "Hoang", "Vu", "Dang", "Le",
];

fn default_nfcc() -> f64 { 5.0 }

/// Convert EUR income to normalized 1-10 scale for internal calculations.
fn income_to_norm(income_eur: f64) -> f64 {
    ((income_eur - 800.0) / (7000.0 - 800.0) * 9.0 + 1.0).clamp(1.0, 10.0)
}

impl Blob {
    /// Generate a first name reflecting the district's demographic composition.
    /// 70% district-specific pool, 30% city-wide pool.
    pub fn generate_first_name(profile: &DistrictProfile, rng: &mut SmallRng) -> &'static str {
        let use_local: bool = rng.gen::<f64>() < 0.70;
        if use_local && !profile.first_names.is_empty() {
            profile.first_names[rng.gen_range(0..profile.first_names.len())]
        } else {
            FIRST_NAMES_COMMON[rng.gen_range(0..FIRST_NAMES_COMMON.len())]
        }
    }

    /// Generate a last name reflecting the district's demographic composition.
    /// 70% district-specific pool, 30% city-wide pool.
    pub fn generate_last_name(profile: &DistrictProfile, rng: &mut SmallRng) -> &'static str {
        let use_local: bool = rng.gen::<f64>() < 0.70;
        if use_local && !profile.last_names.is_empty() {
            profile.last_names[rng.gen_range(0..profile.last_names.len())]
        } else {
            LAST_NAMES_COMMON[rng.gen_range(0..LAST_NAMES_COMMON.len())]
        }
    }

    /// Generate a full name (first + last) for a district.
    pub fn generate_name(profile: &DistrictProfile, rng: &mut SmallRng) -> String {
        let first = Self::generate_first_name(profile, rng);
        let last = Self::generate_last_name(profile, rng);
        format!("{} {}", first, last)
    }

    /// Derive categorical age group from metric age: 0=young (<30), 1=middle (30-59), 2=older (60+).
    pub fn age_group(&self) -> u8 {
        if self.age < 30 { 0 } else if self.age < 60 { 1 } else { 2 }
    }

    /// Generate a random metric age (18-78) with uniform distribution.
    fn generate_age(rng: &mut SmallRng) -> u8 {
        rng.gen_range(18..79)
    }

    /// Generate a metric age from a categorical age group.
    /// 0=young (2-29), 1=middle (30-59), 2=older (60-78).
    pub fn age_from_group(age_group: u8, rng: &mut SmallRng) -> u8 {
        match age_group {
            0 => rng.gen_range(2..30),
            1 => rng.gen_range(30..60),
            _ => rng.gen_range(60..79),
        }
    }

    /// Create a new Blob citizen for a specific district.
    pub fn new(district: u8, pos: Point2<f64>, profile: &DistrictProfile, rng: &mut SmallRng) -> Self {
        let name = Self::generate_name(profile, rng);
        let education_level = Self::generate_education(profile, rng);
        let income = Self::generate_income(profile, education_level, rng);
        let age = Self::generate_age(rng);
        let age_group = if age < 30 { 0 } else if age < 60 { 1 } else { 2 };
        let attitudes = Attitudes::from_profile(profile, education_level, income, age, rng);
        let latent_traits = LatentTraits::generate(
            &profile.latent_bases, education_level, self::income_to_norm(income), age_group, rng,
        );
        let political_state = PoliticalState::from_attitudes(&attitudes, age, education_level, &latent_traits, rng);
        let base_ideology = attitudes.ideology;
        let base_satisfaction = attitudes.political_satisfaction;
        let base_trust = attitudes.institutional_trust;
        let base_latent_traits = latent_traits.clone();
        // Need for Cognitive Closure: anti-correlated with education, varies by district
        let nfcc_base = match district {
            0 => 6.5, 1 => 3.0, 2 => 4.5, 3 => 5.0, 4 => 7.0, _ => 5.0,
        };
        let need_for_closure = (nfcc_base - education_level as f64 * 0.8
            + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);

        Blob {
            id: Uuid::new_v4(),
            name,
            district,
            education_level,
            income,
            age,
            attitudes,
            political_state,
            latent_traits,
            base_ideology,
            base_satisfaction,
            base_trust,
            base_income: income,
            base_latent_traits,
            need_for_closure,
            emotion: BlobEmotion::default(),
            pos,
            home_pos: pos,
            home_building_id: None,
            workplace_id: None,
            lunch_spot_id: None,
            leisure_spot_id: None,
            household_id: None,
        }
    }

    /// Create a new Blob as part of a household with a shared last name and assigned age.
    pub fn new_in_household(
        district: u8,
        pos: Point2<f64>,
        household_id: u32,
        last_name: &str,
        age: u8,
        profile: &DistrictProfile,
        rng: &mut SmallRng,
    ) -> Self {
        let first = Self::generate_first_name(profile, rng);
        let name = format!("{} {}", first, last_name);
        let is_child = age < 18;

        // Children: no education level, no income
        let education_level = if is_child { 0 } else { Self::generate_education(profile, rng) };
        let income = if is_child { 0.0 } else { Self::generate_income(profile, education_level, rng) };
        let age_group = if age < 30 { 0 } else if age < 60 { 1 } else { 2 };
        let attitudes = Attitudes::from_profile(profile, education_level, income, age, rng);
        let latent_traits = LatentTraits::generate(
            &profile.latent_bases, education_level, self::income_to_norm(income), age_group, rng,
        );
        let political_state = PoliticalState::from_attitudes(&attitudes, age, education_level, &latent_traits, rng);
        let base_ideology = attitudes.ideology;
        let base_satisfaction = attitudes.political_satisfaction;
        let base_trust = attitudes.institutional_trust;
        let base_latent_traits = latent_traits.clone();
        let nfcc_base = match district {
            0 => 6.5, 1 => 3.0, 2 => 4.5, 3 => 5.0, 4 => 7.0, _ => 5.0,
        };
        let need_for_closure = (nfcc_base - education_level as f64 * 0.8
            + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);

        Blob {
            id: Uuid::new_v4(),
            name,
            district,
            education_level,
            income,
            age,
            attitudes,
            political_state,
            latent_traits,
            base_ideology,
            base_satisfaction,
            base_trust,
            base_income: income,
            base_latent_traits,
            need_for_closure,
            emotion: BlobEmotion::default(),
            pos,
            home_pos: pos,
            home_building_id: None,
            workplace_id: None,
            lunch_spot_id: None,
            leisure_spot_id: None,
            household_id: Some(household_id),
        }
    }

    /// Whether this Blob is a child (under 18).
    pub fn is_child(&self) -> bool {
        self.age < 18
    }

    /// Transition a former child into adulthood: assign education, income,
    /// update need_for_closure, re-initialize political state, and adjust
    /// latent traits for the formative effect of entering the workforce.
    /// Should be called exactly once when age reaches 18.
    pub fn come_of_age(&mut self, profile: &DistrictProfile, rng: &mut SmallRng) {
        // 1. Education & income
        self.education_level = Self::generate_education(profile, rng);
        self.income = Self::generate_income(profile, self.education_level, rng);
        self.base_income = self.income;

        // 2. Need for closure (education reduces it)
        let nfcc_base = match self.district {
            0 => 6.5, 1 => 3.0, 2 => 4.5, 3 => 5.0, 4 => 7.0, _ => 5.0,
        };
        self.need_for_closure = (nfcc_base - self.education_level as f64 * 0.8
            + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);

        // 3. Political state — fully initialize (attitudes already shaped by family)
        self.political_state = PoliticalState::from_attitudes(
            &self.attitudes, self.age, self.education_level, &self.latent_traits, rng,
        );

        // 4. Latent traits — one-time contextual adjustment (formative effect, ~5× normal)
        //    Don't regenerate from scratch, just nudge based on new education/income
        let income_norm = self.income_normalized();
        let edu = self.education_level as f64;
        let boost = 0.020; // 5× the normal context_rate of 0.004

        // Efficacy: education boosts
        self.latent_traits.self_efficacy += boost * (edu - 1.5) * 10.0;
        self.latent_traits.political_knowledge += boost * (edu - 1.0) * 8.0;
        self.latent_traits.vote_importance += boost * (edu - 1.0) * 5.0;

        // Authoritarianism: education reduces
        self.latent_traits.obedience_value -= boost * edu * 3.0;
        self.latent_traits.rule_conformity -= boost * edu * 2.0;
        self.latent_traits.strong_leader_preference -= boost * edu * 4.0;

        // Materialism: income shifts
        self.latent_traits.economic_security_priority += boost * (5.5 - income_norm) * 3.0;
        self.latent_traits.environment_over_economy += boost * (income_norm - 5.5) * 2.0;
        self.latent_traits.freedom_over_order += boost * (edu - 1.5) * 3.0;

        // Clamp all indicators
        self.latent_traits.clamp();

        // Update base latent traits to new state
        self.base_latent_traits = self.latent_traits.clone();
    }

    /// Normalized income on a 1-10 scale (for internal calculations).
    /// Maps 800€ → 1.0, 7000€ → 10.0.
    pub fn income_normalized(&self) -> f64 {
        ((self.income - 800.0) / 688.0 + 1.0).clamp(1.0, 10.0)
    }

    /// Social reach — how far this blob can influence / be influenced by others.
    pub fn social_range(&self) -> f64 {
        15.0 + (self.education_level as f64) * 5.0
    }

    /// Visual size — age-based for children, income-based for adults.
    /// Children: 0.50 (age 2) → 0.85 (age 17), smooth sublinear growth.
    /// Adults:   0.85 (low income) → 1.20 (high income).
    /// Smooth transition at age 18.
    pub fn visual_scale(&self) -> f64 {
        if self.age < 18 {
            0.50 + 0.35 * ((self.age as f64 - 2.0).max(0.0) / 15.0).powf(0.7)
        } else {
            let norm = self.income_normalized();
            0.85 + (norm - 1.0) * (0.35 / 9.0)
        }
    }

    fn generate_education(profile: &DistrictProfile, rng: &mut SmallRng) -> u8 {
        let r: f64 = rng.gen();
        for (i, &threshold) in profile.education_cumulative.iter().enumerate() {
            if r < threshold {
                return i as u8;
            }
        }
        3 // academic (fallback)
    }

    /// Generate monthly net income in EUR, varying by district profile and education.
    fn generate_income(profile: &DistrictProfile, education: u8, rng: &mut SmallRng) -> f64 {
        let (min, max) = profile.income_range;
        let base = rng.gen_range(min..max);
        let education_bonus = (education as f64) * 250.0;
        let variation: f64 = rng.gen_range(-300.0..300.0);
        (base + education_bonus + variation).clamp(800.0, 7000.0)
    }
}
