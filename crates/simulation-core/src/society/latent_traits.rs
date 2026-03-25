use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::stage::district_profile::LatentBases;

/// Latent constructs with observable indicators.
///
/// These represent variables that cannot be directly observed but are
/// measured through multiple indicators — a core concept in empirical
/// social research (Operationalisierung, Sitzung 7).
///
/// Each latent construct has an internal (unobservable) score that
/// generates correlated but noisy indicators. Students can only
/// "measure" the indicators, never the latent score directly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatentTraits {
    // =================================================================
    // 1. Politische Efficacy (latent)
    //    "Kann ich als Bürger*in politisch etwas bewirken?"
    //    Referenz: Kognitive Mobilisierung (Dalton), Sitzung 4
    // =================================================================

    /// "Ich kann politische Entscheidungen beeinflussen" (0.0 - 10.0)
    pub self_efficacy: f64,
    /// Verständnis politischer Prozesse (0.0 - 10.0)
    pub political_knowledge: f64,
    /// "Meine Stimme zählt bei Wahlen" (0.0 - 10.0)
    pub vote_importance: f64,

    // =================================================================
    // 2. Soziales Kapital (latent)
    //    "Wie eingebettet ist dieser Blob in soziale Netzwerke?"
    //    Referenz: Putnam, soziale Kohäsion
    // =================================================================

    /// Anzahl regelmäßiger sozialer Kontakte (0 - 20)
    pub network_size: u8,
    /// Vertrauen in die Nachbarschaft (0.0 - 10.0)
    pub neighbor_trust: f64,
    /// Häufigkeit gemeinschaftlicher Aktivitäten (0.0 - 10.0)
    pub community_participation: f64,

    // =================================================================
    // 3. Autoritarismus (latent)
    //    "Wie stark bevorzugt dieser Blob Ordnung, Konformität
    //     und starke Führung gegenüber Freiheit und Vielfalt?"
    //    Referenz: Adorno (F-Skala), Altemeyer (RWA)
    // =================================================================

    /// "Gehorsam und Respekt vor Autorität sind die wichtigsten
    ///  Tugenden, die Kinder lernen sollten" (0.0 - 10.0)
    pub obedience_value: f64,
    /// "Es ist wichtig, dass Regeln strikt eingehalten werden" (0.0 - 10.0)
    pub rule_conformity: f64,
    /// "Starke Führungspersönlichkeiten sind besser als langwierige
    ///  Diskussionen im Parlament" (0.0 - 10.0)
    pub strong_leader_preference: f64,

    // =================================================================
    // 4. Politikverdrossenheit / Political Alienation (latent)
    //    "Wie entfremdet fühlt sich dieser Blob vom politischen System?"
    //    Referenz: Sitzung 4 (Theorie der Politikverdrossenheit)
    // =================================================================

    /// "Die da oben machen eh was sie wollen" (0.0 - 10.0)
    pub powerlessness: f64,
    /// "Politik ist zu kompliziert für normale Leute" (0.0 - 10.0)
    pub political_complexity: f64,
    /// "Alle Parteien sind im Grunde gleich" (0.0 - 10.0)
    pub party_indifference: f64,

    // =================================================================
    // 5. Materialismus vs. Postmaterialismus (latent)
    //    "Welche Werte priorisiert dieser Blob?"
    //    Referenz: Inglehart (Wertewandel-Theorie)
    // =================================================================

    /// Priorität wirtschaftlicher Sicherheit vs. Selbstverwirklichung (0.0 - 10.0)
    /// 0 = voll postmaterialistisch, 10 = voll materialistisch
    pub economic_security_priority: f64,
    /// "Umweltschutz ist wichtiger als Wirtschaftswachstum" (0.0 - 10.0, invertiert)
    pub environment_over_economy: f64,
    /// "Meinungsfreiheit ist wichtiger als öffentliche Ordnung" (0.0 - 10.0, invertiert)
    pub freedom_over_order: f64,

    // =================================================================
    // 6. Populismus (latent) — Akkerman, Mudde & Zaslove 2014
    //    "Wie populistisch denkt dieser Blob?"
    //    Referenz: Political Psychology, 35(5), 651-680
    // =================================================================

    /// "Die Politiker haben den Kontakt zum Volk verloren" (0.0 - 10.0)
    #[serde(default = "default_mid")]
    pub anti_elitism: f64,
    /// "Das Volk, nicht Politiker, sollte die wichtigsten Entscheidungen treffen" (0.0 - 10.0)
    #[serde(default = "default_mid")]
    pub people_centrism: f64,
    /// "In der Politik geht es letztlich um Gut gegen Böse" (0.0 - 10.0)
    #[serde(default = "default_mid")]
    pub manichean_outlook: f64,

    // =================================================================
    // Zusätzliche Einzel-Indikatoren (erweitern bestehende Konstrukte)
    // =================================================================

    /// Externe Efficacy (PEKS): "Die Regierung kümmert sich um die Meinung
    ///  normaler Leute" (0.0 - 10.0) — erweitert Konstrukt 1
    #[serde(default = "default_mid")]
    pub external_efficacy: f64,
    /// Generalisiertes Vertrauen (ESS): "Den meisten Menschen kann man
    ///  vertrauen" (0.0 - 10.0) — erweitert Konstrukt 2
    #[serde(default = "default_mid")]
    pub generalized_trust: f64,
    /// Medienvertrauen (Kohring/Matthes): "Ich vertraue der Berichterstattung
    ///  der Medien" (0.0 - 10.0) — erweitert Konstrukt 2
    #[serde(default = "default_mid")]
    pub media_trust: f64,
}

fn default_mid() -> f64 { 5.0 }

impl LatentTraits {
    /// Generate all latent traits from demographics and district profile bases.
    pub fn generate(
        bases: &LatentBases,
        education_level: u8,
        income: f64,
        age_group: u8,
        rng: &mut SmallRng,
    ) -> Self {
        // --- 1. Politische Efficacy ---
        let efficacy_latent = Self::compute_efficacy_latent(
            bases.efficacy, education_level, income, rng,
        );
        // Noise doubled for better discriminant validity (target within-r: .50-.75)
        let self_efficacy = (efficacy_latent + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);
        let political_knowledge = (efficacy_latent * 0.7
            + (education_level as f64) * 1.2
            + rng.gen_range(-2.5..2.5))
        .clamp(0.0, 10.0);
        let vote_importance =
            (efficacy_latent * 0.8 + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);

        // --- 2. Soziales Kapital ---
        let social_latent =
            Self::compute_social_latent(bases.social, age_group, income, rng);
        let network_size =
            ((social_latent * 1.5 + rng.gen_range(-2.0..2.0)).clamp(0.0, 20.0)) as u8;
        let neighbor_trust =
            (social_latent + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);
        let community_participation = (social_latent * 0.8
            + (age_group as f64) * 1.0
            + rng.gen_range(-1.5..1.5))
        .clamp(0.0, 10.0);

        // --- 3. Autoritarismus ---
        let auth_latent = Self::compute_authoritarianism_latent(
            bases.authoritarianism, education_level, age_group, rng,
        );
        let obedience_value =
            (auth_latent + rng.gen_range(-1.0..1.0)).clamp(0.0, 10.0);
        let rule_conformity =
            (auth_latent * 0.9 + rng.gen_range(-1.2..1.2)).clamp(0.0, 10.0);
        let strong_leader_preference =
            (auth_latent * 0.85 + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);

        // --- 4. Politikverdrossenheit ---
        let alienation_latent = Self::compute_alienation_latent(
            bases.alienation, education_level, income, efficacy_latent, rng,
        );
        // Noise doubled for better discriminant validity
        let powerlessness =
            (alienation_latent + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);
        let political_complexity =
            (alienation_latent * 0.7 + (3 - education_level.min(3)) as f64 * 0.8
                + rng.gen_range(-2.5..2.5))
            .clamp(0.0, 10.0);
        let party_indifference =
            (alienation_latent * 0.6 + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);

        // --- 5. Materialismus/Postmaterialismus ---
        let mat_latent = Self::compute_materialism_latent(
            bases.materialism, education_level, income, age_group, rng,
        );
        let economic_security_priority =
            (mat_latent + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);
        // Invertierte Indikatoren: softened inversion for more realistic r ~-.50 to -.70
        let environment_over_economy =
            (8.0 - mat_latent * 0.7 + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);
        let freedom_over_order =
            (8.0 - mat_latent * 0.6 + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);

        // --- 6. Populismus (Akkerman et al. 2014) ---
        // Driven by: low trust + high alienation + low efficacy
        let pop_latent = (alienation_latent * 0.5
            + (10.0 - efficacy_latent) * 0.2
            + (10.0 - social_latent) * 0.15
            + rng.gen_range(-1.0..1.0)).clamp(0.0, 10.0);
        let anti_elitism = (pop_latent + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);
        let people_centrism = (pop_latent * 0.9 + rng.gen_range(-1.5..1.5)).clamp(0.0, 10.0);
        let manichean_outlook = (pop_latent * 0.7
            + auth_latent * 0.2
            + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);

        // --- Additional indicators (extending existing constructs) ---
        // External efficacy (PEKS): correlated with internal efficacy but distinct
        let external_efficacy = (efficacy_latent * 0.6
            + social_latent * 0.2
            + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);
        // Generalized trust (ESS): correlated with neighbor_trust
        let generalized_trust = (social_latent * 0.7
            + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);
        // Media trust: correlated with institutional trust base + education
        let media_trust = (social_latent * 0.4
            + (education_level as f64) * 0.8
            + rng.gen_range(-2.0..2.0)).clamp(0.0, 10.0);

        LatentTraits {
            self_efficacy,
            political_knowledge,
            vote_importance,
            network_size,
            neighbor_trust,
            community_participation,
            obedience_value,
            rule_conformity,
            strong_leader_preference,
            powerlessness,
            political_complexity,
            party_indifference,
            economic_security_priority,
            environment_over_economy,
            freedom_over_order,
            anti_elitism,
            people_centrism,
            manichean_outlook,
            external_efficacy,
            generalized_trust,
            media_trust,
        }
    }

    // ---- Latent score generators (internal, unobservable) ----

    fn compute_efficacy_latent(
        district_base: f64,
        education_level: u8,
        income: f64,
        rng: &mut SmallRng,
    ) -> f64 {
        let education_effect = (education_level as f64) * 0.8;
        let income_effect = (income - 5.0) * 0.3;
        let noise: f64 = rng.gen_range(-0.5..0.5);
        (district_base + education_effect + income_effect + noise).clamp(0.0, 10.0)
    }

    fn compute_social_latent(
        district_base: f64,
        age_group: u8,
        income: f64,
        rng: &mut SmallRng,
    ) -> f64 {
        let age_effect = (age_group as f64) * 0.5;
        let income_effect = (income - 5.0) * 0.15;
        let noise: f64 = rng.gen_range(-0.5..0.5);
        (district_base + age_effect + income_effect + noise).clamp(0.0, 10.0)
    }

    /// Autoritarismus: höher bei niedriger Bildung, höherem Alter,
    /// und in konservativen/benachteiligten Distrikten.
    fn compute_authoritarianism_latent(
        district_base: f64,
        education_level: u8,
        age_group: u8,
        rng: &mut SmallRng,
    ) -> f64 {
        let education_effect = -(education_level as f64) * 0.6; // höhere Bildung → weniger autoritär
        let age_effect = (age_group as f64) * 0.5; // älter → etwas autoritärer
        let noise: f64 = rng.gen_range(-0.8..0.8);
        (district_base + education_effect + age_effect + noise).clamp(0.0, 10.0)
    }

    /// Politikverdrossenheit: invers korreliert mit Efficacy,
    /// höher bei niedrigem Einkommen und Bildung.
    fn compute_alienation_latent(
        district_base: f64,
        education_level: u8,
        income: f64,
        efficacy_latent: f64,
        rng: &mut SmallRng,
    ) -> f64 {
        let efficacy_effect = -efficacy_latent * 0.1; // reduced from 0.3 — was creating r=-.93 with efficacy (CFA would fail)
        let education_effect = -(education_level as f64) * 0.4;
        let income_effect = -(income - 5.0) * 0.2;
        let noise: f64 = rng.gen_range(-0.5..0.5);
        (district_base + efficacy_effect + education_effect + income_effect + noise)
            .clamp(0.0, 10.0)
    }

    /// Materialismus: höher bei niedrigerem Einkommen/Bildung, älteren Globs,
    /// und ökonomisch orientierten Distrikten.
    fn compute_materialism_latent(
        district_base: f64,
        education_level: u8,
        income: f64,
        age_group: u8,
        rng: &mut SmallRng,
    ) -> f64 {
        let education_effect = -(education_level as f64) * 0.5;
        let income_effect = -(income - 5.0) * 0.25; // höheres Einkommen → weniger materialistisch
        let age_effect = (age_group as f64) * 0.4; // ältere = materialistischer (Inglehart)
        let noise: f64 = rng.gen_range(-0.6..0.6);
        (district_base + education_effect + income_effect + age_effect + noise).clamp(0.0, 10.0)
    }

    /// Update latent trait indicators based on personality anchoring + contextual pressure.
    ///
    /// Two-force model:
    /// 1. Personality anchoring (pull toward base_traits) — dominant force, preserves individual differences
    /// 2. Contextual pressure (attitudes, income, education) — weaker, creates slow drift when
    ///    lived experience consistently diverges from personality baseline
    ///
    /// Called weekly (every 7 ticks). Primary change mechanisms remain event perturbations
    /// and life events (handled in sim.rs) which shift base_latent_traits directly.
    /// Update latent trait indicators with CONSTRUCT-SPECIFIC drivers.
    ///
    /// Redesigned to preserve the 5-factor CFA structure over the simulation.
    /// Each construct has a DOMINANT OWN DRIVER that is weakly correlated with
    /// the drivers of other constructs. This prevents convergence into a single
    /// general factor (which caused CFI to drop from .998 to .765).
    ///
    /// Driver assignment:
    /// - Efficacy:        education (Dalton: cognitive mobilization)
    /// - SocialCapital:   neutral anchor (dynamics from life events + social influence)
    /// - Authoritarianism: ideology + need_for_closure (personality-based)
    /// - Alienation:      trust deficit (NOT satisfaction — that would mirror efficacy)
    /// - Materialism:     income_norm (Inglehart: economic security)
    pub fn update_from_context(
        &mut self,
        satisfaction: f64,       // 0-10
        ideology: f64,           // 1 to 10
        trust: f64,              // 0-10
        income_norm: f64,        // 1-10
        education_level: u8,     // 0-3
        need_for_closure: f64,   // 0-10 (personality trait on Blob)
        rng: &mut SmallRng,
    ) {
        let context_rate = 0.004; // reverted: higher rate worsened drift and StdDev collapse
        let edu = education_level.min(3) as f64;

        // Saturation dampener: resistance increases quadratically near bounds.
        // At value=1.0 or 9.0: factor ~0.25. At value=0.5 or 9.5: factor ~0.06.
        // Prevents 22-year drift from pushing traits to ceiling/floor.
        let damp = |value: f64, min: f64, max: f64| -> f64 {
            let dist_to_floor = (value - min).max(0.01);
            let dist_to_ceil = (max - value).max(0.01);
            let range = max - min;
            let linear = (dist_to_floor.min(dist_to_ceil) / (range * 0.3)).clamp(0.05, 1.0);
            // Quadratic dampening near extremes (within 2.0 of bounds)
            let margin = dist_to_floor.min(dist_to_ceil);
            let quad_factor = if margin < 2.0 {
                (margin / 2.0).powi(2).max(0.02)
            } else {
                1.0
            };
            linear * quad_factor
        };

        // ── 1. Politische Efficacy ──
        // PRIMARY DRIVER: education (cognitive resources enable political agency)
        // satisfaction has only a TINY influence (0.08) to avoid mirroring alienation
        let edu_attractor = edu * 2.0 + 2.5; // edu=0→2.5, edu=1→4.5, edu=2→6.5, edu=3→8.5
        let efficacy_pressure = (edu_attractor * 0.5 + satisfaction * 0.08 + 1.5).clamp(0.0, 7.5);
        self.self_efficacy += context_rate * damp(self.self_efficacy, 0.0, 10.0)
            * (efficacy_pressure - self.self_efficacy)
            + rng.gen_range(-0.04..0.04);

        // political_knowledge: education-driven (stable, slow update)
        let knowledge_pressure = edu * 2.5 + 2.0;
        self.political_knowledge += context_rate * 0.4 * damp(self.political_knowledge, 0.0, 10.0)
            * (knowledge_pressure - self.political_knowledge)
            + rng.gen_range(-0.01..0.01);

        // vote_importance: education-based attractor (NOT trust/satisfaction)
        let vote_pressure = (edu_attractor * 0.4 + 2.5).clamp(0.0, 7.5);
        self.vote_importance += context_rate * damp(self.vote_importance, 0.0, 10.0)
            * (vote_pressure - self.vote_importance)
            + rng.gen_range(-0.04..0.04);

        // Construct-specific correlated drift — STRONG enough to counteract
        // systematic convergence from shared education/district confounders.
        // sqrt(1147 weeks) * 0.05/sqrt(12) ≈ 0.5 SD of construct-specific variance
        let eff_drift = rng.gen_range(-0.05..0.05);
        self.self_efficacy += eff_drift + rng.gen_range(-0.10..0.10);
        self.political_knowledge += eff_drift * 0.6 + rng.gen_range(-0.10..0.10);
        self.vote_importance += eff_drift * 0.5 + rng.gen_range(-0.10..0.10);
        self.external_efficacy += eff_drift * 0.4 + rng.gen_range(-0.10..0.10);

        // ── 2. Soziales Kapital ──
        // PRIMARY DRIVER: neutral anchor — dynamics come from life events & social influence
        // Only weak trust influence; NO satisfaction, NO cross-construct references
        let ntrust_pressure = 4.0 + trust * 0.15;
        self.neighbor_trust += context_rate * 0.3 * damp(self.neighbor_trust, 0.0, 10.0)
            * (ntrust_pressure - self.neighbor_trust)
            + rng.gen_range(-0.02..0.02);

        let participation_pressure = 4.5; // slightly below neutral to counteract upward drift from events
        self.community_participation += context_rate * 0.3 * damp(self.community_participation, 0.0, 10.0)
            * (participation_pressure - self.community_participation)
            + rng.gen_range(-0.02..0.02);

        let soc_drift = rng.gen_range(-0.04..0.04);
        self.neighbor_trust += soc_drift + rng.gen_range(-0.08..0.08);
        self.community_participation += soc_drift * 0.7 + rng.gen_range(-0.08..0.08);
        self.generalized_trust += soc_drift * 0.5 + rng.gen_range(-0.08..0.08);
        self.media_trust += soc_drift * 0.3 + rng.gen_range(-0.08..0.08);

        // network_size: derive from community_participation instead of accumulating
        let net_noise: f64 = rng.gen_range(-2.0..2.0);
        self.network_size = (self.community_participation * 1.5 + net_noise).clamp(0.0, 20.0) as u8;

        // ── 3. Autoritarismus ──
        // PRIMARY DRIVER: ideology + need_for_closure (personality-based)
        // satisfaction REMOVED to decouple from efficacy/alienation
        let auth_pressure = (5.0 + (ideology - 5.5) * 0.67 + need_for_closure * 0.3).clamp(0.0, 10.0);
        self.obedience_value += context_rate * damp(self.obedience_value, 0.0, 10.0)
            * (auth_pressure - self.obedience_value)
            + rng.gen_range(-0.04..0.04);

        // rule_conformity: OWN attractor based on ideology + NfCC (no intra-construct reference!)
        // Previous version referenced obedience+leader directly, causing r=.94 redundancy
        let conform_pressure = (4.5 + (ideology - 5.5) * 0.33 + need_for_closure * 0.25).clamp(0.0, 10.0);
        self.rule_conformity += context_rate * damp(self.rule_conformity, 0.0, 10.0)
            * (conform_pressure - self.rule_conformity)
            + rng.gen_range(-0.04..0.04);

        // strong_leader_preference: ideology + need_for_closure (NO satisfaction)
        let leader_pressure = (3.0 + (ideology - 5.5) * 0.45 + need_for_closure * 0.4).clamp(0.0, 10.0);
        self.strong_leader_preference += context_rate * damp(self.strong_leader_preference, 0.0, 10.0)
            * (leader_pressure - self.strong_leader_preference)
            + rng.gen_range(-0.04..0.04);

        // Auth construct drift + very strong indicator-specific noise (within-r target: 0.4-0.65)
        let auth_drift = rng.gen_range(-0.02..0.02);
        self.obedience_value += auth_drift + rng.gen_range(-0.28..0.28);
        self.rule_conformity += auth_drift * 0.7 + rng.gen_range(-0.28..0.28);
        self.strong_leader_preference += auth_drift * 0.6 + rng.gen_range(-0.28..0.28);

        // ── 4. Politikverdrossenheit ──
        // PRIMARY DRIVER: trust deficit ONLY (NOT satisfaction — that would mirror efficacy)
        let powerless_pressure = ((10.0 - trust) * 0.5 + 2.0).clamp(0.0, 10.0);
        self.powerlessness += context_rate * 0.5 * damp(self.powerlessness, 0.0, 10.0)
            * (powerless_pressure - self.powerlessness)
            + rng.gen_range(-0.04..0.04);

        // political_complexity: education only (Luskin 1990) — already well isolated
        let complexity_pressure = (3.0 - edu) / 3.0 * 9.0 + edu / 3.0 * 1.0;
        self.political_complexity += context_rate * damp(self.political_complexity, 0.0, 10.0)
            * (complexity_pressure - self.political_complexity)
            + rng.gen_range(-0.02..0.02);

        // party_indifference: trust deficit only (NO satisfaction)
        let indiff_pressure = ((10.0 - trust) * 0.4 + 2.5).clamp(0.0, 10.0);
        self.party_indifference += context_rate * 0.5 * damp(self.party_indifference, 0.0, 10.0)
            * (indiff_pressure - self.party_indifference)
            + rng.gen_range(-0.04..0.04);

        let alien_drift = rng.gen_range(-0.05..0.05);
        self.powerlessness += alien_drift + rng.gen_range(-0.10..0.10);
        self.political_complexity += alien_drift * 0.5 + rng.gen_range(-0.10..0.10);
        self.party_indifference += alien_drift * 0.6 + rng.gen_range(-0.10..0.10);

        // ── 5. Materialismus/Postmaterialismus ──
        // PRIMARY DRIVER: income_norm (Inglehart: economic security)
        // ideology REMOVED (was coupling Auth↔Mat)
        let mat_pressure = 10.0 - income_norm;
        self.economic_security_priority += context_rate * damp(self.economic_security_priority, 0.0, 10.0)
            * (mat_pressure - self.economic_security_priority)
            + rng.gen_range(-0.04..0.04);

        // environment: education + income ONLY (ideology REMOVED)
        let env_pressure = (edu * 1.5 + income_norm * 0.2 + 2.0).clamp(0.0, 10.0);
        self.environment_over_economy += context_rate * damp(self.environment_over_economy, 0.0, 10.0)
            * (env_pressure - self.environment_over_economy)
            + rng.gen_range(-0.04..0.04);

        // freedom_over_order: education ONLY (ideology REMOVED)
        let freedom_pressure = (3.5 + edu * 1.0).clamp(0.0, 10.0);
        self.freedom_over_order += context_rate * damp(self.freedom_over_order, 0.0, 10.0)
            * (freedom_pressure - self.freedom_over_order)
            + rng.gen_range(-0.06..0.06);

        let mat_drift = rng.gen_range(-0.08..0.08);
        self.economic_security_priority += mat_drift;
        self.environment_over_economy -= mat_drift * 0.5; // inverted
        self.freedom_over_order -= mat_drift * 0.4; // inverted

        // ── 6. Populismus (Akkerman et al. 2014) ──
        // PRIMARY DRIVER: trust deficit + alienation (powerlessness)
        // Low trust + feeling powerless → anti-elite, pro-people sentiment
        let pop_pressure = ((10.0 - trust) * 0.4 + self.powerlessness * 0.3 + 1.0).clamp(0.0, 10.0);
        self.anti_elitism += context_rate * damp(self.anti_elitism, 0.0, 10.0)
            * (pop_pressure - self.anti_elitism)
            + rng.gen_range(-0.04..0.04);

        let people_pressure = ((10.0 - trust) * 0.3 + (10.0 - satisfaction) * 0.15 + 2.0).clamp(0.0, 10.0);
        self.people_centrism += context_rate * damp(self.people_centrism, 0.0, 10.0)
            * (people_pressure - self.people_centrism)
            + rng.gen_range(-0.06..0.06);

        // manichean: ideology extremism + need_for_closure drive black-white thinking
        let ideo_extremism = (ideology - 5.5).abs() / 4.5; // 0-1
        let manich_pressure = (3.0 + ideo_extremism * 3.0 + need_for_closure * 0.3).clamp(0.0, 10.0);
        self.manichean_outlook += context_rate * 0.5 * damp(self.manichean_outlook, 0.0, 10.0)
            * (manich_pressure - self.manichean_outlook)
            + rng.gen_range(-0.03..0.03);

        let pop_drift = rng.gen_range(-0.08..0.08);
        self.anti_elitism += pop_drift;
        self.people_centrism += pop_drift * 0.7;
        self.manichean_outlook += pop_drift * 0.5;

        // ── Additional single indicators ──
        // External efficacy: driven by trust (responsive government) + satisfaction
        let ext_eff_pressure = (trust * 0.5 + satisfaction * 0.2 + 1.0).clamp(0.0, 10.0);
        self.external_efficacy += context_rate * damp(self.external_efficacy, 0.0, 10.0)
            * (ext_eff_pressure - self.external_efficacy)
            + rng.gen_range(-0.04..0.04);

        // Generalized trust: driven by satisfaction + social capital context
        let gen_trust_pressure = (satisfaction * 0.3 + trust * 0.2 + 2.0).clamp(0.0, 10.0);
        self.generalized_trust += context_rate * 0.5 * damp(self.generalized_trust, 0.0, 10.0)
            * (gen_trust_pressure - self.generalized_trust)
            + rng.gen_range(-0.06..0.06);

        // Media trust: education-driven + institutional trust correlation
        let media_pressure = (edu * 1.0 + trust * 0.3 + 1.0).clamp(0.0, 10.0);
        self.media_trust += context_rate * 0.5 * damp(self.media_trust, 0.0, 10.0)
            * (media_pressure - self.media_trust)
            + rng.gen_range(-0.03..0.03);

        // ── Ceiling/Floor erosion for all latent traits ──
        // Traits beyond 9.0 or below 1.0 get pulled back gently.
        // Prevents long-term accumulation at extreme values.
        let erode = |v: f64| -> f64 {
            if v > 9.0 { v - (v - 9.0) * 0.03 }
            else if v < 1.0 { v + (1.0 - v) * 0.03 }
            else { v }
        };
        self.self_efficacy = erode(self.self_efficacy);
        self.political_knowledge = erode(self.political_knowledge);
        self.vote_importance = erode(self.vote_importance);
        self.neighbor_trust = erode(self.neighbor_trust);
        self.community_participation = erode(self.community_participation);
        self.obedience_value = erode(self.obedience_value);
        self.rule_conformity = erode(self.rule_conformity);
        self.strong_leader_preference = erode(self.strong_leader_preference);
        self.powerlessness = erode(self.powerlessness);
        self.political_complexity = erode(self.political_complexity);
        self.party_indifference = erode(self.party_indifference);
        self.economic_security_priority = erode(self.economic_security_priority);
        self.environment_over_economy = erode(self.environment_over_economy);
        self.freedom_over_order = erode(self.freedom_over_order);
        self.anti_elitism = erode(self.anti_elitism);
        self.people_centrism = erode(self.people_centrism);
        self.manichean_outlook = erode(self.manichean_outlook);
        self.external_efficacy = erode(self.external_efficacy);
        self.generalized_trust = erode(self.generalized_trust);
        self.media_trust = erode(self.media_trust);

        self.clamp();
    }

    /// Apply personality anchoring: pull all indicators toward base values.
    /// Called separately so base_latent_traits (stored on Blob) can be passed in.
    pub fn apply_personality_anchoring(&mut self, base: &LatentTraits, rate: f64) {
        self.self_efficacy += rate * (base.self_efficacy - self.self_efficacy);
        self.political_knowledge += rate * (base.political_knowledge - self.political_knowledge);
        self.vote_importance += rate * (base.vote_importance - self.vote_importance);
        // network_size anchored separately (from contact graph)
        self.neighbor_trust += rate * (base.neighbor_trust - self.neighbor_trust);
        self.community_participation += rate * (base.community_participation - self.community_participation);
        self.obedience_value += rate * (base.obedience_value - self.obedience_value);
        self.rule_conformity += rate * (base.rule_conformity - self.rule_conformity);
        self.strong_leader_preference += rate * (base.strong_leader_preference - self.strong_leader_preference);
        self.powerlessness += rate * (base.powerlessness - self.powerlessness);
        self.political_complexity += rate * (base.political_complexity - self.political_complexity);
        self.party_indifference += rate * (base.party_indifference - self.party_indifference);
        self.economic_security_priority += rate * (base.economic_security_priority - self.economic_security_priority);
        self.environment_over_economy += rate * (base.environment_over_economy - self.environment_over_economy);
        self.freedom_over_order += rate * (base.freedom_over_order - self.freedom_over_order);
        self.anti_elitism += rate * (base.anti_elitism - self.anti_elitism);
        self.people_centrism += rate * (base.people_centrism - self.people_centrism);
        self.manichean_outlook += rate * (base.manichean_outlook - self.manichean_outlook);
        self.external_efficacy += rate * (base.external_efficacy - self.external_efficacy);
        self.generalized_trust += rate * (base.generalized_trust - self.generalized_trust);
        self.media_trust += rate * (base.media_trust - self.media_trust);
    }

    /// Clamp all indicator values to valid ranges.
    pub fn clamp(&mut self) {
        self.self_efficacy = self.self_efficacy.clamp(0.0, 10.0);
        self.political_knowledge = self.political_knowledge.clamp(0.0, 10.0);
        self.vote_importance = self.vote_importance.clamp(0.0, 10.0);
        self.network_size = self.network_size.min(20);
        self.neighbor_trust = self.neighbor_trust.clamp(0.0, 10.0);
        self.community_participation = self.community_participation.clamp(0.0, 10.0);
        self.obedience_value = self.obedience_value.clamp(0.0, 10.0);
        self.rule_conformity = self.rule_conformity.clamp(0.0, 10.0);
        self.strong_leader_preference = self.strong_leader_preference.clamp(0.0, 10.0);
        self.powerlessness = self.powerlessness.clamp(0.0, 10.0);
        self.political_complexity = self.political_complexity.clamp(0.0, 10.0);
        self.party_indifference = self.party_indifference.clamp(0.0, 10.0);
        self.economic_security_priority = self.economic_security_priority.clamp(0.0, 10.0);
        self.environment_over_economy = self.environment_over_economy.clamp(0.0, 10.0);
        self.freedom_over_order = self.freedom_over_order.clamp(0.0, 10.0);
        self.anti_elitism = self.anti_elitism.clamp(0.0, 10.0);
        self.people_centrism = self.people_centrism.clamp(0.0, 10.0);
        self.manichean_outlook = self.manichean_outlook.clamp(0.0, 10.0);
        self.external_efficacy = self.external_efficacy.clamp(0.0, 10.0);
        self.generalized_trust = self.generalized_trust.clamp(0.0, 10.0);
        self.media_trust = self.media_trust.clamp(0.0, 10.0);
    }
}

impl Default for LatentTraits {
    fn default() -> Self {
        LatentTraits {
            self_efficacy: 5.0,
            political_knowledge: 5.0,
            vote_importance: 5.0,
            network_size: 8,
            neighbor_trust: 5.0,
            community_participation: 5.0,
            obedience_value: 5.0,
            rule_conformity: 5.0,
            strong_leader_preference: 5.0,
            powerlessness: 5.0,
            political_complexity: 5.0,
            party_indifference: 5.0,
            economic_security_priority: 5.0,
            environment_over_economy: 5.0,
            freedom_over_order: 5.0,
            anti_elitism: 5.0,
            people_centrism: 5.0,
            manichean_outlook: 5.0,
            external_efficacy: 5.0,
            generalized_trust: 5.0,
            media_trust: 5.0,
        }
    }
}
