use nalgebra::Point2;
use rand::rngs::SmallRng;
use rand::Rng;
use std::collections::HashMap;

use crate::stage::city::{Building, CityModel, FunctionalType};
use super::blob::Blob;
use super::household::Household;

/// Tracks remaining capacity per building during assignment.
struct CapacityTracker {
    remaining: HashMap<u32, u16>,
}

impl CapacityTracker {
    fn new(city: &CityModel) -> Self {
        let remaining = city
            .buildings
            .iter()
            .map(|b| (b.id, b.capacity))
            .collect();
        CapacityTracker { remaining }
    }

    /// Try to claim multiple slots at once. Returns true if all could be claimed.
    fn claim_n(&mut self, building_id: u32, n: u16) -> bool {
        if let Some(cap) = self.remaining.get_mut(&building_id) {
            if *cap >= n {
                *cap -= n;
                return true;
            }
        }
        false
    }
}

/// Assign all Globs to buildings: home, workplace, lunch spot, leisure spot.
/// Households are assigned together to the same home and shared leisure spot.
pub fn assign_all_buildings(
    blobs: &mut [Blob],
    households: &mut [Household],
    city: &CityModel,
    num_districts: u8,
    rng: &mut SmallRng,
) {
    let mut capacity = CapacityTracker::new(city);

    // Phase 1: Home assignment (household-based)
    assign_household_homes(blobs, households, city, &mut capacity, num_districts, rng);

    // Phase 2: Workplace assignment (individual)
    assign_workplaces(blobs, city, rng);

    // Phase 3: Lunch spot assignment (individual)
    assign_lunch_spots(blobs, city, rng);

    // Phase 4: Leisure spot assignment (household-coordinated)
    assign_leisure_spots_household(blobs, households, city, rng);

    // Phase 5: School assignment — all children go to the school building
    assign_school_to_children(blobs, city);

    // Update home_pos to match assigned building
    for blob in blobs.iter_mut() {
        if let Some(bid) = blob.home_building_id {
            if let Some(b) = city.get(bid) {
                blob.home_pos = b.sim_position();
                blob.pos = b.sim_position();
            }
        }
    }
}

/// Assign households to residential buildings.
/// Large households first (greedy), with type preferences.
fn assign_household_homes(
    blobs: &mut [Blob],
    households: &mut [Household],
    city: &CityModel,
    capacity: &mut CapacityTracker,
    num_districts: u8,
    _rng: &mut SmallRng,
) {
    // Build blob index: id → index
    let glob_index: HashMap<uuid::Uuid, usize> = blobs
        .iter()
        .enumerate()
        .map(|(i, g)| (g.id, i))
        .collect();

    // Households are already sorted by size (descending) from form_households
    for household in households.iter_mut() {
        let size = household.member_ids.len() as u16;
        if size == 0 {
            continue;
        }

        // Try own district first
        let assigned_building = try_assign_household_to_district(
            household, city, capacity, household.district,
        ).or_else(|| {
            // Fallback: try any district
            for d in 0..num_districts {
                if d == household.district {
                    continue;
                }
                if let Some(bid) = try_assign_household_to_district(
                    household, city, capacity, d,
                ) {
                    return Some(bid);
                }
            }
            None
        });

        if let Some(bid) = assigned_building {
            household.home_building_id = Some(bid);
            // Assign all members
            for member_id in &household.member_ids {
                if let Some(&idx) = glob_index.get(member_id) {
                    blobs[idx].home_building_id = Some(bid);
                }
            }
        }
    }
}

/// Try to assign a household to a building in a specific district.
/// Returns the building ID if successful.
fn try_assign_household_to_district(
    household: &Household,
    city: &CityModel,
    capacity: &mut CapacityTracker,
    district: u8,
) -> Option<u32> {
    let size = household.member_ids.len() as u16;
    let mut candidates: Vec<&Building> = city
        .buildings
        .iter()
        .filter(|b| b.district == district && b.functional_type.is_residential())
        .collect();

    // Sort by type preference
    candidates.sort_by(|a, b| {
        let pa = type_preference(a.functional_type, household.household_type);
        let pb = type_preference(b.functional_type, household.household_type);
        pa.cmp(&pb)
    });

    for building in &candidates {
        if capacity.claim_n(building.id, size) {
            return Some(building.id);
        }
    }
    None
}

/// Lower = more preferred. Matches household types to building types.
fn type_preference(ft: FunctionalType, ht: super::household::HouseholdType) -> u8 {
    use super::household::HouseholdType;
    match ht {
        HouseholdType::LargeFamily => match ft {
            FunctionalType::Rowhouse => 0,
            FunctionalType::Apartment => 1,
            FunctionalType::Villa => 2,
            _ => 3,
        },
        HouseholdType::SmallFamily => match ft {
            FunctionalType::Rowhouse => 0,
            FunctionalType::Apartment => 1,
            FunctionalType::Villa => 2,
            _ => 3,
        },
        HouseholdType::Couple => match ft {
            FunctionalType::Villa => 0,
            FunctionalType::Rowhouse => 1,
            FunctionalType::Apartment => 2,
            _ => 3,
        },
        HouseholdType::Single => match ft {
            FunctionalType::Apartment => 0,
            FunctionalType::Rowhouse => 1,
            FunctionalType::Villa => 2,
            _ => 3,
        },
    }
}

/// Assign each Blob to a workplace based on education level.
/// Children (age < 18) are skipped — they stay at home/leisure instead.
fn assign_workplaces(blobs: &mut [Blob], city: &CityModel, rng: &mut SmallRng) {
    for blob in blobs.iter_mut() {
        if blob.is_child() {
            continue; // Children don't work
        }
        let home_pos = blob.home_pos;

        let suitable_types: Vec<FunctionalType> = match blob.education_level {
            3 => vec![
                FunctionalType::University,
                FunctionalType::Library,
                FunctionalType::Parliament,
                FunctionalType::MediaCenter,
                FunctionalType::Office,
            ],
            2 => vec![
                FunctionalType::Office,
                FunctionalType::Shop,
                FunctionalType::MediaCenter,
                FunctionalType::Library,
            ],
            1 => vec![
                FunctionalType::Shop,
                FunctionalType::Cafe,
                FunctionalType::Restaurant,
                FunctionalType::Factory,
                FunctionalType::Warehouse,
            ],
            _ => vec![
                FunctionalType::Factory,
                FunctionalType::Warehouse,
                FunctionalType::Shop,
            ],
        };

        let mut candidates: Vec<&Building> = city
            .buildings
            .iter()
            .filter(|b| suitable_types.contains(&b.functional_type))
            .collect();

        if candidates.is_empty() {
            continue;
        }

        candidates.sort_by(|a, b| {
            let da = workplace_score(a, &home_pos, blob.district, blob.income_normalized());
            let db = workplace_score(b, &home_pos, blob.district, blob.income_normalized());
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        });

        let top_n = candidates.len().min(5);
        let idx = rng.gen_range(0..top_n);
        blob.workplace_id = Some(candidates[idx].id);
    }
}

/// Score a workplace: lower is better.
fn workplace_score(building: &Building, home_pos: &Point2<f64>, district: u8, income_norm: f64) -> f64 {
    let dist = distance(&building.sim_position(), home_pos);
    let district_penalty = if building.district == district { 0.0 } else { 50.0 };
    let distance_weight = 1.0 / (0.5 + income_norm * 0.1);
    dist * distance_weight + district_penalty
}

/// Assign each Blob a preferred lunch spot.
fn assign_lunch_spots(blobs: &mut [Blob], city: &CityModel, rng: &mut SmallRng) {
    let dining_spots: Vec<&Building> = city
        .buildings
        .iter()
        .filter(|b| b.functional_type.is_dining())
        .collect();

    if dining_spots.is_empty() {
        return;
    }

    for blob in blobs.iter_mut() {
        if blob.is_child() {
            continue; // Children eat at home
        }
        let reference_pos = if let Some(wid) = blob.workplace_id {
            city.get(wid)
                .map(|b| b.sim_position())
                .unwrap_or(blob.home_pos)
        } else {
            blob.home_pos
        };

        let mut candidates = dining_spots.clone();
        candidates.sort_by(|a, b| {
            let da = distance_sq(&a.sim_position(), &reference_pos);
            let db = distance_sq(&b.sim_position(), &reference_pos);
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        });

        let top_n = candidates.len().min(if blob.income_normalized() > 6.0 { 8 } else { 4 });
        let idx = rng.gen_range(0..top_n);
        blob.lunch_spot_id = Some(candidates[idx].id);
    }
}

/// Assign leisure spots with household coordination:
/// Multi-person households share ONE leisure spot; singles pick individually.
fn assign_leisure_spots_household(
    blobs: &mut [Blob],
    households: &[Household],
    city: &CityModel,
    rng: &mut SmallRng,
) {
    let leisure_spots: Vec<&Building> = city
        .buildings
        .iter()
        .filter(|b| b.functional_type.is_leisure())
        .collect();

    if leisure_spots.is_empty() {
        return;
    }

    // Build blob index
    let glob_index: HashMap<uuid::Uuid, usize> = blobs
        .iter()
        .enumerate()
        .map(|(i, g)| (g.id, i))
        .collect();

    // Track which blobs have been assigned via household
    let mut assigned_globs = std::collections::HashSet::new();

    for household in households {
        if household.member_ids.is_empty() {
            continue;
        }

        // Get home position from first member
        let first_member_idx = household.member_ids.iter()
            .filter_map(|id| glob_index.get(id).copied())
            .next();

        let home_pos = match first_member_idx {
            Some(idx) => blobs[idx].home_pos,
            None => continue,
        };

        if household.member_ids.len() == 1 {
            // Single: pick individually (same logic as before)
            if let Some(&idx) = glob_index.get(&household.member_ids[0]) {
                let spot = pick_leisure_spot(&blobs[idx], &leisure_spots, rng);
                blobs[idx].leisure_spot_id = spot;
                assigned_globs.insert(household.member_ids[0]);
            }
        } else {
            // Multi-person: shared leisure spot
            let mut candidates = leisure_spots.clone();
            candidates.sort_by(|a, b| {
                let da = distance_sq(&a.sim_position(), &home_pos);
                let db = distance_sq(&b.sim_position(), &home_pos);
                da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
            });

            let top_n = candidates.len().min(5);
            let idx = rng.gen_range(0..top_n);
            let spot_id = Some(candidates[idx].id);

            for member_id in &household.member_ids {
                if let Some(&gi) = glob_index.get(member_id) {
                    blobs[gi].leisure_spot_id = spot_id;
                    assigned_globs.insert(*member_id);
                }
            }
        }
    }

    // Assign any remaining unassigned blobs individually
    for blob in blobs.iter_mut() {
        if blob.leisure_spot_id.is_some() {
            continue;
        }
        let spot = pick_leisure_spot(blob, &leisure_spots, rng);
        blob.leisure_spot_id = spot;
    }
}

fn pick_leisure_spot(
    blob: &Blob,
    leisure_spots: &[&Building],
    rng: &mut SmallRng,
) -> Option<u32> {
    let home_pos = blob.home_pos;

    let mut candidates = leisure_spots.to_vec();
    candidates.sort_by(|a, b| {
        let da = distance_sq(&a.sim_position(), &home_pos);
        let db = distance_sq(&b.sim_position(), &home_pos);
        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
    });

    let preferred: Vec<FunctionalType> = match blob.age_group() {
        0 => vec![FunctionalType::Bar, FunctionalType::Cafe, FunctionalType::SportsFacility],
        1 => vec![FunctionalType::Cafe, FunctionalType::Park, FunctionalType::SportsFacility],
        _ => vec![FunctionalType::Park, FunctionalType::Library, FunctionalType::Cafe],
    };

    let preferred_candidates: Vec<&&Building> = candidates
        .iter()
        .filter(|b| preferred.contains(&b.functional_type))
        .collect();

    if !preferred_candidates.is_empty() {
        let top_n = preferred_candidates.len().min(5);
        let idx = rng.gen_range(0..top_n);
        Some(preferred_candidates[idx].id)
    } else {
        let top_n = candidates.len().min(5);
        let idx = rng.gen_range(0..top_n);
        Some(candidates[idx].id)
    }
}

fn distance_sq(a: &Point2<f64>, b: &Point2<f64>) -> f64 {
    (a.x - b.x).powi(2) + (a.y - b.y).powi(2)
}

fn distance(a: &Point2<f64>, b: &Point2<f64>) -> f64 {
    distance_sq(a, b).sqrt()
}

// ═══════════════════════════════════════════════════════════════
// Single-Blob reassignment functions for social mobility
// ═══════════════════════════════════════════════════════════════

/// Reassign a single Blob's workplace (e.g., after job loss or promotion).
/// Also reassigns lunch spot near the new workplace.
pub fn reassign_workplace_single(blob: &mut Blob, city: &CityModel, rng: &mut SmallRng) {
    if blob.is_child() { return; }

    let suitable_types: Vec<FunctionalType> = match blob.education_level {
        3 => vec![FunctionalType::University, FunctionalType::Library,
                  FunctionalType::Parliament, FunctionalType::MediaCenter, FunctionalType::Office],
        2 => vec![FunctionalType::Office, FunctionalType::Shop,
                  FunctionalType::MediaCenter, FunctionalType::Library],
        1 => vec![FunctionalType::Shop, FunctionalType::Cafe,
                  FunctionalType::Restaurant, FunctionalType::Factory, FunctionalType::Warehouse],
        _ => vec![FunctionalType::Factory, FunctionalType::Warehouse, FunctionalType::Shop],
    };

    let mut candidates: Vec<&Building> = city.buildings.iter()
        .filter(|b| suitable_types.contains(&b.functional_type))
        .collect();

    if candidates.is_empty() { return; }

    let home_pos = blob.home_pos;
    candidates.sort_by(|a, b| {
        let da = workplace_score(a, &home_pos, blob.district, blob.income_normalized());
        let db = workplace_score(b, &home_pos, blob.district, blob.income_normalized());
        da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
    });

    let top_n = candidates.len().min(5);
    let idx = rng.gen_range(0..top_n);
    blob.workplace_id = Some(candidates[idx].id);

    // Also reassign lunch spot near new workplace
    reassign_lunch_spot_single(blob, city, rng);
}

/// Reassign a single Blob's lunch spot near their workplace.
pub fn reassign_lunch_spot_single(blob: &mut Blob, city: &CityModel, rng: &mut SmallRng) {
    if blob.is_child() { return; }

    let dining_spots: Vec<&Building> = city.buildings.iter()
        .filter(|b| b.functional_type.is_dining())
        .collect();

    if dining_spots.is_empty() { return; }

    let reference_pos = blob.workplace_id
        .and_then(|wid| city.get(wid).map(|b| b.sim_position()))
        .unwrap_or(blob.home_pos);

    let mut candidates = dining_spots;
    candidates.sort_by(|a, b| {
        distance_sq(&a.sim_position(), &reference_pos)
            .partial_cmp(&distance_sq(&b.sim_position(), &reference_pos))
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let top_n = candidates.len().min(if blob.income_normalized() > 6.0 { 8 } else { 4 });
    let idx = rng.gen_range(0..top_n);
    blob.lunch_spot_id = Some(candidates[idx].id);
}

/// Reassign a single Blob's leisure spot with cross-district chance.
/// cross_district_prob: probability of choosing a venue in a different district.
pub fn reassign_leisure_spot_single(blob: &mut Blob, city: &CityModel, cross_district_prob: f64, rng: &mut SmallRng) {
    reassign_leisure_spot_with_homophily(blob, city, cross_district_prob, None, rng);
}

/// Reassign leisure spot with ideological homophily (Schelling 1971, McPherson et al. 2001).
/// spot_atmosphere: building_id → (mean_ideology, mean_authoritarianism, patron_count)
/// Blobs prefer spots where people think like them — creating emergent echo chambers.
pub fn reassign_leisure_spot_with_homophily(
    blob: &mut Blob,
    city: &CityModel,
    cross_district_prob: f64,
    spot_atmosphere: Option<&HashMap<u32, (f64, f64, u32)>>,
    rng: &mut SmallRng,
) {
    let leisure_spots: Vec<&Building> = city.buildings.iter()
        .filter(|b| b.functional_type.is_leisure())
        .collect();

    if leisure_spots.is_empty() { return; }

    // Cross-district chance (still exists, but now also homophily-weighted)
    if rng.gen::<f64>() < cross_district_prob {
        let mut other: Vec<&Building> = leisure_spots.iter()
            .filter(|b| b.district != blob.district)
            .copied()
            .collect();
        if !other.is_empty() {
            if let Some(atm) = spot_atmosphere {
                // Cross-district with homophily: prefer ideologically similar spots
                other.sort_by(|a, b| {
                    let sa = homophily_score(blob, a, atm);
                    let sb = homophily_score(blob, b, atm);
                    sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
                });
            } else {
                let civic = Point2::new(156.0, 180.0);
                other.sort_by(|a, b| {
                    distance_sq(&a.sim_position(), &civic)
                        .partial_cmp(&distance_sq(&b.sim_position(), &civic))
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
            }
            let top_n = other.len().min(5);
            let idx = rng.gen_range(0..top_n);
            blob.leisure_spot_id = Some(other[idx].id);
            return;
        }
    }

    // In-district selection: distance + type preference + homophily
    if let Some(atm) = spot_atmosphere {
        let home_pos = blob.home_pos;

        // Combine distance, type preference, and ideological similarity
        let mut candidates = leisure_spots.clone();
        candidates.sort_by(|a, b| {
            let sa = combined_leisure_score(blob, a, &home_pos, atm);
            let sb = combined_leisure_score(blob, b, &home_pos, atm);
            sa.partial_cmp(&sb).unwrap_or(std::cmp::Ordering::Equal)
        });

        let top_n = candidates.len().min(7);
        let idx = rng.gen_range(0..top_n);
        blob.leisure_spot_id = Some(candidates[idx].id);
    } else {
        // No atmosphere data: fallback to pure distance/type
        let refs: Vec<&Building> = leisure_spots.iter().copied().collect();
        blob.leisure_spot_id = pick_leisure_spot(blob, &refs, rng);
    }
}

/// Compute combined score for leisure spot selection (lower = better).
/// Balances proximity (40%), type preference (20%), and ideological fit (40%).
fn combined_leisure_score(
    blob: &Blob,
    building: &Building,
    home_pos: &Point2<f64>,
    atmosphere: &HashMap<u32, (f64, f64, u32)>,
) -> f64 {
    let dist = distance(&building.sim_position(), home_pos);
    let max_dist = 350.0; // approximate max distance on 500x500 grid
    let dist_score = (dist / max_dist).min(1.0);

    // Type preference (0.0 = perfect, 1.0 = worst)
    let preferred: Vec<FunctionalType> = match blob.age_group() {
        0 => vec![FunctionalType::Bar, FunctionalType::Cafe, FunctionalType::SportsFacility],
        1 => vec![FunctionalType::Cafe, FunctionalType::Park, FunctionalType::SportsFacility],
        _ => vec![FunctionalType::Park, FunctionalType::Library, FunctionalType::Cafe],
    };
    let type_score = if preferred.contains(&building.functional_type) { 0.0 } else { 0.5 };

    // Homophily score: how similar is the spot's atmosphere to this blob?
    let homophily = homophily_score(blob, building, atmosphere);

    // Weighted combination
    dist_score * 0.35 + type_score * 0.15 + homophily * 0.50
}

/// Score ideological fit between a blob and a spot's atmosphere (lower = more similar).
fn homophily_score(
    blob: &Blob,
    building: &Building,
    atmosphere: &HashMap<u32, (f64, f64, u32)>,
) -> f64 {
    if let Some(&(mean_ideo, mean_auth, count)) = atmosphere.get(&building.id) {
        if count < 2 {
            return 0.5; // Not enough data — neutral
        }
        // Ideology distance (normalized to 0-1 range, max diff = 10 on -5..+5 scale)
        let ideo_diff = (blob.attitudes.ideology - mean_ideo).abs() / 10.0;
        // Authoritarianism distance (normalized to 0-1 range, max diff = 10 on 0..10 scale)
        let glob_auth = (blob.latent_traits.obedience_value
            + blob.latent_traits.strong_leader_preference) / 2.0;
        let auth_diff = (glob_auth - mean_auth).abs() / 10.0;
        // Combine: ideology matters more (60%) than authoritarianism (40%)
        ideo_diff * 0.6 + auth_diff * 0.4
    } else {
        0.5 // Unknown spot — neutral score
    }
}

/// Compute the ideological atmosphere of each leisure spot.
/// Returns: building_id → (mean_ideology, mean_authoritarianism, patron_count)
pub fn compute_spot_atmosphere(blobs: &[Blob]) -> HashMap<u32, (f64, f64, u32)> {
    let mut sums: HashMap<u32, (f64, f64, u32)> = HashMap::new();
    for blob in blobs {
        if let Some(lid) = blob.leisure_spot_id {
            let auth = (blob.latent_traits.obedience_value
                + blob.latent_traits.strong_leader_preference) / 2.0;
            let entry = sums.entry(lid).or_insert((0.0, 0.0, 0));
            entry.0 += blob.attitudes.ideology;
            entry.1 += auth;
            entry.2 += 1;
        }
    }
    // Convert sums to means
    for (_, entry) in sums.iter_mut() {
        if entry.2 > 0 {
            entry.0 /= entry.2 as f64;
            entry.1 /= entry.2 as f64;
        }
    }
    sums
}

/// Assign all children (age < 18) to the school building.
/// Overrides their leisure_spot_id so that child_weekday() sends them to school.
fn assign_school_to_children(blobs: &mut [Blob], city: &CityModel) {
    let school = city.buildings.iter().find(|b| b.functional_type == FunctionalType::School);
    if let Some(school) = school {
        let school_id = school.id;
        for blob in blobs.iter_mut() {
            if blob.is_child() {
                blob.leisure_spot_id = Some(school_id);
            }
        }
    }
}
