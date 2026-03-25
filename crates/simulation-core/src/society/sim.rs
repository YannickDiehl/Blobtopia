use nalgebra::Point2;
use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

use std::collections::HashMap;

use super::blob::Blob;
use super::events::BlobtopiaEvent;
use super::building_assignment::{
    assign_all_buildings, reassign_workplace_single,
    reassign_leisure_spot_single, reassign_leisure_spot_with_homophily,
    compute_spot_atmosphere,
};
use super::contact_graph::ContactGraph;
use super::household::{Household, form_households, household_ages};
use super::schedule::{DailySchedule, DayType};
use crate::stage::blobtopia_stage::BlobtopiaLayout;
use crate::stage::city::{CityModel, FunctionalType};

/// Snapshot of the society at a given tick.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocietySnapshot {
    pub tick: u32,
    pub year: u32,
    pub month: u32,    // 1-12
    pub day: u32,      // 1-30 (simplified: 30 days per month)
    pub blobs: Vec<Blob>,
    /// Election results from this tick (if any): [Fortschritt, Mitte, Tradition, Unabhängige]
    pub election_results: Option<[u32; 4]>,
    /// Events that were processed this tick
    pub events_processed: Vec<String>,
    /// Daily schedules for each blob (blob UUID → schedule).
    /// Only present when city model is loaded.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub daily_schedules: HashMap<String, DailySchedule>,
}

/// Configuration for the society simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocietyConfig {
    /// How many ticks per "year" (1 tick = 1 day → 365 ticks/year)
    pub ticks_per_year: u32,
    /// Maximum years to simulate
    pub max_years: u32,
    /// Social influence strength (0.0 - 1.0). How much neighbors affect each other per tick.
    pub social_influence_strength: f64,
    /// Movement speed: how far blobs wander per tick
    pub movement_range: f64,
    /// Protest threshold: district-average protest_readiness above this triggers protest
    pub protest_threshold: f64,
    /// How many recent snapshots to keep in memory (older are discarded to save RAM)
    pub max_history_size: usize,
}

impl Default for SocietyConfig {
    fn default() -> Self {
        SocietyConfig {
            ticks_per_year: 365,  // 1 tick = 1 day
            max_years: 22,        // 22 years total = 8030 ticks
            social_influence_strength: 0.003,  // reduced: was 0.006 which caused 100% convergence in Mittelfeld. Now ~7:1 over anchoring (0.003*7=0.021 vs 0.005)
            movement_range: 3.2,   // daily wander range on 200×200 grid (compact town)
            protest_threshold: 0.6,
            max_history_size: 30,  // keep last 30 snapshots in RAM (~1 month)
        }
    }
}

/// The Blobtopia society simulation.
/// A stable society of 500 blobs that evolves over time through social influence,
/// events, elections, and protests — without biological reproduction or death.
pub struct BlobtopiaSim {
    pub rng: Arc<Mutex<SmallRng>>,
    pub config: SocietyConfig,
    pub layout: BlobtopiaLayout,
    pub city: Option<CityModel>,
    pub contact_graph: Option<ContactGraph>,
    pub households: Vec<Household>,
    pub current_tick: u32,
    pub blobs: Vec<Blob>,
    pub pending_events: Vec<BlobtopiaEvent>,
    pub history: Vec<SocietySnapshot>,
    /// True if a spontaneous protest erupted last tick (affects schedule generation)
    pub protest_active: bool,
}

impl BlobtopiaSim {
    pub fn new(seed: u64, blob_count: usize, config: SocietyConfig) -> Self {
        Self::new_internal(seed, blob_count, config, None)
    }

    /// Create a new simulation with city-aware building assignments.
    pub fn new_with_city(
        seed: u64,
        blob_count: usize,
        config: SocietyConfig,
        city: CityModel,
    ) -> Self {
        Self::new_internal(seed, blob_count, config, Some(city))
    }

    fn new_internal(
        seed: u64,
        blob_count: usize,
        config: SocietyConfig,
        city: Option<CityModel>,
    ) -> Self {
        let rng = Arc::new(Mutex::new(SmallRng::seed_from_u64(seed)));
        let layout = BlobtopiaLayout::new();

        // Create blobs distributed across districts, organized by households
        let distribution = layout.get_population_distribution(blob_count);
        let mut blobs = Vec::with_capacity(blob_count);
        let mut all_households = Vec::new();
        {
            let mut rng_guard = rng.lock().unwrap();
            let mut next_hh_id: u32 = 1;

            let last_name_fn = |district: u8, rng: &mut SmallRng| -> String {
                let profile = layout.profile(district);
                Blob::generate_last_name(profile, rng).to_string()
            };

            for (district_id, count) in &distribution {
                let profile = layout.profile(*district_id);

                let mut households = form_households(
                    *district_id,
                    *count,
                    &last_name_fn,
                    &mut rng_guard,
                    &mut next_hh_id,
                );

                for household in &mut households {
                    let ages = household_ages(
                        household.household_type,
                        &mut rng_guard,
                    );
                    for age in &ages {
                        let pos = layout.get_random_location_in_district(
                            *district_id,
                            &mut rng_guard,
                        );
                        let blob = Blob::new_in_household(
                            *district_id,
                            pos,
                            household.id,
                            &household.last_name,
                            *age,
                            profile,
                            &mut rng_guard,
                        );
                        household.member_ids.push(blob.id);
                        blobs.push(blob);
                    }
                }

                all_households.extend(households);
            }
        }

        // Correlate children's attitudes with parents (family socialization)
        {
            let mut rng_guard = rng.lock().unwrap();
            for household in &all_households {
                if household.member_ids.len() < 2 {
                    continue;
                }
                // Find parent and child indices
                let member_indices: Vec<usize> = household.member_ids.iter()
                    .filter_map(|id| blobs.iter().position(|g| g.id == *id))
                    .collect();

                // Compute parent-average attitudes (adults = age >= 18)
                let mut parent_sat = 0.0;
                let mut parent_ideo = 0.0;
                let mut parent_trust = 0.0;
                let mut parent_count = 0;
                for &idx in &member_indices {
                    if blobs[idx].age >= 18 {
                        parent_sat += blobs[idx].attitudes.political_satisfaction;
                        parent_ideo += blobs[idx].attitudes.ideology;
                        parent_trust += blobs[idx].attitudes.institutional_trust;
                        parent_count += 1;
                    }
                }
                if parent_count == 0 {
                    continue;
                }
                parent_sat /= parent_count as f64;
                parent_ideo /= parent_count as f64;
                parent_trust /= parent_count as f64;

                // Nudge children toward parent average (with noise for individuality)
                for &idx in &member_indices {
                    if blobs[idx].age < 18 {
                        let noise_s: f64 = rng_guard.gen_range(-1.0..1.0);
                        let noise_i: f64 = rng_guard.gen_range(-0.5..0.5);
                        let noise_t: f64 = rng_guard.gen_range(-1.0..1.0);
                        // 70% parent influence, 30% random
                        blobs[idx].attitudes.political_satisfaction =
                            (parent_sat * 0.7 + blobs[idx].attitudes.political_satisfaction * 0.3 + noise_s).clamp(0.0, 10.0);
                        blobs[idx].attitudes.ideology =
                            (parent_ideo * 0.7 + blobs[idx].attitudes.ideology * 0.3 + noise_i).clamp(1.0, 10.0);
                        blobs[idx].attitudes.institutional_trust =
                            (parent_trust * 0.7 + blobs[idx].attitudes.institutional_trust * 0.3 + noise_t).clamp(0.0, 10.0);
                    }
                }
            }
        }

        // Initialize policy positions from ideology + latent traits
        for blob in blobs.iter_mut() {
            blob.attitudes.init_policy_positions(&blob.latent_traits);
        }

        // Assign buildings if city model is available
        if let Some(ref city_model) = city {
            let mut rng_guard = rng.lock().unwrap();
            assign_all_buildings(&mut blobs, &mut all_households, city_model, layout.num_districts(), &mut rng_guard);
        }

        // Build contact graph from building assignments
        let contact_graph = if city.is_some() {
            Some(ContactGraph::build(&blobs))
        } else {
            None
        };

        // Generate initial schedules if city is available
        let initial_schedules = if city.is_some() {
            let mut rng_guard = rng.lock().unwrap();
            let civic_id = Self::find_civic_building_id(&city);
            let day_type = DayType::from_tick(0, false, false);
            let mut schedules = HashMap::new();
            for blob in &blobs {
                let lunch_hour = layout.profile(blob.district).lunch_hour;
                let schedule = DailySchedule::for_day(blob, day_type, civic_id, lunch_hour, &mut rng_guard);
                schedules.insert(blob.id.to_string(), schedule);
            }
            schedules
        } else {
            HashMap::new()
        };

        // Save initial snapshot
        let initial_snapshot = SocietySnapshot {
            tick: 0,
            year: 0,
            month: 1,
            day: 1,
            blobs: blobs.clone(),
            election_results: None,
            events_processed: vec![],
            daily_schedules: initial_schedules,
        };

        BlobtopiaSim {
            rng,
            config,
            layout,
            city,
            contact_graph,
            households: all_households,
            current_tick: 0,
            blobs,
            pending_events: Vec::new(),
            history: vec![initial_snapshot],
            protest_active: false,
        }
    }

    /// Current year (derived from tick count).
    pub fn current_year(&self) -> u32 {
        self.current_tick / self.config.ticks_per_year
    }

    /// Current month (1-12, simplified: each month = ~30 days).
    pub fn current_month(&self) -> u32 {
        let day_of_year = self.current_tick % self.config.ticks_per_year;
        (day_of_year / 30).min(11) + 1
    }

    /// Current day within month (1-30, simplified).
    pub fn current_day(&self) -> u32 {
        let day_of_year = self.current_tick % self.config.ticks_per_year;
        (day_of_year % 30) + 1
    }

    /// Formatted date string: "Jahr 3, Monat 7, Tag 15"
    pub fn date_string(&self) -> String {
        format!(
            "Jahr {}, Monat {}, Tag {}",
            self.current_year(),
            self.current_month(),
            self.current_day()
        )
    }

    /// Whether the simulation has reached its maximum duration.
    pub fn is_finished(&self) -> bool {
        self.current_year() >= self.config.max_years
    }

    /// Queue an event for processing in the next tick.
    pub fn queue_event(&mut self, event: BlobtopiaEvent) {
        self.pending_events.push(event);
    }

    /// Advance the simulation by one tick.
    /// Returns a snapshot of the new state.
    pub fn tick(&mut self) -> &SocietySnapshot {
        if self.is_finished() {
            return self.history.last().unwrap();
        }

        self.current_tick += 1;
        let mut events_processed = Vec::new();
        let mut election_results = None;

        // 0. Save previous satisfaction/trust for emotion delta computation
        let prev_states: Vec<(f64, f64)> = self.blobs.iter()
            .map(|g| (g.attitudes.political_satisfaction, g.attitudes.institutional_trust))
            .collect();

        // 1. Process pending events
        let events = std::mem::take(&mut self.pending_events);
        for event in events {
            let desc = self.process_event(&event);
            events_processed.push(desc);
            if matches!(event, BlobtopiaEvent::Election) {
                // Force party re-evaluation on election day
                let mut rng = self.rng.lock().unwrap();
                for blob in self.blobs.iter_mut() {
                    if blob.age >= 18 {
                        blob.political_state.party_stability_weeks = 52; // triggers re-eval
                        blob.political_state.update_from_attitudes(
                            &blob.attitudes, blob.age, blob.education_level,
                            &blob.latent_traits, &mut rng,
                        );
                    }
                }
                drop(rng);
                election_results = Some(self.run_election());
            }
        }

        // 2. Move blobs (random walk within district bounds)
        self.move_globs();

        // 3. Weekly updates: social influence, anchoring, noise, recovery, political & latent
        if self.current_tick % 7 == 0 {
            self.apply_social_influence();
            self.apply_latent_trait_social_influence();
            self.apply_media_environment();
            self.apply_ideology_realignment();
            self.apply_individual_agency();
            self.check_endogenous_events();

            // --- Authenticity fixes ---
            // Fix 2: Limit trust change rate to ±0.5 per week
            for (i, blob) in self.blobs.iter_mut().enumerate() {
                let prev_trust = prev_states[i].1;
                let trust_delta = blob.attitudes.institutional_trust - prev_trust;
                if trust_delta.abs() > 0.5 {
                    blob.attitudes.institutional_trust = prev_trust + trust_delta.signum() * 0.5;
                }
            }

            // Fix 4: Random personal events (1% chance per blob per week)
            {
                let mut rng = SmallRng::seed_from_u64(
                    (self.current_tick as u64).wrapping_mul(7919).wrapping_add(42)
                );
                for blob in self.blobs.iter_mut() {
                    if rng.gen::<f64>() < 0.01 {
                        let event_type: f64 = rng.gen();
                        if event_type < 0.40 {
                            // Job stress
                            blob.attitudes.political_satisfaction -= 0.3;
                        } else if event_type < 0.70 {
                            // Good news
                            blob.attitudes.political_satisfaction += 0.3;
                        } else if event_type < 0.85 {
                            // Trust loss
                            blob.attitudes.institutional_trust -= 0.4;
                        } else {
                            // Community event
                            blob.attitudes.institutional_trust += 0.3;
                        }
                        blob.attitudes.clamp();
                    }
                }
            }

            // Fix 5: Wealthy dampening — satisfied blobs drift slightly back
            for blob in self.blobs.iter_mut() {
                if blob.attitudes.political_satisfaction > 7.0 {
                    let excess = blob.attitudes.political_satisfaction - 7.0;
                    blob.attitudes.political_satisfaction -= excess * 0.02;
                }
            }

            // Pre-compute reference incomes for Relative Deprivation (Runciman 1966)
            let reference_incomes: Vec<f64> = if let Some(ref graph) = self.contact_graph {
                (0..self.blobs.len()).map(|i| {
                    let contacts = graph.get(i);
                    if contacts.is_empty() {
                        self.blobs[i].income
                    } else {
                        let sum: f64 = contacts.iter()
                            .map(|c| self.blobs[c.other_idx].income)
                            .sum();
                        sum / contacts.len() as f64
                    }
                }).collect()
            } else {
                self.blobs.iter().map(|g| g.income).collect()
            };

            // ── Distriktspezifische säkulare Trends auf Base-Werte ──
            // With saturation: trends weaken as bases approach bounds
            let trend_damp = |base: f64, direction: f64| -> f64 {
                if direction < 0.0 {
                    // Downward trend: weaker near floor
                    (base / 3.0).clamp(0.05, 1.0)
                } else {
                    // Upward trend: weaker near ceiling
                    ((10.0 - base) / 3.0).clamp(0.05, 1.0)
                }
            };
            for blob in self.blobs.iter_mut() {
                match blob.district {
                    0 => { // Grüntal: rural neglect, conservative deepening
                        // Attitudes
                        blob.base_trust -= 0.0004 * trend_damp(blob.base_trust, -1.0);
                        blob.base_satisfaction -= 0.0006 * trend_damp(blob.base_satisfaction, -1.0);
                        blob.base_ideology += 0.00045 * trend_damp(blob.base_ideology, 1.0);
                        // ONLY Authoritarianism (single construct per district trend)
                        blob.base_latent_traits.obedience_value += 0.0008;
                        blob.base_latent_traits.rule_conformity += 0.0006;
                        blob.base_latent_traits.strong_leader_preference += 0.0009;
                    }
                    1 => { // Sonnenberg: academic-progressive, institutional confidence
                        blob.base_trust += 0.0001 * trend_damp(blob.base_trust, 1.0);
                        blob.base_satisfaction += 0.0002 * trend_damp(blob.base_satisfaction, 1.0);
                        blob.base_ideology -= 0.00054 * trend_damp(blob.base_ideology, -1.0);
                        // ONLY Auth (down) + Efficacy (up) — no Mat cross-coupling
                        blob.base_latent_traits.obedience_value -= 0.0006;
                        blob.base_latent_traits.rule_conformity -= 0.0005;
                        blob.base_latent_traits.strong_leader_preference -= 0.0008;
                        blob.base_latent_traits.self_efficacy += 0.0003 * trend_damp(blob.base_latent_traits.self_efficacy, 1.0);
                        blob.base_latent_traits.political_knowledge += 0.0004;
                    }
                    2 => { // Hafenviertel: gentrification tension, political activation
                        blob.base_trust -= 0.0002 * trend_damp(blob.base_trust, -1.0);
                        blob.base_satisfaction += 0.0003 * trend_damp(blob.base_satisfaction, 1.0);
                        // ONLY SocialCapital + Alienation (no cross-coupling)
                        blob.base_latent_traits.neighbor_trust -= 0.0004;
                        blob.base_latent_traits.community_participation += 0.0003;
                        blob.base_latent_traits.party_indifference -= 0.0003;
                    }
                    3 => { // Mittelfeld: suburban comfort → complacency
                        blob.base_trust -= 0.0001 * trend_damp(blob.base_trust, -1.0);
                        blob.base_satisfaction -= 0.0002 * trend_damp(blob.base_satisfaction, -1.0);
                        blob.base_ideology += 0.00018 * trend_damp(blob.base_ideology, 1.0);
                        // ONLY SocialCapital + Alienation (no Efficacy cross-coupling)
                        blob.base_latent_traits.community_participation -= 0.0003;
                        blob.base_latent_traits.party_indifference += 0.0004;
                        blob.base_latent_traits.political_complexity += 0.0003;
                    }
                    4 => { // Industriezone: deindustrialization crisis
                        blob.base_trust -= 0.0006 * trend_damp(blob.base_trust, -1.0);
                        blob.base_satisfaction -= 0.0010 * trend_damp(blob.base_satisfaction, -1.0);
                        // ONLY Alienation (single construct per district trend)
                        blob.base_latent_traits.powerlessness += 0.0010;
                        blob.base_latent_traits.political_complexity += 0.0006;
                        blob.base_latent_traits.party_indifference += 0.0008;
                    }
                    _ => {}
                }
                blob.base_latent_traits.clamp();
            }

            // ── Distrikt-Feedback-Loops ──
            // Compute district means, then apply amplifying/dampening effects
            {
                let mut district_sat_sum = [0.0f64; 5];
                let mut district_trust_sum = [0.0f64; 5];
                let mut district_count = [0u32; 5];
                for blob in self.blobs.iter() {
                    let d = blob.district as usize;
                    if d < 5 {
                        district_sat_sum[d] += blob.attitudes.political_satisfaction;
                        district_trust_sum[d] += blob.attitudes.institutional_trust;
                        district_count[d] += 1;
                    }
                }
                for blob in self.blobs.iter_mut() {
                    let d = blob.district as usize;
                    if d < 5 && district_count[d] > 0 {
                        let mean_sat = district_sat_sum[d] / district_count[d] as f64;
                        let mean_trust = district_trust_sum[d] / district_count[d] as f64;
                        // Low satisfaction → trust erosion (saturating near floor)
                        if mean_sat < 4.0 {
                            let saturation = (blob.base_trust / 5.0).clamp(0.1, 1.0);
                            blob.base_trust -= 0.0003 * (4.0 - mean_sat) * saturation;
                        }
                        // High trust → satisfaction boost (saturating near ceiling)
                        if mean_trust > 6.0 {
                            let saturation = ((10.0 - blob.base_satisfaction) / 5.0).clamp(0.1, 1.0);
                            blob.base_satisfaction += 0.0002 * (mean_trust - 6.0) * saturation;
                        }
                        // Institutional collapse → satisfaction drops (saturating)
                        if mean_trust < 2.0 {
                            let saturation = (blob.base_satisfaction / 5.0).clamp(0.1, 1.0);
                            blob.base_satisfaction -= 0.0003 * (2.0 - mean_trust) * saturation;
                        }
                        // High satisfaction → trust boost (saturating)
                        if mean_sat > 7.0 {
                            let saturation = ((10.0 - blob.base_trust) / 5.0).clamp(0.1, 1.0);
                            blob.base_trust += 0.0002 * (mean_sat - 7.0) * saturation;
                        }
                    }
                }
            }

            let mut needs_workplace_reassign: Vec<usize> = Vec::new();
            let mut rng = self.rng.lock().unwrap();
            for (i, blob) in self.blobs.iter_mut().enumerate() {
                // ── Individual Life Events (Life-Course Theory) ──
                // 1% chance per week of a significant life event
                if blob.age >= 18 && rng.gen::<f64>() < 0.01 {
                    // 6 event types — NET-NEUTRAL on base values to prevent inflation/deflation
                    // Current values shift visibly, bases barely move (personality stability)
                    match rng.gen_range(0..6) {
                        0 => {
                            // Job loss (16.7%): income drops, satisfaction drops
                            blob.income = (blob.income * 0.8).max(800.0);
                            blob.attitudes.political_satisfaction -= 1.5;
                            blob.attitudes.institutional_trust -= 0.5;
                            blob.base_satisfaction -= 0.08; // minimal base scarring
                            blob.latent_traits.self_efficacy -= 0.4;
                            blob.latent_traits.powerlessness += 0.3;
                            blob.latent_traits.economic_security_priority += 0.3;
                            needs_workplace_reassign.push(i);
                        }
                        1 => {
                            // Illness (16.7%): temporary satisfaction drop, no base change
                            blob.attitudes.political_satisfaction -= 1.2;
                            blob.latent_traits.powerlessness += 0.15;
                            blob.latent_traits.community_participation -= 0.2;
                        }
                        2 => {
                            // Promotion / career success (16.7%)
                            blob.income = (blob.income * 1.25).min(7000.0);
                            blob.attitudes.political_satisfaction += 1.5;
                            blob.base_satisfaction += 0.08; // symmetric with job loss
                            blob.latent_traits.self_efficacy += 0.3;
                            blob.latent_traits.economic_security_priority -= 0.2;
                            blob.latent_traits.powerlessness -= 0.2;
                            needs_workplace_reassign.push(i);
                        }
                        3 => {
                            // Community success (16.7%): no base inflation
                            blob.attitudes.institutional_trust += 0.8;
                            blob.attitudes.political_satisfaction += 1.0;
                            blob.latent_traits.community_participation += 0.4;
                            blob.latent_traits.neighbor_trust += 0.3;
                            blob.latent_traits.self_efficacy += 0.2;
                            blob.latent_traits.powerlessness -= 0.15;
                        }
                        4 => {
                            // Personal milestone (16.7%): mild temporary boost
                            blob.attitudes.political_satisfaction += 0.5;
                            blob.latent_traits.neighbor_trust += 0.15;
                            blob.latent_traits.community_participation += 0.15;
                        }
                        _ => {
                            // Everyday positive (16.7%): very mild
                            blob.attitudes.political_satisfaction += 0.4;
                            blob.latent_traits.community_participation += 0.1;
                        }
                    }
                }

                // Income recovery: adults below initial income slowly recover
                // (new job search, retraining, social safety net)
                if blob.age >= 18 && blob.income < blob.base_income {
                    let recovery_rate = 0.003 + blob.education_level as f64 * 0.001;
                    let gap = blob.base_income - blob.income;
                    blob.income = (blob.income + gap * recovery_rate).min(blob.base_income);
                }

                // Personality anchoring with saturation dampening
                let sat_damp = |v: f64, lo: f64, hi: f64| -> f64 {
                    let d = (v - lo).max(0.01).min((hi - v).max(0.01));
                    (d / ((hi - lo) * 0.3)).clamp(0.05, 1.0)
                };
                blob.attitudes.ideology += 0.004 * sat_damp(blob.attitudes.ideology, 1.0, 10.0)
                    * (blob.base_ideology - blob.attitudes.ideology);
                blob.attitudes.political_satisfaction += 0.005 * sat_damp(blob.attitudes.political_satisfaction, 0.0, 10.0)
                    * (blob.base_satisfaction - blob.attitudes.political_satisfaction);
                blob.attitudes.institutional_trust += 0.005 * sat_damp(blob.attitudes.institutional_trust, 0.0, 10.0)
                    * (blob.base_trust - blob.attitudes.institutional_trust);

                // Ceiling erosion — stronger to keep values in realistic range
                // Real German ESS data: trust mean ~4.5, satisfaction mean ~5.5
                // No district should drift above 7.5 long-term
                if blob.attitudes.institutional_trust > 5.0 {
                    let complacency = (blob.attitudes.institutional_trust - 5.0) * 0.035;
                    blob.attitudes.institutional_trust -= complacency;
                }
                if blob.base_trust > 4.5 {
                    blob.base_trust -= (blob.base_trust - 4.5) * 0.007;
                }
                if blob.attitudes.political_satisfaction > 7.0 {
                    let ceiling_pull = (blob.attitudes.political_satisfaction - 7.0) * 0.020;
                    blob.attitudes.political_satisfaction -= ceiling_pull;
                }
                if blob.base_satisfaction > 6.5 {
                    blob.base_satisfaction -= (blob.base_satisfaction - 6.5) * 0.003;
                }

                // Hard floor — no citizen at absolute zero in a functioning democracy
                if blob.attitudes.political_satisfaction < 0.5 {
                    blob.attitudes.political_satisfaction = 0.5 + rng.gen_range(0.0..0.3);
                }
                if blob.attitudes.institutional_trust < 0.5 {
                    blob.attitudes.institutional_trust = 0.5 + rng.gen_range(0.0..0.3);
                }

                // ── Ceiling erosion for latent traits ──
                // Mirrors trust/satisfaction ceiling: ESS internal efficacy mean ~5.5
                if blob.latent_traits.self_efficacy > 7.5 {
                    blob.latent_traits.self_efficacy -=
                        (blob.latent_traits.self_efficacy - 7.5) * 0.035;
                }
                if blob.base_latent_traits.self_efficacy > 7.0 {
                    blob.base_latent_traits.self_efficacy -=
                        (blob.base_latent_traits.self_efficacy - 7.0) * 0.003;
                }
                if blob.latent_traits.vote_importance > 8.0 {
                    blob.latent_traits.vote_importance -=
                        (blob.latent_traits.vote_importance - 8.0) * 0.025;
                }
                if blob.base_latent_traits.vote_importance > 7.5 {
                    blob.base_latent_traits.vote_importance -=
                        (blob.base_latent_traits.vote_importance - 7.5) * 0.002;
                }

                // Ceiling erosion for community_participation
                if blob.latent_traits.community_participation > 7.5 {
                    blob.latent_traits.community_participation -=
                        (blob.latent_traits.community_participation - 7.5) * 0.025;
                }
                if blob.base_latent_traits.community_participation > 7.0 {
                    blob.base_latent_traits.community_participation -=
                        (blob.base_latent_traits.community_participation - 7.0) * 0.003;
                }

                // Complacency: very high efficacy + satisfaction → "things are fine"
                // Olson (1965): collective goods problem at high perceived efficacy
                if blob.latent_traits.self_efficacy > 8.0 && blob.attitudes.political_satisfaction > 6.0 {
                    let complacency = (blob.latent_traits.self_efficacy - 8.0)
                        * (blob.attitudes.political_satisfaction - 6.0) * 0.002;
                    blob.latent_traits.self_efficacy -= complacency;
                    blob.latent_traits.vote_importance -= complacency * 0.5;
                    blob.latent_traits.community_participation -= complacency * 0.7;
                }

                // Hedonic adaptation — stronger recovery to prevent extended floor-sitting
                // No citizen stays permanently at satisfaction=0 or trust=0 in a functioning democracy
                let coping_resources = 0.5 + blob.income / 7000.0 * 0.5
                    + blob.education_level as f64 * 0.15;
                // Satisfaction floor raised: Poor=2.5, Middle=3.5, Rich=4.5
                let sat_floor = 2.5 + blob.income / 7000.0 * 2.0;
                if blob.attitudes.political_satisfaction < sat_floor {
                    let recovery = (sat_floor - blob.attitudes.political_satisfaction) * 0.020 * coping_resources;
                    blob.attitudes.political_satisfaction += recovery;
                    blob.base_satisfaction += recovery * 0.20;
                }
                // Trust floor: Edu0=1.5, Edu1=1.9, Edu2=2.3, Edu3=2.7
                let trust_floor = 1.5 + blob.education_level as f64 * 0.4;
                if blob.attitudes.institutional_trust < trust_floor {
                    let recovery = (trust_floor - blob.attitudes.institutional_trust) * 0.015 * coping_resources;
                    blob.attitudes.institutional_trust += recovery;
                    blob.base_trust += recovery * 0.15;
                }

                // Base value recovery — prevents permanent ratchet (strengthened)
                let base_sat_floor = 2.0 + blob.income / 7000.0 * 1.5;
                if blob.base_satisfaction < base_sat_floor {
                    blob.base_satisfaction += 0.004 * (base_sat_floor - blob.base_satisfaction);
                }
                let base_trust_floor = 1.0 + blob.education_level as f64 * 0.3;
                if blob.base_trust < base_trust_floor {
                    blob.base_trust += 0.002 * (base_trust_floor - blob.base_trust);
                }

                // ── Relative Deprivation (Runciman 1966) ──
                let ref_income = reference_incomes[i];
                if blob.income < ref_income && (ref_income - blob.income) > 500.0 {
                    let deprivation = (ref_income - blob.income) / ref_income;
                    blob.attitudes.political_satisfaction -= deprivation * 0.05;
                }

                // Random noise — increased for ideology to preserve within-district variance
                blob.attitudes.ideology += rng.gen_range(-0.20..0.20);
                blob.attitudes.political_satisfaction += rng.gen_range(-0.12..0.12);
                blob.attitudes.institutional_trust += rng.gen_range(-0.12..0.12);

                // Recovery: REMOVED the old mean-reversion toward district baseline.
                // Districts now differentiate via structural trends on base values.

                // Clamp base values to prevent unbounded drift
                blob.base_ideology = blob.base_ideology.clamp(0.1, 10.9);
                blob.base_satisfaction = blob.base_satisfaction.clamp(-1.0, 11.0);
                blob.base_trust = blob.base_trust.clamp(-1.0, 11.0);

                blob.attitudes.clamp();

                // ── Policy drift: policies follow ideology + traits over time ──
                // Soft drift (5% per tick) so policies adjust gradually, not instantly.
                // This mirrors how real political positions evolve with underlying attitudes.
                {
                    let lt = &blob.latent_traits;
                    let ic = (blob.attitudes.ideology - 5.5) / 4.5; // -1..+1
                    let drift = 0.05;

                    let target_eco = (5.0 + ic * 3.0 + (lt.economic_security_priority - 5.0) * 0.3).clamp(0.0, 10.0);
                    blob.attitudes.policy_economy += drift * (target_eco - blob.attitudes.policy_economy);

                    let target_env = (5.0 + (5.0 - lt.environment_over_economy) * 0.8 + ic * 0.5).clamp(0.0, 10.0);
                    blob.attitudes.policy_environment += drift * (target_env - blob.attitudes.policy_environment);

                    let target_sec = (5.0 + (lt.obedience_value - 5.0) * 0.4 + (5.0 - lt.freedom_over_order) * 0.4 + ic * 0.5).clamp(0.0, 10.0);
                    blob.attitudes.policy_security += drift * (target_sec - blob.attitudes.policy_security);

                    let target_soc = (5.0 + ic * 2.5 + (lt.economic_security_priority - 5.0) * 0.3).clamp(0.0, 10.0);
                    blob.attitudes.policy_social += drift * (target_soc - blob.attitudes.policy_social);

                    let target_mig = (5.0 + (lt.obedience_value - 5.0) * 0.3 + (lt.strong_leader_preference - 5.0) * 0.2 + ic * 2.0).clamp(0.0, 10.0);
                    blob.attitudes.policy_migration += drift * (target_mig - blob.attitudes.policy_migration);

                    let target_dem = (5.0 + (5.0 - lt.anti_elitism) * 0.4 + (5.0 - lt.people_centrism) * 0.3 + (lt.external_efficacy - 5.0) * 0.2).clamp(0.0, 10.0);
                    blob.attitudes.policy_democracy += drift * (target_dem - blob.attitudes.policy_democracy);

                    blob.attitudes.clamp();
                }

                // Update political state (probabilistic model)
                blob.political_state.update_from_attitudes(
                    &blob.attitudes,
                    blob.age,
                    blob.education_level,
                    &blob.latent_traits,
                    &mut rng,
                );

                // ── Cognitive Dissonance (Festinger 1957) ──
                if let Some(party) = blob.political_state.party_affiliation {
                    let party_center = match party {
                        0 => 3.7,   // Fortschritt
                        1 => 5.5,   // Mitte
                        2 => 7.3,   // Tradition
                        _ => 5.5,   // Unabhängige → no pull
                    };
                    if party < 3 {
                        let dissonance = (blob.attitudes.ideology - party_center).abs();
                        if dissonance > 1.35 {
                            blob.attitudes.ideology += 0.005 * (party_center - blob.attitudes.ideology);
                            blob.attitudes.clamp();
                        }
                    }
                }

                // ── Latent traits: personality anchoring + contextual pressure ──
                // 1. Personality anchoring: strengthened to preserve CFA factor structure
                // Rate 0.008 = half-life ~87 weeks (~1.7 years) — psychologically plausible
                // (Big Five stability: Costa & McCrae show high retest over 2-6 years)
                blob.latent_traits.apply_personality_anchoring(&blob.base_latent_traits, 0.015);

                // 2. Contextual pressure: attitudes/demographics create additional drift
                blob.latent_traits.update_from_context(
                    blob.attitudes.political_satisfaction,
                    blob.attitudes.ideology,
                    blob.attitudes.institutional_trust,
                    blob.income_normalized(),
                    blob.education_level,
                    blob.need_for_closure,
                    &mut rng,
                );
            }

            // ── Non-linear Feedback Loops on Latent Traits (District-Level) ──
            // Threshold effects create realistic tipping points and polarization.
            {
                // Compute district-level means for latent traits
                let mut d_auth_sum = [0.0f64; 5];
                let mut d_alien_sum = [0.0f64; 5];
                let mut d_efficacy_sum = [0.0f64; 5];
                let mut d_count = [0u32; 5];
                for blob in self.blobs.iter() {
                    let d = blob.district as usize;
                    if d < 5 {
                        d_auth_sum[d] += (blob.latent_traits.obedience_value
                            + blob.latent_traits.rule_conformity
                            + blob.latent_traits.strong_leader_preference) / 3.0;
                        d_alien_sum[d] += (blob.latent_traits.powerlessness
                            + blob.latent_traits.political_complexity
                            + blob.latent_traits.party_indifference) / 3.0;
                        d_efficacy_sum[d] += (blob.latent_traits.self_efficacy
                            + blob.latent_traits.political_knowledge
                            + blob.latent_traits.vote_importance) / 3.0;
                        d_count[d] += 1;
                    }
                }

                for blob in self.blobs.iter_mut() {
                    let d = blob.district as usize;
                    if d >= 5 || d_count[d] == 0 { continue; }
                    let mean_auth = d_auth_sum[d] / d_count[d] as f64;
                    let mean_alien = d_alien_sum[d] / d_count[d] as f64;
                    let mean_efficacy = d_efficacy_sum[d] / d_count[d] as f64;

                    // Norm cascade: when district auth > 6.0, conformity pressure accelerates
                    // (Noelle-Neumann spiral of silence: dominant opinion becomes self-reinforcing)
                    if mean_auth > 6.0 {
                        let excess = (mean_auth - 6.0) * 0.003;
                        blob.base_latent_traits.obedience_value += excess;
                        blob.base_latent_traits.rule_conformity += excess * 0.8;
                        blob.base_latent_traits.strong_leader_preference += excess * 0.9;
                    }
                    // Counter-pressure: when district auth < 3.5, libertarian norms spread
                    // STAYS WITHIN AUTH CONSTRUCT (freedom_over_order removed — was cross-coupling with Mat)
                    if mean_auth < 3.5 {
                        let deficit = (3.5 - mean_auth) * 0.003;
                        blob.base_latent_traits.obedience_value -= deficit;
                        blob.base_latent_traits.rule_conformity -= deficit * 0.8;
                        blob.base_latent_traits.strong_leader_preference -= deficit * 0.9;
                    }

                    // Alienation spiral: STAYS WITHIN ALIENATION CONSTRUCT
                    // (self_efficacy removed — was creating r=-1.0 between Eff↔Alien)
                    if mean_alien > 6.0 {
                        let excess = (mean_alien - 6.0) * 0.002;
                        blob.base_latent_traits.powerlessness += excess;
                        blob.base_latent_traits.party_indifference += excess * 0.8;
                        blob.base_latent_traits.political_complexity += excess * 0.4;
                    }

                    // Efficacy virtuous cycle: STAYS WITHIN EFFICACY CONSTRUCT
                    // (powerlessness removed — was cross-coupling with Alienation)
                    if mean_efficacy > 6.5 && mean_efficacy < 8.5 {
                        let excess = (mean_efficacy - 6.5) * 0.001;
                        let ceiling_damp = ((10.0 - blob.base_latent_traits.self_efficacy) / 3.0).clamp(0.05, 1.0);
                        blob.base_latent_traits.self_efficacy += excess * ceiling_damp;
                        blob.base_latent_traits.vote_importance += excess * 0.5 * ceiling_damp;
                        blob.base_latent_traits.political_knowledge += excess * 0.3 * ceiling_damp;
                    }

                    blob.base_latent_traits.clamp();
                }
            }

            // ── Phase 2: Workplace reassignment after life events ──
            drop(rng);
            if let Some(ref city) = self.city {
                if !needs_workplace_reassign.is_empty() {
                    let mut rng = self.rng.lock().unwrap();
                    for idx in needs_workplace_reassign {
                        reassign_workplace_single(&mut self.blobs[idx], city, &mut rng);
                    }
                }
            }
        }

        // 4. Periodic social mobility and network dynamics
        // ── Phase 3: Leisure spot rotation every 26 weeks (with homophily) ──
        if self.current_tick % 182 == 0 && self.current_tick > 0 {
            if let Some(ref city) = self.city {
                // Compute current ideological atmosphere of each leisure spot
                let atmosphere = compute_spot_atmosphere(&self.blobs);
                let mut rng = self.rng.lock().unwrap();
                for i in 0..self.blobs.len() {
                    if self.blobs[i].is_child() { continue; } // children stay at school
                    if rng.gen::<f64>() < 0.20 {  // 20% chance per cycle
                        reassign_leisure_spot_with_homophily(
                            &mut self.blobs[i], city, 0.15,
                            Some(&atmosphere), &mut rng,
                        );
                    }
                }
            }
            // ── Phase 1: Contact graph rebuild ──
            if self.city.is_some() {
                self.contact_graph = Some(ContactGraph::build(&self.blobs));
                // Update network_size from actual contact count
                if let Some(ref graph) = self.contact_graph {
                    for (i, blob) in self.blobs.iter_mut().enumerate() {
                        blob.latent_traits.network_size = graph.get(i).len().min(20) as u8;
                    }
                }
            }
        }

        // ── Phase 4: Annual processes: aging + economic feedback + residential mobility ──
        if self.current_tick % 365 == 0 && self.current_tick > 0 {
            // P9: Age progression — 1 year per simulated year (no cap)
            for blob in self.blobs.iter_mut() {
                blob.age = blob.age.saturating_add(1);
            }

            // P9b: Coming-of-age transition — children turning 18 become adults
            {
                let mut rng = self.rng.lock().unwrap();
                for blob in self.blobs.iter_mut() {
                    // Detect newly turned 18: base_income == 0 means they were never initialized as adult
                    // (income itself may have been modified by events via clamp(800, 7000))
                    if blob.age == 18 && blob.base_income == 0.0 {
                        let profile = self.layout.profile(blob.district);
                        blob.come_of_age(profile, &mut rng);

                        // Assign workplace + lunch spot (if city available)
                        if let Some(ref city) = self.city {
                            reassign_workplace_single(blob, city, &mut rng);
                            reassign_leisure_spot_single(blob, city, 0.15, &mut rng);
                        }

                        // Coming-of-age is an internal transition, not a public event.
                        // No event logged — keeps the timeline focused on political events.
                    }
                }
            }

            self.apply_economic_feedback();
            self.evaluate_residential_mobility();
            // Rebuild graph after residential changes
            if self.city.is_some() {
                self.contact_graph = Some(ContactGraph::build(&self.blobs));
                if let Some(ref graph) = self.contact_graph {
                    for (i, blob) in self.blobs.iter_mut().enumerate() {
                        blob.latent_traits.network_size = graph.get(i).len().min(20) as u8;
                    }
                }
            }
        }

        // 5. Generate daily schedules
        let is_election = election_results.is_some();
        let is_protest = self.protest_active;
        self.protest_active = false;  // reset for next tick
        let daily_schedules = if self.city.is_some() {
            let mut rng = self.rng.lock().unwrap();
            let civic_id = Self::find_civic_building_id(&self.city);
            let day_type = DayType::from_tick(self.current_tick, is_election, is_protest);
            let mut schedules = HashMap::new();
            for blob in &self.blobs {
                let lunch_hour = self.layout.profile(blob.district).lunch_hour;
                let schedule = DailySchedule::for_day(blob, day_type, civic_id, lunch_hour, &mut rng);
                schedules.insert(blob.id.to_string(), schedule);
            }
            schedules
        } else {
            HashMap::new()
        };

        // 5b. Compute emotions from attitude deltas
        let has_event = !events_processed.is_empty();
        for (i, blob) in self.blobs.iter_mut().enumerate() {
            let (prev_sat, prev_trust) = prev_states[i];
            let delta_sat = blob.attitudes.political_satisfaction - prev_sat;
            let delta_trust = blob.attitudes.institutional_trust - prev_trust;
            blob.emotion = super::blob::BlobEmotion::compute(
                blob.attitudes.political_satisfaction,
                delta_sat,
                delta_trust,
                blob.political_state.protest_readiness,
                has_event,
            );
        }

        // 6. Save snapshot
        let snapshot = SocietySnapshot {
            tick: self.current_tick,
            year: self.current_year(),
            month: self.current_month(),
            day: self.current_day(),
            blobs: self.blobs.clone(),
            election_results,
            events_processed,
            daily_schedules,
        };
        self.history.push(snapshot);

        // Trim history to max_history_size
        if self.history.len() > self.config.max_history_size {
            let excess = self.history.len() - self.config.max_history_size;
            self.history.drain(0..excess);
        }

        self.history.last().unwrap()
    }

    /// Move blobs: random walk, constrained to their home district.
    /// Globs occasionally wander into the civic center area but tend to stay in their district.
    fn move_globs(&mut self) {
        let mut rng = self.rng.lock().unwrap();
        let range = self.config.movement_range;

        for blob in &mut self.blobs {
            let d = blob.district as usize;
            let bounds = if d < self.layout.districts.len() {
                let district = &self.layout.districts[d];
                district.bounds
            } else {
                (0.0, 0.0, 500.0, 500.0)
            };

            let dx: f64 = rng.gen_range(-range..range);
            let dy: f64 = rng.gen_range(-range..range);

            // 85% chance to stay in district, 15% chance to wander towards civic center
            let wander_to_center: bool = rng.gen::<f64>() < 0.15;

            if wander_to_center {
                // Move towards civic center (Marktplatz: world 400,400 → sim 100,100)
                let cx = 100.0;
                let cy = 100.0;
                let to_center_x = (cx - blob.pos.x) * 0.1;
                let to_center_y = (cy - blob.pos.y) * 0.1;
                let new_x = (blob.pos.x + to_center_x + dx * 0.3).clamp(0.0, 200.0);
                let new_y = (blob.pos.y + to_center_y + dy * 0.3).clamp(0.0, 200.0);
                blob.pos = Point2::new(new_x, new_y);
            } else {
                // Stay within district bounds (with some elasticity)
                let margin = range * 0.5;
                let new_x = (blob.pos.x + dx).clamp(bounds.0 - margin, bounds.2 + margin);
                let new_y = (blob.pos.y + dy).clamp(bounds.1 - margin, bounds.3 + margin);

                // Gentle pull back towards home if wandered out
                let pull_x = if new_x < bounds.0 { 2.0 } else if new_x > bounds.2 { -2.0 } else { 0.0 };
                let pull_y = if new_y < bounds.1 { 2.0 } else if new_y > bounds.3 { -2.0 } else { 0.0 };

                blob.pos = Point2::new(
                    (new_x + pull_x).clamp(0.0, 200.0),
                    (new_y + pull_y).clamp(0.0, 200.0),
                );
            }
        }
    }

    /// Apply social influence using bounded confidence (Hegselmann-Krause model).
    /// Only contacts with similar ideology influence each other; distant contacts
    /// cause slight repulsion. Uses contact graph or falls back to proximity.
    fn apply_social_influence(&mut self) {
        // Scaled up by 7 to compensate for weekly application
        let strength = self.config.social_influence_strength * 7.0;
        let ideo_threshold = 2.7;  // bounded confidence for ideology (scaled for 1-10)
        let sat_trust_threshold = 4.0; // bounded confidence for satisfaction/trust

        if let Some(ref graph) = self.contact_graph {
            // ── Contact-graph-based influence with bounded confidence ──
            // Snapshot: attitudes + party for in-group bias
            let attitudes: Vec<(f64, f64, f64, Option<u8>)> = self.blobs.iter()
                .map(|g| (
                    g.attitudes.political_satisfaction,
                    g.attitudes.ideology,
                    g.attitudes.institutional_trust,
                    g.political_state.party_affiliation,
                ))
                .collect();

            for (i, blob) in self.blobs.iter_mut().enumerate() {
                let contacts = graph.get(i);
                if contacts.is_empty() {
                    continue;
                }

                let mut sat_shift = 0.0;
                let mut ideo_shift = 0.0;
                let mut trust_shift = 0.0;
                let mut weight_sum = 0.0;

                for contact in contacts {
                    let (other_sat, other_ideo, other_trust, other_party) = attitudes[contact.other_idx];
                    let base_weight = contact.contact_type.weight();

                    // In-Group Bias (Tajfel & Turner 1979): same-party → stronger influence
                    let party_match = blob.political_state.party_affiliation.is_some()
                        && blob.political_state.party_affiliation == other_party;
                    let weight = base_weight * if party_match { 1.3 } else { 0.7 };

                    // Bounded confidence for ideology
                    let ideo_diff = (other_ideo - blob.attitudes.ideology).abs();
                    if ideo_diff < ideo_threshold {
                        ideo_shift += (other_ideo - blob.attitudes.ideology) * weight;
                        // Group Polarization (Moscovici & Zavalloni 1969):
                        // Same-side interaction pushes further from center
                        let same_side = (blob.attitudes.ideology > 5.5) == (other_ideo > 5.5);
                        let centered_ideo = blob.attitudes.ideology - 5.5;
                        if same_side && centered_ideo.abs() > 0.27 {
                            // Reduced polarization, saturating at extremes
                            let extremity_damper = (4.5 - centered_ideo.abs()) / 4.5;
                            ideo_shift += 0.054 * centered_ideo.signum() * weight * extremity_damper.max(0.05);
                        }
                    } else {
                        // Repulsion for distant ideologies (strengthened: was 0.05, too weak to prevent convergence)
                        ideo_shift -= 0.108 * (other_ideo - blob.attitudes.ideology).signum() * weight;
                    }

                    // Bounded confidence for satisfaction
                    let sat_diff = (other_sat - blob.attitudes.political_satisfaction).abs();
                    if sat_diff < sat_trust_threshold {
                        sat_shift += (other_sat - blob.attitudes.political_satisfaction) * weight;
                    }

                    // Bounded confidence for trust
                    let trust_diff = (other_trust - blob.attitudes.institutional_trust).abs();
                    if trust_diff < sat_trust_threshold {
                        trust_shift += (other_trust - blob.attitudes.institutional_trust) * weight;
                    }

                    weight_sum += weight;
                }

                if weight_sum > 0.0 {
                    // Susceptibility modulated by education AND need_for_closure
                    // High NfCC → MORE susceptible to social influence (seeks clear answers from peers)
                    let edu_resist = 1.0 / (1.0 + blob.education_level as f64 * 0.25);
                    let nfcc_boost = 0.5 + blob.need_for_closure * 0.08; // NfCC 0→0.5x, NfCC 10→1.3x
                    let susceptibility = edu_resist * nfcc_boost;
                    let auth_resistance = 1.0 + blob.latent_traits.obedience_value * 0.05;
                    let ideo_resistance = 1.0 / (auth_resistance + (blob.attitudes.ideology - 5.5).abs() * 0.3);
                    blob.attitudes.political_satisfaction += strength * susceptibility * sat_shift / weight_sum;
                    blob.attitudes.ideology += strength * susceptibility * ideo_resistance * ideo_shift / weight_sum;
                    blob.attitudes.institutional_trust += strength * susceptibility * trust_shift / weight_sum;
                    blob.attitudes.clamp();
                }
            }
        } else {
            // ── Fallback: proximity-based influence with bounded confidence ──
            let snapshots: Vec<(Point2<f64>, f64, f64, f64, f64)> = self.blobs.iter()
                .map(|g| (
                    g.pos,
                    g.attitudes.political_satisfaction,
                    g.attitudes.ideology,
                    g.attitudes.institutional_trust,
                    g.social_range(),
                ))
                .collect();

            for blob in &mut self.blobs {
                let pos = blob.pos;
                let range = blob.social_range();
                let mut sat_shift = 0.0;
                let mut ideo_shift = 0.0;
                let mut trust_shift = 0.0;
                let mut weight_sum = 0.0;

                for (other_pos, other_sat, other_ideo, other_trust, _) in &snapshots {
                    let dist = (pos - other_pos).norm();
                    if dist > 0.1 && dist <= range {
                        let weight = 1.0 - (dist / range);

                        let ideo_diff = (other_ideo - blob.attitudes.ideology).abs();
                        if ideo_diff < ideo_threshold {
                            ideo_shift += (other_ideo - blob.attitudes.ideology) * weight;
                        } else {
                            ideo_shift -= 0.108 * (other_ideo - blob.attitudes.ideology).signum() * weight;
                        }

                        let sat_diff = (other_sat - blob.attitudes.political_satisfaction).abs();
                        if sat_diff < sat_trust_threshold {
                            sat_shift += (other_sat - blob.attitudes.political_satisfaction) * weight;
                        }

                        let trust_diff = (other_trust - blob.attitudes.institutional_trust).abs();
                        if trust_diff < sat_trust_threshold {
                            trust_shift += (other_trust - blob.attitudes.institutional_trust) * weight;
                        }

                        weight_sum += weight;
                    }
                }

                if weight_sum > 0.0 {
                    let susceptibility = 1.0 / (1.0 + blob.education_level as f64 * 0.25);
                    let auth_resistance = 1.0 + blob.latent_traits.obedience_value * 0.05;
                    let ideo_resistance = 1.0 / (auth_resistance + (blob.attitudes.ideology - 5.5).abs() * 0.3);
                    blob.attitudes.political_satisfaction += strength * susceptibility * sat_shift / weight_sum;
                    blob.attitudes.ideology += strength * susceptibility * ideo_resistance * ideo_shift / weight_sum;
                    blob.attitudes.institutional_trust += strength * susceptibility * trust_shift / weight_sum;
                    blob.attitudes.clamp();
                }
            }
        }
    }

    /// Apply social influence on latent traits via contact graph.
    /// Contacts pull each other's authoritarianism, efficacy, and social capital
    /// toward each other — creating emergent clustering within districts.
    fn apply_latent_trait_social_influence(&mut self) {
        let strength = 0.005; // reduced from 0.012 — anchoring now 0.008, so ratio is ~0.6:1 (preserves factor structure)

        if let Some(ref graph) = self.contact_graph {
            // Snapshot key latent traits
            let traits_snap: Vec<(f64, f64, f64, f64, f64, f64)> = self.blobs.iter()
                .map(|g| (
                    g.latent_traits.obedience_value,
                    g.latent_traits.rule_conformity,
                    g.latent_traits.strong_leader_preference,
                    g.latent_traits.self_efficacy,
                    g.latent_traits.powerlessness,
                    g.latent_traits.community_participation,
                ))
                .collect();

            for (i, blob) in self.blobs.iter_mut().enumerate() {
                let contacts = graph.get(i);
                if contacts.is_empty() { continue; }

                let mut obed_shift = 0.0;
                let mut rule_shift = 0.0;
                let mut leader_shift = 0.0;
                let mut efficacy_shift = 0.0;
                let mut power_shift = 0.0;
                let mut commun_shift = 0.0;
                let mut weight_sum = 0.0;

                for contact in contacts {
                    let (o_obed, o_rule, o_leader, o_eff, o_power, o_comm) = traits_snap[contact.other_idx];
                    let w = contact.contact_type.weight();

                    obed_shift += (o_obed - blob.latent_traits.obedience_value) * w;
                    rule_shift += (o_rule - blob.latent_traits.rule_conformity) * w;
                    leader_shift += (o_leader - blob.latent_traits.strong_leader_preference) * w;
                    efficacy_shift += (o_eff - blob.latent_traits.self_efficacy) * w;
                    power_shift += (o_power - blob.latent_traits.powerlessness) * w;
                    commun_shift += (o_comm - blob.latent_traits.community_participation) * w;
                    weight_sum += w;
                }

                if weight_sum > 0.0 {
                    let inv = strength / weight_sum;
                    // Education-dependent resistance to social pressure on traits
                    let resistance = 1.0 / (1.0 + blob.education_level as f64 * 0.2);
                    blob.latent_traits.obedience_value += inv * resistance * obed_shift;
                    blob.latent_traits.rule_conformity += inv * resistance * rule_shift;
                    blob.latent_traits.strong_leader_preference += inv * resistance * leader_shift;
                    blob.latent_traits.self_efficacy += inv * efficacy_shift; // efficacy less education-gated
                    blob.latent_traits.powerlessness += inv * resistance * power_shift;
                    blob.latent_traits.community_participation += inv * commun_shift;
                    blob.latent_traits.clamp();
                }
            }
        }
    }

    /// Compute economic vulnerability for a blob.
    /// High vulnerability = more affected by economic events.
    /// Based on district economic structure + individual socioeconomic position.
    fn economic_vulnerability(district: u8, education_level: u8, income: f64) -> f64 {
        // District vulnerability: economic structure determines baseline exposure
        let district_factor = match district {
            0 => 1.4,  // Grüntal: rural, subsidy-dependent
            1 => 0.3,  // Sonnenberg: academic, tenured, savings
            2 => 1.0,  // Hafenviertel: mixed economy
            3 => 0.7,  // Mittelfeld: suburban, stable
            4 => 2.0,  // Industriezone: factory-dependent, precarious
            _ => 1.0,
        };
        // Individual vulnerability: low education + low income = more exposed
        let edu_factor = 1.0 + (3.0 - education_level.min(3) as f64) * 0.15; // edu 0→1.45, edu 3→1.0
        let income_factor = 1.0 + (3000.0 - income).max(0.0) / 3000.0 * 0.3; // poor→1.22, rich→1.0
        district_factor * edu_factor * income_factor
    }

    /// Compute economic benefit for a blob (inverse of vulnerability).
    /// Knowledge economy workers benefit more from booms.
    fn economic_benefit(district: u8, education_level: u8, income: f64) -> f64 {
        let district_factor = match district {
            0 => 0.6,  // Grüntal: rural, limited benefit from tech booms
            1 => 1.8,  // Sonnenberg: knowledge economy, investment returns
            2 => 1.0,  // Hafenviertel: mixed
            3 => 1.2,  // Mittelfeld: suburban professionals
            4 => 0.4,  // Industriezone: manual labor, possibly displaced
            _ => 1.0,
        };
        let edu_factor = 0.6 + education_level.min(3) as f64 * 0.2; // edu 0→0.6, edu 3→1.2
        let income_factor = 0.8 + (income - 800.0) / 6200.0 * 0.4; // poor→0.8, rich→1.2
        district_factor * edu_factor * income_factor
    }

    /// Process a single event, modifying blob attitudes/income accordingly.
    /// Events now use ASYMMETRIC vulnerability: different districts and individuals
    /// are affected differently by the same event, breaking parallel trajectories.
    fn process_event(&mut self, event: &BlobtopiaEvent) -> String {
        let mut rng = self.rng.lock().unwrap();

        match event {
            BlobtopiaEvent::EconomicCrisis { severity, affected_districts } => {
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    let affected = affected_districts.is_empty()
                        || affected_districts.contains(&blob.district);
                    if affected {
                        let v = Self::economic_vulnerability(blob.district, blob.education_level, blob.income);
                        let sv = severity * v;
                        blob.income = (blob.income - sv * 1200.0).clamp(800.0, 7000.0);
                        blob.attitudes.political_satisfaction -= sv * 2.25;
                        blob.attitudes.institutional_trust -= sv * 1.5;
                        blob.base_satisfaction -= sv * 0.60;
                        blob.base_trust -= sv * 0.30;
                        // PRIMARY: Materialism construct (economic crisis = economic insecurity)
                        blob.latent_traits.economic_security_priority += sv * 1.2;
                        // SECONDARY: tiny cross-effects (factor 0.1x of primary)
                        blob.latent_traits.self_efficacy -= sv * 0.15;
                        blob.latent_traits.powerlessness += sv * 0.15;
                        blob.latent_traits.strong_leader_preference += sv * 0.15;
                        blob.latent_traits.community_participation -= sv * 0.3;
                        // Populismus: economic crisis fuels anti-elite sentiment
                        blob.latent_traits.anti_elitism += sv * 0.8;
                        blob.latent_traits.people_centrism += sv * 0.4;
                        blob.latent_traits.media_trust -= sv * 0.3;
                        // Policy shift: crisis → more pro-state, more security
                        blob.attitudes.policy_economy -= sv * 0.5;
                        blob.attitudes.policy_security += sv * 0.3;
                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                        blob.base_latent_traits.clamp();
                    }
                }
                format!("Wirtschaftskrise (Schwere: {:.0}%)", severity * 100.0)
            }
            BlobtopiaEvent::Election => {
                "Wahl ausgerufen".to_string()
            }
            BlobtopiaEvent::Scandal { target_party, magnitude } => {
                // Scandal effects now scale with political sophistication:
                // Low-knowledge → "they're ALL corrupt" (broad cynicism)
                // High-knowledge → targeted trust loss in specific party
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    let is_member = blob.political_state.party_affiliation == Some(*target_party);
                    let knowledge_factor = blob.latent_traits.political_knowledge / 10.0; // 0-1

                    if is_member {
                        // Party members: betrayal → PRIMARY: Alienation construct
                        blob.attitudes.institutional_trust -= magnitude * 3.5;
                        blob.attitudes.political_satisfaction -= magnitude * 2.5;
                        blob.base_trust -= magnitude * 1.0;
                        blob.latent_traits.party_indifference += magnitude * 2.0;
                        blob.latent_traits.powerlessness += magnitude * 1.5;
                        blob.latent_traits.political_complexity += magnitude * 0.8;
                        blob.latent_traits.self_efficacy -= magnitude * 0.15;
                        // Populismus: scandal boosts anti-elitism strongly for members
                        blob.latent_traits.anti_elitism += magnitude * 1.5;
                        blob.latent_traits.people_centrism += magnitude * 0.8;
                        blob.latent_traits.manichean_outlook += magnitude * 0.5;
                        blob.latent_traits.media_trust -= magnitude * 0.5;
                        blob.latent_traits.external_efficacy -= magnitude * 1.0;
                        // Policy: scandal → more direct democracy wanted
                        blob.attitudes.policy_democracy -= magnitude * 0.8;
                    } else {
                        // Non-members: PRIMARY: Alienation only
                        let spillover = (1.0 - knowledge_factor) * 0.6;
                        blob.attitudes.institutional_trust -= magnitude * spillover;
                        blob.base_trust -= magnitude * spillover * 0.3;
                        blob.latent_traits.party_indifference += magnitude * spillover;
                        blob.latent_traits.political_complexity += magnitude * spillover * 0.5;
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                }
                let party_names = ["Fortschritt", "Mitte", "Tradition", "Unabhängige"];
                let name = party_names.get(*target_party as usize).unwrap_or(&"?");
                format!("Skandal bei {} (Stärke: {:.0}%)", name, magnitude * 100.0)
            }
            BlobtopiaEvent::NaturalDisaster { affected_district, severity } => {
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    if blob.district == *affected_district {
                        let v = Self::economic_vulnerability(blob.district, blob.education_level, blob.income);
                        let sv = severity * v;
                        blob.income = (blob.income - sv * 900.0).clamp(800.0, 7000.0);
                        blob.attitudes.political_satisfaction -= sv * 3.0;
                        blob.attitudes.institutional_trust -= sv * 1.0;
                        blob.base_satisfaction -= sv * 0.80;
                        blob.base_trust -= sv * 0.30;
                        // PRIMARY: SocialCapital construct (disaster solidarity)
                        blob.latent_traits.neighbor_trust += severity * 1.2;
                        blob.latent_traits.community_participation += severity * 1.0;
                        blob.latent_traits.economic_security_priority += sv * 0.15;
                        blob.latent_traits.powerlessness += sv * 0.3;
                        // Disaster → pro-environment, more solidarity
                        blob.attitudes.policy_environment -= sv * 0.6;
                        blob.attitudes.policy_social -= sv * 0.4;
                        blob.latent_traits.generalized_trust += severity * 0.3;
                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                    }
                }
                let name = self.layout.district_name(*affected_district);
                format!("Naturkatastrophe in {} (Schwere: {:.0}%)", name, severity * 100.0)
            }
            BlobtopiaEvent::PolicyChange { name, ideology_shift } => {
                // Social reform as REDISTRIBUTION — benefits poor, costs rich
                // This creates divergent responses: some districts gain, others lose
                let is_progressive = *ideology_shift < 0.0; // negative shift = leftward = progressive
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    // Ideology shift scaled by education resistance
                    let resistance = 1.0 / (1.0 + blob.education_level as f64 * 0.3);
                    let personal_shift = ideology_shift * resistance;
                    blob.attitudes.ideology += personal_shift;
                    blob.base_ideology += personal_shift * 0.25;

                    // REDISTRIBUTION EFFECT: progressive reform helps poor, costs rich
                    if is_progressive {
                        let income_norm = blob.income_normalized(); // 1-10
                        if income_norm < 4.0 {
                            // Low income: beneficiary — income boost, satisfaction boost, trust boost
                            let benefit = (4.0 - income_norm) * 0.25;
                            blob.income = (blob.income + benefit * 400.0).clamp(800.0, 7000.0);
                            blob.attitudes.political_satisfaction += benefit * 1.5;
                            blob.attitudes.institutional_trust += benefit * 1.0;
                            blob.base_satisfaction += benefit * 0.3;
                            blob.base_trust += benefit * 0.2;
                            blob.latent_traits.self_efficacy += benefit * 0.5;
                            blob.latent_traits.powerlessness -= benefit * 0.4;
                            blob.latent_traits.party_indifference -= benefit * 0.6;
                            blob.latent_traits.vote_importance += benefit * 0.4;
                            blob.base_latent_traits.self_efficacy += benefit * 0.07;
                        } else if income_norm > 7.0 {
                            // High income: payer — slight income reduction, mixed feelings
                            let cost = (income_norm - 7.0) * 0.15;
                            blob.income = (blob.income - cost * 300.0).clamp(800.0, 7000.0);
                            // Ideologically aligned rich: accept the cost
                            if blob.attitudes.ideology < 4.6 {
                                blob.attitudes.political_satisfaction += 0.3; // "the right thing to do"
                            } else {
                                blob.attitudes.political_satisfaction -= cost * 1.0;
                            }
                        }
                    } else {
                        // Conservative reform: benefits established, costs marginalized (reverse)
                        let aligned = blob.attitudes.ideology > 5.5;
                        blob.attitudes.political_satisfaction += if aligned { 0.5 } else { -0.5 };
                    }

                    // Everyone becomes more politically aware
                    blob.latent_traits.political_knowledge += 0.3;
                    blob.latent_traits.party_indifference -= 0.2;
                    blob.latent_traits.vote_importance += 0.3;
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                    blob.base_latent_traits.clamp();
                }
                format!("Politische Reform: {}", name)
            }
            BlobtopiaEvent::MediaCampaign { party, reach } => {
                for blob in self.blobs.iter_mut() {
                    // Reach varies by district AND socioeconomic position
                    // Progressive campaigns (party=0, Fortschritt) specifically target
                    // disadvantaged communities with "we hear you" messaging
                    let is_progressive = *party == 0;
                    let district_media_factor = if is_progressive {
                        // Fortschritt targets struggling districts harder
                        match blob.district {
                            0 => 1.2,  // Grüntal: rural outreach
                            1 => 0.8,  // Sonnenberg: already aligned, less effort
                            2 => 1.3,  // Hafenviertel: diverse, receptive
                            3 => 1.0,  // Mittelfeld: swing voters
                            4 => 1.5,  // Industriezone: PRIMARY target, "we hear you"
                            _ => 1.0,
                        }
                    } else {
                        match blob.district {
                            0 => 1.3, 1 => 0.7, 2 => 0.9, 3 => 1.1, 4 => 0.8, _ => 1.0,
                        }
                    };
                    let effective_reach = reach * district_media_factor;
                    if rng.gen::<f64>() < effective_reach {
                        let target_ideo: f64 = match party {
                            0 => 2.8, 1 => 5.5, 2 => 8.2, _ => 5.5,
                        };
                        let susceptibility = 1.0 / (1.0 + blob.education_level as f64 * 0.25);
                        blob.attitudes.ideology += (target_ideo - blob.attitudes.ideology) * 0.1 * susceptibility;
                        blob.base_ideology += (target_ideo - blob.base_ideology) * 0.03 * susceptibility;
                        blob.latent_traits.political_knowledge += 0.3;
                        blob.latent_traits.party_indifference -= 0.5;

                        // "We are being heard" effect: progressive campaign in disadvantaged districts
                        // creates genuine political activation — especially post-CivicSuccess
                        if is_progressive && blob.income < 3000.0 {
                            blob.latent_traits.self_efficacy += 0.4;
                            blob.latent_traits.powerlessness -= 0.3;
                            blob.latent_traits.vote_importance += 0.5;
                            blob.latent_traits.party_indifference -= 0.8; // "there IS a party for us"
                            blob.base_latent_traits.self_efficacy += 0.10;
                            blob.base_latent_traits.vote_importance += 0.10;
                            blob.attitudes.political_satisfaction += 0.3;
                            blob.attitudes.institutional_trust += 0.3;
                        }

                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                        blob.base_latent_traits.clamp();
                    }
                }
                let party_names = ["Fortschritt", "Mitte", "Tradition", "Unabhängige"];
                let name = party_names.get(*party as usize).unwrap_or(&"?");
                format!("Medienkampagne für {} (Reichweite: {:.0}%)", name, reach * 100.0)
            }
            BlobtopiaEvent::EducationReform { target_district } => {
                // Education reform is a MAJOR structural intervention — affects 50% of eligible,
                // with significant downstream effects on income, efficacy, and alienation.
                // This should be one of the most visible positive events in the timeline.
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    if blob.district == *target_district && blob.education_level < 3 {
                        if rng.gen::<f64>() < 0.70 { // 70% participation (raised from 50%)
                            blob.education_level += 1;
                            blob.income = (blob.income + 500.0).clamp(800.0, 7000.0);
                            // Strong trait effects — education is transformative
                            blob.latent_traits.political_knowledge += 1.5;
                            blob.latent_traits.self_efficacy += 1.0;
                            blob.latent_traits.powerlessness -= 1.0;
                            blob.latent_traits.political_complexity -= 0.8;
                            blob.latent_traits.party_indifference -= 0.5;
                            blob.latent_traits.vote_importance += 0.5;
                            // Permanent base shifts ONLY for Efficacy construct
                            // (powerlessness moved to transient — preserves CFA discriminant validity)
                            blob.base_latent_traits.political_knowledge += 0.8;
                            blob.base_latent_traits.self_efficacy += 0.40;
                            blob.base_satisfaction += 0.3;
                            // Lower need for cognitive closure (education opens minds)
                            blob.need_for_closure = (blob.need_for_closure - 0.5).max(0.0);
                            blob.latent_traits.clamp();
                            blob.base_latent_traits.clamp();
                        }
                    }
                    // Even non-participants benefit from better-educated neighbors
                    if blob.district == *target_district {
                        blob.latent_traits.political_knowledge += 0.2;
                        blob.base_satisfaction += 0.05;
                        blob.latent_traits.clamp();
                    }
                }
                let name = self.layout.district_name(*target_district);
                format!("Bildungsreform in {}", name)
            }
            BlobtopiaEvent::EconomicBoom { magnitude, affected_districts } => {
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    let affected = affected_districts.is_empty()
                        || affected_districts.contains(&blob.district);
                    if affected {
                        let b = Self::economic_benefit(blob.district, blob.education_level, blob.income);
                        let mb = magnitude * b;
                        // Everyone benefits from a boom — but unevenly
                        // Low-benefit districts get less, but still SOME positive effect
                        let income_change = mb.max(magnitude * 0.15) * 800.0; // minimum 15% of magnitude
                        blob.income = (blob.income + income_change).clamp(800.0, 7000.0);
                        blob.attitudes.political_satisfaction += mb.max(magnitude * 0.1) * 1.0;
                        blob.attitudes.institutional_trust += mb * 0.5;
                        blob.base_satisfaction += mb.max(magnitude * 0.05) * 0.30;
                        blob.base_trust += mb * 0.15;
                        blob.latent_traits.self_efficacy += mb * 0.8;
                        blob.latent_traits.powerlessness -= mb * 0.6;
                        blob.latent_traits.economic_security_priority -= mb * 0.6;
                        // But the RELATIVE gap widens — low-benefit districts see others prosper
                        // This feeds relative deprivation, not absolute loss
                        if b < 0.6 {
                            blob.latent_traits.party_indifference += magnitude * 0.1; // "others prosper, not us"
                        }
                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                        blob.base_latent_traits.clamp();
                    }
                }
                format!("Wirtschaftsaufschwung (Stärke: {:.0}%)", magnitude * 100.0)
            }
            BlobtopiaEvent::CivicSuccess { affected_district, magnitude } => {
                // Civic success is TRANSFORMATIVE — it proves "we CAN make a difference"
                // Larger base shifts make the effect persistent, not absorbed
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    if blob.district == *affected_district {
                        blob.attitudes.institutional_trust += magnitude * 2.0;
                        blob.attitudes.political_satisfaction += magnitude * 1.0;
                        blob.base_trust += magnitude * 0.60;
                        blob.base_satisfaction += magnitude * 0.30;
                        blob.latent_traits.self_efficacy += magnitude * 2.0;
                        blob.latent_traits.vote_importance += magnitude * 1.2;
                        blob.latent_traits.powerlessness -= magnitude * 1.5;
                        blob.latent_traits.party_indifference -= magnitude * 1.0;
                        blob.latent_traits.community_participation += magnitude * 1.2;
                        // Permanent base shifts ONLY for Efficacy construct
                        // Alienation/SocCap effects stay transient (personality anchoring recovers them)
                        blob.base_latent_traits.self_efficacy += magnitude * 0.4;
                        blob.base_latent_traits.vote_importance += magnitude * 0.25;
                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                        blob.base_latent_traits.clamp();
                    }
                }
                let name = self.layout.district_name(*affected_district);
                format!("Erfolgreiche Bürgerbeteiligung in {} (Stärke: {:.0}%)", name, magnitude * 100.0)
            }
            BlobtopiaEvent::CulturalEvent { affected_district, magnitude } => {
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    if blob.district == *affected_district {
                        blob.attitudes.political_satisfaction += magnitude * 1.0;
                        blob.base_satisfaction += magnitude * 0.30;
                        blob.latent_traits.neighbor_trust += magnitude * 1.2;
                        blob.latent_traits.community_participation += magnitude * 1.5;
                        blob.latent_traits.party_indifference -= magnitude * 0.5;
                        blob.base_latent_traits.neighbor_trust += magnitude * 0.4;
                        blob.base_latent_traits.community_participation += magnitude * 0.25;
                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                        blob.base_latent_traits.clamp();
                    }
                }
                let name = self.layout.district_name(*affected_district);
                format!("Kulturereignis in {} (Stärke: {:.0}%)", name, magnitude * 100.0)
            }
            BlobtopiaEvent::IssueDebate { topic, dimension, intensity } => {
                // Controversial debate polarizes society: people on opposite sides
                // move FURTHER apart. The center is forced to pick a side.
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    let ideo = blob.attitudes.ideology;

                    match dimension.as_str() {
                        "climate" => {
                            // Progressives (ideo < 4.6): confirmation, shift further left
                            // Conservatives (ideo > 6.4): economic threat, shift further right
                            // Center: forced to pick a side (random)
                            let centered = ideo - 5.5;
                            let shift = if centered < -0.9 {
                                -intensity * 0.36 * (1.0 + (-centered) * 0.111)
                            } else if centered > 0.9 {
                                intensity * 0.27 * (1.0 + centered * 0.111)
                            } else {
                                if rng.gen::<f64>() < 0.5 { -intensity * 0.18 } else { intensity * 0.18 }
                            };
                            blob.attitudes.ideology += shift;
                            blob.base_ideology += shift * 0.15;
                            blob.attitudes.political_satisfaction -= intensity * 0.3;
                            blob.latent_traits.party_indifference -= intensity * 0.6;
                            blob.latent_traits.vote_importance += intensity * 0.4;
                            blob.latent_traits.political_knowledge += intensity * 0.2;
                        }
                        "security" => {
                            // Authoritarian personalities: strengthens strong-leader preference
                            // Libertarian: resistance against security rhetoric
                            let auth = blob.latent_traits.obedience_value;
                            if auth > 5.0 {
                                blob.latent_traits.strong_leader_preference += intensity * 0.5;
                                blob.attitudes.ideology += intensity * 0.27;
                                blob.base_ideology += intensity * 0.072;
                            } else {
                                blob.latent_traits.freedom_over_order += intensity * 0.3;
                                blob.attitudes.ideology -= intensity * 0.18;
                            }
                            blob.latent_traits.party_indifference -= intensity * 0.5;
                        }
                        "inequality" => {
                            // Poor vs rich: splits along income line
                            let income_norm = blob.income / 7000.0 * 10.0;
                            if income_norm < 4.0 {
                                // Low income: anger
                                blob.attitudes.political_satisfaction -= intensity * 1.0;
                                blob.attitudes.institutional_trust -= intensity * 0.8;
                                blob.latent_traits.powerlessness += intensity * 0.5;
                                // Low education: right-populist channel; high education: progressive
                                if blob.education_level <= 1 {
                                    blob.attitudes.ideology += intensity * 0.27;
                                } else {
                                    blob.attitudes.ideology -= intensity * 0.27;
                                }
                            } else if income_norm > 7.0 {
                                // High income: defensive, slight rightward shift
                                blob.attitudes.ideology += intensity * 0.135;
                                blob.attitudes.political_satisfaction -= intensity * 0.3;
                            }
                            blob.latent_traits.party_indifference -= intensity * 0.7;
                            blob.latent_traits.vote_importance += intensity * 0.5;
                        }
                        _ => {}
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                    blob.base_latent_traits.clamp();
                }
                format!("Grundsatzdebatte: {} (Intensität: {:.0}%)", topic, intensity * 100.0)
            }
            BlobtopiaEvent::InequalityReport { magnitude } => {
                // Computes actual district income averages, then triggers relative deprivation
                let mut d_income = [0.0f64; 5];
                let mut d_count = [0u32; 5];
                for g in self.blobs.iter() {
                    let d = g.district as usize;
                    if d < 5 && !g.is_child() {
                        d_income[d] += g.income;
                        d_count[d] += 1;
                    }
                }
                let d_avg: Vec<f64> = (0..5).map(|d| {
                    if d_count[d] > 0 { d_income[d] / d_count[d] as f64 } else { 3000.0 }
                }).collect();
                let global_avg: f64 = d_avg.iter().sum::<f64>() / 5.0;

                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    let my_avg = d_avg[blob.district as usize];
                    let relative_position = (my_avg - global_avg) / global_avg;

                    if relative_position < -0.2 {
                        // Disadvantaged district: anger about inequality
                        let anger = magnitude * relative_position.abs() * 2.0;
                        blob.attitudes.political_satisfaction -= anger * 1.5;
                        blob.attitudes.institutional_trust -= anger * 1.0;
                        blob.latent_traits.powerlessness += anger * 0.8;
                        blob.latent_traits.party_indifference -= anger * 0.5;
                        blob.latent_traits.vote_importance += anger * 0.6;
                        blob.base_satisfaction -= anger * 0.3;
                        blob.base_trust -= anger * 0.2;
                    } else if relative_position > 0.2 {
                        // Privileged district: guilt or defensiveness
                        if blob.attitudes.ideology < 5.5 {
                            blob.attitudes.ideology -= magnitude * 0.18; // progressive guilt
                        } else {
                            blob.attitudes.ideology += magnitude * 0.135; // "we earned it"
                        }
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                }
                format!("Ungleichheitsbericht (Stärke: {:.0}%)", magnitude * 100.0)
            }
            BlobtopiaEvent::CrossDistrictConflict { district_a, district_b, intensity } => {
                // Two districts clash: each radicalizes away from the other
                let mut ideo_a = 0.0f64;
                let mut ideo_b = 0.0f64;
                let mut count_a = 0u32;
                let mut count_b = 0u32;
                for g in self.blobs.iter() {
                    if g.district == *district_a { ideo_a += g.attitudes.ideology; count_a += 1; }
                    if g.district == *district_b { ideo_b += g.attitudes.ideology; count_b += 1; }
                }
                let mean_a = if count_a > 0 { ideo_a / count_a as f64 } else { 5.5 };
                let mean_b = if count_b > 0 { ideo_b / count_b as f64 } else { 5.5 };

                for blob in &mut self.blobs {
                    if blob.district == *district_a {
                        let direction = (mean_a - mean_b).signum();
                        blob.attitudes.ideology += intensity * direction * 0.27;
                        blob.base_ideology += intensity * direction * 0.072;
                        blob.attitudes.political_satisfaction -= intensity * 0.5;
                        blob.latent_traits.party_indifference -= intensity * 0.8;
                        blob.latent_traits.vote_importance += intensity * 0.5;
                    } else if blob.district == *district_b {
                        let direction = (mean_b - mean_a).signum();
                        blob.attitudes.ideology += intensity * direction * 0.27;
                        blob.base_ideology += intensity * direction * 0.072;
                        blob.attitudes.political_satisfaction -= intensity * 0.5;
                        blob.latent_traits.party_indifference -= intensity * 0.8;
                        blob.latent_traits.vote_importance += intensity * 0.5;
                    } else {
                        // Other districts: uncertainty, forced to position
                        blob.attitudes.political_satisfaction -= intensity * 0.2;
                        blob.latent_traits.political_complexity += intensity * 0.3;
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                }
                let name_a = self.layout.district_name(*district_a);
                let name_b = self.layout.district_name(*district_b);
                format!("Wertekonflikt {} vs {} (Intensität: {:.0}%)", name_a, name_b, intensity * 100.0)
            }
            BlobtopiaEvent::CorruptionRevelation { severity } => {
                // Global trust collapse — scaled with existing trust (disappointed expectations)
                for blob in &mut self.blobs {
                    if blob.is_child() { continue; }
                    let trust_loss = severity * (blob.attitudes.institutional_trust / 10.0) * 2.5;
                    blob.attitudes.institutional_trust -= trust_loss;
                    blob.base_trust -= trust_loss * 0.25;
                    blob.attitudes.political_satisfaction -= severity * 1.2;
                    blob.base_satisfaction -= severity * 0.2;
                    blob.latent_traits.powerlessness += severity * 1.0;
                    blob.latent_traits.party_indifference += severity * 0.8;
                    // Low-trust people feel VALIDATED: "I told you so"
                    if blob.attitudes.institutional_trust < 3.0 {
                        blob.latent_traits.party_indifference += severity * 0.5;
                        blob.latent_traits.strong_leader_preference += severity * 0.4;
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                    blob.base_latent_traits.clamp();
                }
                format!("Korruptionsenthüllung (Schwere: {:.0}%)", severity * 100.0)
            }
        }
    }

    /// Ideology realignment: economic conditions and cultural context shift ideology.
    /// This is the "Left Behind" phenomenon (Inglehart & Norris 2019):
    /// - Economic decline + high alienation → rightward shift (populist)
    /// - Economic prosperity + high education → leftward shift (progressive)
    /// - High authoritarianism + low trust → rightward shift (law & order)
    /// - High postmaterialism + efficacy → leftward shift (values)
    ///
    /// This is the KEY mechanism that makes L-R ideology dynamic instead of static.
    fn apply_ideology_realignment(&mut self) {
        let mut rng = self.rng.lock().unwrap();

        for blob in self.blobs.iter_mut() {
            if blob.is_child() { continue; }
            // Only some blobs reassess ideology each week (not everyone rethinks politics weekly)
            if rng.gen::<f64>() > 0.15 { continue; }

            let sat = blob.attitudes.political_satisfaction;
            let trust = blob.attitudes.institutional_trust;
            let auth = (blob.latent_traits.obedience_value
                + blob.latent_traits.strong_leader_preference) / 2.0;
            let alienation = (blob.latent_traits.powerlessness
                + blob.latent_traits.party_indifference) / 2.0;
            let efficacy = blob.latent_traits.self_efficacy;
            let postmat = (blob.latent_traits.environment_over_economy
                + blob.latent_traits.freedom_over_order) / 2.0;

            let mut ideo_shift = 0.0;

            // ── "Left Behind" realignment (working class → right-populist) ──
            // Low satisfaction + high alienation + low education → rightward drift
            // This is the AfD/Trump/Brexit dynamic
            if sat < 3.0 && alienation > 5.0 && blob.education_level <= 1 {
                let intensity = (3.0 - sat) * 0.01 + (alienation - 5.0) * 0.005;
                ideo_shift += intensity; // rightward
            }

            // ── Authoritarian crystallization → rightward ──
            // High auth + low trust → seeks strong leader, drifts right
            if auth > 6.0 && trust < 3.0 {
                ideo_shift += (auth - 6.0) * 0.005;
            }

            // ── Progressive deepening → leftward ──
            // High education + high postmaterialism + high efficacy → progressive shift
            if blob.education_level >= 2 && postmat > 6.0 && efficacy > 6.0 {
                let intensity = (postmat - 6.0) * 0.005 + (efficacy - 6.0) * 0.003;
                ideo_shift -= intensity; // leftward
            }

            // ── Economic prosperity → status quo ←→ progressive values ──
            // High income + high satisfaction → slight leftward (post-materialist values)
            if blob.income > 4000.0 && sat > 7.0 {
                ideo_shift -= 0.005;
            }

            // ── Economic anxiety → rightward (scarcity → materialism → conservatism) ──
            if blob.income < 1500.0 && blob.latent_traits.economic_security_priority > 7.0 {
                ideo_shift += 0.008;
            }

            // Apply with some noise for individual variation
            ideo_shift += rng.gen_range(-0.003..0.003);
            ideo_shift *= 0.9; // scale for 1-10 ideology range

            blob.attitudes.ideology += ideo_shift;
            blob.base_ideology += ideo_shift * 0.4; // 40% permanent shift (base moves too!)
            blob.attitudes.clamp();
            blob.base_ideology = blob.base_ideology.clamp(0.1, 10.9);
        }
    }

    /// Media environment: each blob consumes district- and education-specific media,
    /// creating different information realities (Agenda Setting: McCombs & Shaw 1972,
    /// Filter Bubble: Pariser 2011, Knowledge Gap: Tichenor et al. 1970).
    ///
    /// The same event is interpreted differently depending on media diet:
    /// Quality journalism → nuance, sophistication
    /// Tabloid/social media → simplification, populist framing
    /// Community media → local solidarity, participation
    fn apply_media_environment(&mut self) {
        let mut rng = self.rng.lock().unwrap();

        for blob in self.blobs.iter_mut() {
            if blob.is_child() { continue; }

            // Weekly media consumption probability (most people consume media)
            if rng.gen::<f64>() > 0.70 { continue; } // 70% consume media any given week

            let edu = blob.education_level.min(3) as f64;

            // Media type determined by education + district + ideology (3× boosted)
            match blob.district {
                0 => {
                    // Grüntal: local newspaper, church bulletin, regional TV
                    blob.latent_traits.obedience_value += 0.015;
                    blob.latent_traits.rule_conformity += 0.010;
                    blob.latent_traits.political_complexity += 0.005;
                    blob.latent_traits.neighbor_trust += 0.008;
                    if edu < 1.5 {
                        blob.latent_traits.strong_leader_preference += 0.012;
                        blob.latent_traits.party_indifference += 0.006;
                    }
                }
                1 => {
                    // Sonnenberg: quality newspapers, podcasts, academic journals
                    blob.latent_traits.political_knowledge += 0.020;
                    blob.latent_traits.political_complexity -= 0.012;
                    blob.latent_traits.freedom_over_order += 0.010;
                    blob.latent_traits.obedience_value -= 0.010;
                    blob.latent_traits.party_indifference -= 0.006;
                    blob.latent_traits.vote_importance += 0.006;
                }
                2 => {
                    // Hafenviertel: community blogs, multicultural media
                    blob.latent_traits.community_participation += 0.012;
                    blob.latent_traits.neighbor_trust += 0.008;
                    blob.latent_traits.freedom_over_order += 0.008;
                    if edu >= 2.0 {
                        blob.latent_traits.political_knowledge += 0.008;
                    }
                }
                3 => {
                    // Mittelfeld: mainstream TV, centrist framing
                    blob.latent_traits.political_complexity -= 0.005;
                    blob.latent_traits.political_knowledge += 0.005;
                    if blob.attitudes.political_satisfaction > 5.0 {
                        blob.latent_traits.party_indifference += 0.006;
                        blob.latent_traits.vote_importance -= 0.003;
                    }
                }
                4 => {
                    // Industriezone: tabloid press, social media, YouTube
                    blob.latent_traits.political_complexity += 0.012;
                    blob.latent_traits.party_indifference += 0.012;
                    blob.latent_traits.strong_leader_preference += 0.015;
                    blob.latent_traits.powerlessness += 0.008;
                    if blob.attitudes.institutional_trust < 3.0 {
                        blob.latent_traits.party_indifference += 0.008;
                        blob.base_latent_traits.party_indifference += 0.003;
                    }
                    if blob.latent_traits.self_efficacy > 4.0 {
                        blob.latent_traits.vote_importance += 0.005;
                    }
                }
                _ => {}
            }

            blob.latent_traits.clamp();
            blob.base_latent_traits.clamp();
        }
    }

    /// Individual agency: each blob makes weekly micro-decisions based on their
    /// personality constellation. The same external conditions produce DIFFERENT
    /// responses from different individuals — creating emergent within-district
    /// variance and between-district divergence.
    ///
    /// Theoretical basis:
    /// - Engagement: Verba/Schlozman/Brady (1995) Civic Voluntarism Model
    /// - Withdrawal: Norris (2011) Democratic Deficit
    /// - Radicalization: Moghaddam (2005) Staircase to Terrorism
    /// - Community: Putnam (2000) Bowling Alone
    fn apply_individual_agency(&mut self) {
        let mut rng = self.rng.lock().unwrap();

        for blob in self.blobs.iter_mut() {
            if blob.is_child() { continue; }

            // Agency probability: high-efficacy people are more likely to ACT on their state
            // Low-efficacy people are more likely to passively drift
            let agency_prob = 0.02 + blob.latent_traits.self_efficacy * 0.004;
            if rng.gen::<f64>() > agency_prob { continue; }

            let sat = blob.attitudes.political_satisfaction;
            let trust = blob.attitudes.institutional_trust;
            let efficacy = blob.latent_traits.self_efficacy;
            let alienation = (blob.latent_traits.powerlessness
                + blob.latent_traits.party_indifference) / 2.0;
            let auth = (blob.latent_traits.obedience_value
                + blob.latent_traits.strong_leader_preference) / 2.0;
            let social = (blob.latent_traits.community_participation
                + blob.latent_traits.neighbor_trust) / 2.0;

            // ── Decision tree: same situation → different response ──

            if efficacy > 6.0 && sat < 4.0 && trust > 3.0 {
                // POLITICAL ENGAGEMENT: "I can make a difference and things need to change"
                // High-efficacy dissatisfied citizens who still trust institutions → activism
                blob.latent_traits.self_efficacy += 0.15;
                blob.latent_traits.political_knowledge += 0.10;
                blob.latent_traits.vote_importance += 0.10;
                blob.latent_traits.community_participation += 0.10;
                blob.latent_traits.powerlessness -= 0.10;
                blob.latent_traits.party_indifference -= 0.15;
                blob.base_latent_traits.self_efficacy += 0.05;
                blob.base_latent_traits.vote_importance += 0.05;
            } else if alienation > 6.0 && trust < 2.0 {
                // SOCIAL WITHDRAWAL: "Nothing matters, why bother"
                // Alienated, distrusting → retreat from public life, isolation spiral
                blob.latent_traits.community_participation -= 0.20;
                blob.latent_traits.neighbor_trust -= 0.10;
                blob.latent_traits.powerlessness += 0.10;
                blob.latent_traits.party_indifference += 0.10;
                blob.latent_traits.vote_importance -= 0.15;
                blob.base_latent_traits.community_participation -= 0.08;
                blob.base_latent_traits.powerlessness += 0.05;
            } else if auth > 6.0 && alienation > 5.0 && sat < 3.0 {
                // AUTHORITARIAN RADICALIZATION: "We need a strong hand to fix this"
                // High-auth + alienated + dissatisfied → seeks populist answers
                blob.latent_traits.strong_leader_preference += 0.15;
                blob.latent_traits.obedience_value += 0.10;
                blob.latent_traits.rule_conformity += 0.05;
                blob.latent_traits.party_indifference += 0.05;
                blob.latent_traits.freedom_over_order -= 0.10;
                blob.base_latent_traits.strong_leader_preference += 0.06;
                blob.base_latent_traits.obedience_value += 0.04;
                blob.attitudes.ideology += 0.045;
                blob.base_ideology += 0.018;
            } else if social > 6.0 && trust > 5.0 {
                // COMMUNITY BUILDING: "Let's make our neighborhood better"
                // High social capital + trust → invests in local community
                blob.latent_traits.community_participation += 0.20;
                blob.latent_traits.neighbor_trust += 0.15;
                blob.latent_traits.self_efficacy += 0.10;
                blob.latent_traits.powerlessness -= 0.08;
                blob.base_latent_traits.community_participation += 0.08;
                blob.base_latent_traits.neighbor_trust += 0.05;
                blob.base_satisfaction += 0.03;
            } else if efficacy > 5.0 && sat > 6.0 && blob.education_level >= 2 {
                // INTELLECTUAL ENGAGEMENT: "I want to understand and contribute"
                // Educated, satisfied, efficacious → deepens political sophistication
                blob.latent_traits.political_knowledge += 0.15;
                blob.latent_traits.political_complexity -= 0.10;
                blob.latent_traits.self_efficacy += 0.05;
                blob.latent_traits.freedom_over_order += 0.05;
                blob.latent_traits.obedience_value -= 0.05;
                blob.base_latent_traits.political_knowledge += 0.05;
            } else if sat < 2.0 && efficacy < 3.0 && auth < 4.0 {
                // PASSIVE RESIGNATION: "Life is what it is"
                // Low everything, no auth tendencies → apathetic disengagement
                blob.latent_traits.political_complexity += 0.10;
                blob.latent_traits.party_indifference += 0.15;
                blob.latent_traits.vote_importance -= 0.10;
                blob.latent_traits.community_participation -= 0.10;
                blob.base_latent_traits.party_indifference += 0.05;
            }

            blob.latent_traits.clamp();
            blob.base_latent_traits.clamp();
            blob.attitudes.clamp();
        }
    }

    /// Economic feedback loops: district economies develop independently
    /// based on human capital, creating Myrdal's cumulative causation (1957).
    /// High-education districts attract investment → income rises → more education funding.
    /// Low-education districts lose industry → income drops → brain drain → more decline.
    /// Called annually (every 365 ticks) to create visible structural change.
    fn apply_economic_feedback(&mut self) {
        // Compute district-level economic indicators
        let mut d_mean_edu = [0.0f64; 5];
        let mut d_mean_income = [0.0f64; 5];
        let mut d_count = [0u32; 5];
        for blob in &self.blobs {
            let d = blob.district as usize;
            if d >= 5 || blob.is_child() { continue; }
            d_mean_edu[d] += blob.education_level as f64;
            d_mean_income[d] += blob.income;
            d_count[d] += 1;
        }
        for d in 0..5 {
            if d_count[d] > 0 {
                d_mean_edu[d] /= d_count[d] as f64;
                d_mean_income[d] /= d_count[d] as f64;
            }
        }

        // District economic trajectories (annual growth/decline rates)
        // Based on: education level → innovation capacity → economic growth
        // Myrdal: initial advantages compound, initial disadvantages deepen
        let growth_rates: [f64; 5] = [
            // Grüntal: low edu (0.8 avg) → stagnation, slight decline
            -0.005 + d_mean_edu[0] * 0.002, // edu 0.8 → -0.3%/year
            // Sonnenberg: high edu (2.5 avg) → knowledge economy growth
            0.005 + d_mean_edu[1] * 0.004,  // edu 2.5 → +1.5%/year
            // Hafenviertel: mixed (1.5 avg) → gentrification-driven change
            0.0 + d_mean_edu[2] * 0.003,    // edu 1.5 → +0.45%/year
            // Mittelfeld: medium edu (2.0 avg) → moderate growth
            0.002 + d_mean_edu[3] * 0.003,  // edu 2.0 → +0.8%/year
            // Industriezone: very low edu (0.4 avg) → deindustrialization
            -0.010 + d_mean_edu[4] * 0.002, // edu 0.4 → -0.92%/year
        ];

        let mut rng = self.rng.lock().unwrap();
        for blob in self.blobs.iter_mut() {
            if blob.is_child() { continue; }
            let d = blob.district as usize;
            if d >= 5 { continue; }

            let rate = growth_rates[d];

            // Individual income change: district rate + personal variance
            let personal_variance = rng.gen_range(-0.005..0.005);
            let edu_bonus = blob.education_level as f64 * 0.002; // educated individuals benefit more
            let income_change = blob.income * (rate + personal_variance + edu_bonus);
            blob.income = (blob.income + income_change).clamp(800.0, 7000.0);

            // Psychological effects of economic trajectory
            if rate < -0.003 {
                // Declining economy: creeping anxiety
                blob.attitudes.political_satisfaction -= 0.01;
                blob.latent_traits.economic_security_priority += 0.005;
                blob.latent_traits.powerlessness += 0.003;
            } else if rate > 0.008 {
                // Booming economy: growing confidence
                blob.attitudes.political_satisfaction += 0.005;
                blob.latent_traits.economic_security_priority -= 0.003;
                blob.latent_traits.self_efficacy += 0.002;
            }

            // Income inequality perception: compare to city average
            let city_avg_income = d_mean_income.iter().sum::<f64>() / 5.0;
            if blob.income < city_avg_income * 0.6 {
                // Falling behind the city → relative deprivation deepens
                blob.latent_traits.powerlessness += 0.003;
                blob.latent_traits.party_indifference += 0.002;
            }

            blob.attitudes.clamp();
            blob.latent_traits.clamp();
        }
    }

    /// Check for endogenous events triggered by simulation state.
    /// These create cascading feedback that breaks parallel district trajectories.
    /// Called weekly (every 7 ticks) within the tick loop.
    fn check_endogenous_events(&mut self) {
        let mut rng = self.rng.lock().unwrap();

        // Compute district-level statistics
        let mut d_sat = [0.0f64; 5];
        let mut d_trust = [0.0f64; 5];
        let mut d_protest = [0.0f64; 5];
        let mut d_efficacy = [0.0f64; 5];
        let mut d_alienation = [0.0f64; 5];
        let mut d_count = [0u32; 5];
        for blob in &self.blobs {
            let d = blob.district as usize;
            if d >= 5 { continue; }
            d_sat[d] += blob.attitudes.political_satisfaction;
            d_trust[d] += blob.attitudes.institutional_trust;
            d_protest[d] += blob.political_state.protest_readiness;
            d_efficacy[d] += (blob.latent_traits.self_efficacy
                + blob.latent_traits.political_knowledge
                + blob.latent_traits.vote_importance) / 3.0;
            d_alienation[d] += (blob.latent_traits.powerlessness
                + blob.latent_traits.party_indifference) / 2.0;
            d_count[d] += 1;
        }

        for d in 0..5u8 {
            let di = d as usize;
            if d_count[di] == 0 { continue; }
            let n = d_count[di] as f64;
            let mean_sat = d_sat[di] / n;
            let mean_trust = d_trust[di] / n;
            let mean_protest = d_protest[di] / n;
            let mean_efficacy = d_efficacy[di] / n;
            let mean_alienation = d_alienation[di] / n;

            // ── Spontaneous Protest (Granovetter threshold model) ──
            // When trust is very low AND protest readiness is high → eruption
            if mean_trust < 1.5 && mean_protest > 0.7 && rng.gen::<f64>() < 0.06 {
                self.protest_active = true;
                #[cfg(debug_assertions)]
                eprintln!("  [Tick {}] ENDOGENOUS: Spontaneous protest in district {}", self.current_tick, d);

                for blob in self.blobs.iter_mut().filter(|g| g.district == d) {
                    // Protest deepens distrust and polarizes
                    blob.attitudes.institutional_trust -= 0.4;
                    blob.base_trust -= 0.12;
                    // But ALSO activates some efficacy (collective action experience)
                    if blob.political_state.protest_readiness > 0.5 {
                        blob.latent_traits.self_efficacy += 0.3;
                        blob.latent_traits.community_participation += 0.4;
                    }
                    // Authoritarianism strengthens in those already predisposed
                    if blob.latent_traits.obedience_value > 5.0 {
                        blob.latent_traits.strong_leader_preference += 0.3;
                        blob.base_latent_traits.strong_leader_preference += 0.10;
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                    blob.base_latent_traits.clamp();
                }

                // Cross-district spillover: OTHER districts react to seeing the protest
                for blob in self.blobs.iter_mut().filter(|g| g.district != d) {
                    // Educated observers: concern but also mobilization
                    if blob.education_level >= 2 {
                        blob.latent_traits.political_knowledge += 0.1;
                        blob.latent_traits.vote_importance += 0.1;
                    }
                    // Low-trust observers: "see, the system is broken"
                    if blob.attitudes.institutional_trust < 3.0 {
                        blob.attitudes.institutional_trust -= 0.2;
                        blob.latent_traits.party_indifference += 0.1;
                    }
                    // High-trust observers: anxiety → slight satisfaction drop
                    if blob.attitudes.institutional_trust > 6.0 {
                        blob.attitudes.political_satisfaction -= 0.15;
                    }
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                }
            }

            // ── Civic Initiative Success (collective efficacy payoff) ──
            // When efficacy is very high AND participation is strong → spontaneous civic success
            // Also trigger civic initiative at LOWER thresholds if education reform happened
            // (post-reform communities have new capacity for civic action)
            let civic_threshold = if mean_efficacy > 4.0 { 0.06 } else { 0.03 };
            if mean_efficacy > 5.0 && mean_sat > 3.0 && rng.gen::<f64>() < civic_threshold {
                #[cfg(debug_assertions)]
                eprintln!("  [Tick {}] ENDOGENOUS: Civic initiative in district {}", self.current_tick, d);

                for blob in self.blobs.iter_mut().filter(|g| g.district == d) {
                    blob.attitudes.institutional_trust += 0.6;
                    blob.attitudes.political_satisfaction += 0.3;
                    blob.base_trust += 0.15;
                    blob.latent_traits.self_efficacy += 0.4;
                    blob.latent_traits.vote_importance += 0.3;
                    blob.latent_traits.powerlessness -= 0.3;
                    blob.base_latent_traits.self_efficacy += 0.15;
                    blob.attitudes.clamp();
                    blob.latent_traits.clamp();
                    blob.base_latent_traits.clamp();
                }
            }

            // ── Collective Resignation (alienation death spiral) ──
            // When alienation > 7.5 AND satisfaction < 2.0 → collective withdrawal
            if mean_alienation > 8.0 && mean_sat < 1.5 && rng.gen::<f64>() < 0.05 {
                #[cfg(debug_assertions)]
                eprintln!("  [Tick {}] ENDOGENOUS: Collective resignation in district {}", self.current_tick, d);

                for blob in self.blobs.iter_mut().filter(|g| g.district == d) {
                    blob.latent_traits.community_participation -= 0.4;
                    blob.latent_traits.neighbor_trust -= 0.3;
                    blob.latent_traits.party_indifference += 0.3;
                    blob.latent_traits.vote_importance -= 0.3;
                    // Base: only SocCap (single construct); Alienation transient
                    blob.base_latent_traits.community_participation -= 0.15;
                    blob.latent_traits.clamp();
                    blob.base_latent_traits.clamp();
                }
            }

            // ── Polarization Event (cross-district cultural clash) ──
            // When two districts are ideologically very far apart → cultural conflict
            // Check Industriezone (d=4) vs Sonnenberg (d=1)
            if d == 4 && d_count[1] > 0 {
                let sonnenberg_trust = d_trust[1] / d_count[1] as f64;
                let industrie_alienation = mean_alienation;
                // When gap becomes extreme → culture war dynamics
                if sonnenberg_trust > 8.0 && industrie_alienation > 8.0 && rng.gen::<f64>() < 0.03 {
                    #[cfg(debug_assertions)]
                    eprintln!("  [Tick {}] ENDOGENOUS: Cultural polarization Sonnenberg↔Industriezone", self.current_tick);

                    // Both sides radicalize in opposite directions
                    for blob in self.blobs.iter_mut() {
                        if blob.district == 1 {
                            // Sonnenberg: defensive progressive deepening
                            // Base: only Auth (single construct); Mat effect transient
                            blob.base_ideology -= 0.072;
                            blob.base_latent_traits.obedience_value -= 0.08;
                            blob.latent_traits.freedom_over_order += 0.10; // transient, not base
                        } else if blob.district == 4 {
                            // Industriezone: reactive authoritarian deepening
                            // Base: only Auth (single construct); Alienation effect transient
                            blob.base_ideology += 0.045;
                            blob.base_latent_traits.strong_leader_preference += 0.12;
                            blob.base_latent_traits.obedience_value += 0.08;
                            blob.latent_traits.party_indifference += 0.08; // transient, not base
                        }
                        // Middle districts feel the tension
                        if blob.district == 3 {
                            blob.attitudes.political_satisfaction -= 0.1;
                            blob.latent_traits.political_complexity += 0.1;
                        }
                        blob.attitudes.clamp();
                        blob.latent_traits.clamp();
                        blob.base_latent_traits.clamp();
                    }
                }
            }
        }
    }

    /// Run an election. Returns votes per party.
    fn run_election(&mut self) -> [u32; 4] {
        let mut votes = [0u32; 4];
        for blob in &mut self.blobs {
            if blob.political_state.will_vote {
                if let Some(party) = blob.political_state.party_affiliation {
                    if (party as usize) < 4 {
                        votes[party as usize] += 1;
                    }
                    blob.political_state.last_vote = Some(party);
                }
            }
        }
        votes
    }

    /// Get the latest snapshot.
    pub fn current_snapshot(&self) -> &SocietySnapshot {
        self.history.last().unwrap()
    }

    /// Evaluate residential mobility for all households (Tiebout 1956).
    /// Households with income >40% above/below district median may relocate.
    /// Called annually.
    fn evaluate_residential_mobility(&mut self) {
        let city = match &self.city {
            Some(c) => c,
            None => return,
        };

        // Compute district median incomes
        let mut district_incomes: Vec<Vec<f64>> = vec![Vec::new(); 5];
        for blob in &self.blobs {
            let d = blob.district as usize;
            if d < 5 && !blob.is_child() {
                district_incomes[d].push(blob.income);
            }
        }
        let mut district_medians = [3000.0f64; 5];
        for (d, incomes) in district_incomes.iter_mut().enumerate() {
            if !incomes.is_empty() {
                incomes.sort_by(|a, b| a.partial_cmp(b).unwrap());
                district_medians[d] = incomes[incomes.len() / 2];
            }
        }

        // Phase 1: Collect move decisions (read-only pass)
        let mut moves: Vec<(Vec<uuid::Uuid>, u8, f64)> = Vec::new();
        {
            let mut rng = self.rng.lock().unwrap();
            for household in &self.households {
                if household.member_ids.is_empty() { continue; }

                let member_incomes: Vec<f64> = household.member_ids.iter()
                    .filter_map(|id| self.blobs.iter().find(|g| g.id == *id))
                    .filter(|g| !g.is_child())
                    .map(|g| g.income)
                    .collect();

                if member_incomes.is_empty() { continue; }
                let avg_income = member_incomes.iter().sum::<f64>() / member_incomes.len() as f64;

                let d = household.district as usize;
                if d >= 5 { continue; }

                let mismatch = if district_medians[d] > 0.0 {
                    (avg_income - district_medians[d]).abs() / district_medians[d]
                } else { 0.0 };

                // Move probability: 25% if income mismatch > 25%, or 3% baseline
                let move_prob = if mismatch > 0.25 { 0.25 } else { 0.03 };
                if rng.gen::<f64>() > move_prob { continue; }

                // Find best-fit district
                let mut best_d = household.district;
                let mut best_fit = f64::MAX;
                for target in 0..5u8 {
                    if target == household.district { continue; }
                    let fit = (avg_income - district_medians[target as usize]).abs()
                        + rng.gen_range(0.0..500.0);
                    if fit < best_fit {
                        best_fit = fit;
                        best_d = target;
                    }
                }

                if best_d != household.district {
                    moves.push((household.member_ids.clone(), best_d, avg_income));
                }
            }
        }

        if moves.is_empty() { return; }

        #[cfg(debug_assertions)]
        eprintln!("  [Tick {}] Residential mobility: {} household(s) moving", self.current_tick, moves.len());

        // Phase 2: Execute moves
        let mut rng = self.rng.lock().unwrap();
        for (member_ids, new_district, avg_income) in &moves {
            // Update household
            for household in &mut self.households {
                if household.member_ids == *member_ids {
                    household.district = *new_district;
                    break;
                }
            }

            // Find a residential building in the new district
            let home_buildings: Vec<u32> = city.buildings.iter()
                .filter(|b| b.district == *new_district && b.functional_type.is_residential())
                .map(|b| b.id)
                .collect();
            let new_home_id = if !home_buildings.is_empty() {
                Some(home_buildings[rng.gen_range(0..home_buildings.len())])
            } else { None };
            let new_home_pos = new_home_id
                .and_then(|id| city.get(id).map(|b| b.sim_position()));

            for member_id in member_ids {
                if let Some(blob) = self.blobs.iter_mut().find(|g| g.id == *member_id) {
                    blob.district = *new_district;
                    if let Some(hid) = new_home_id {
                        blob.home_building_id = Some(hid);
                    }
                    if let Some(pos) = new_home_pos {
                        blob.home_pos = pos;
                        blob.pos = pos;
                    }

                    // Satisfaction effect from move
                    let median_new = district_medians[*new_district as usize];
                    if *avg_income >= median_new {
                        blob.base_satisfaction += 0.5;  // upward mobility
                    } else {
                        blob.base_satisfaction -= 0.3;  // forced/downward
                    }

                    // Reassign buildings (children keep their school assignment)
                    if !blob.is_child() {
                        if rng.gen::<f64>() < 0.5 {
                            reassign_workplace_single(blob, city, &mut rng);
                        }
                        reassign_leisure_spot_single(blob, city, 0.15, &mut rng);
                    }
                }
            }
        }
    }

    /// Find the CentralSquare or Parliament building ID for event days.
    fn find_civic_building_id(city: &Option<CityModel>) -> Option<u32> {
        if let Some(ref city) = city {
            let squares = city.by_type(FunctionalType::CentralSquare);
            if let Some(b) = squares.first() {
                return Some(b.id);
            }
            let parliaments = city.by_type(FunctionalType::Parliament);
            if let Some(b) = parliaments.first() {
                return Some(b.id);
            }
        }
        None
    }
}
