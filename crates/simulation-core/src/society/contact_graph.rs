use std::collections::HashMap;

use super::blob::Blob;

/// Strength of social influence per contact type.
#[derive(Debug, Clone, Copy)]
pub enum ContactType {
    /// Members of the same household (strongest bond)
    HouseholdMember,
    /// Colleagues at the same workplace (daily, strong influence)
    Coworker,
    /// Neighbors in the same residential building (weekly, moderate influence)
    Neighbor,
    /// Acquaintances met at shared leisure/lunch spots (weak, diverse)
    Acquaintance,
}

impl ContactType {
    /// Influence weight multiplier for this contact type.
    pub fn weight(&self) -> f64 {
        match self {
            ContactType::HouseholdMember => 2.0,
            ContactType::Coworker => 1.0,
            ContactType::Neighbor => 0.5,
            ContactType::Acquaintance => 0.2,
        }
    }
}

/// A single contact relationship.
#[derive(Debug, Clone)]
pub struct Contact {
    /// Index into the blobs array.
    pub other_idx: usize,
    pub contact_type: ContactType,
}

/// Pre-computed social contact graph for all Blobs.
/// Maps blob index → list of contacts.
pub struct ContactGraph {
    pub contacts: Vec<Vec<Contact>>,
}

impl ContactGraph {
    /// Build the contact graph from current building assignments.
    /// This should be called once at simulation init (or when assignments change).
    pub fn build(blobs: &[Blob]) -> Self {
        let n = blobs.len();
        let mut contacts: Vec<Vec<Contact>> = (0..n).map(|_| Vec::new()).collect();

        // Phase 0: Household contacts (strongest bond)
        let mut household_map: HashMap<u32, Vec<usize>> = HashMap::new();
        for (i, blob) in blobs.iter().enumerate() {
            if let Some(hh_id) = blob.household_id {
                household_map.entry(hh_id).or_default().push(i);
            }
        }
        for (_hh_id, members) in &household_map {
            add_mutual_contacts(&mut contacts, members, ContactType::HouseholdMember);
        }

        // Index: building_id → list of blob indices
        let mut workplace_map: HashMap<u32, Vec<usize>> = HashMap::new();
        let mut home_map: HashMap<u32, Vec<usize>> = HashMap::new();
        let mut leisure_map: HashMap<u32, Vec<usize>> = HashMap::new();
        let mut lunch_map: HashMap<u32, Vec<usize>> = HashMap::new();

        for (i, blob) in blobs.iter().enumerate() {
            if let Some(wid) = blob.workplace_id {
                workplace_map.entry(wid).or_default().push(i);
            }
            if let Some(hid) = blob.home_building_id {
                home_map.entry(hid).or_default().push(i);
            }
            if let Some(lid) = blob.leisure_spot_id {
                leisure_map.entry(lid).or_default().push(i);
            }
            if let Some(lid) = blob.lunch_spot_id {
                lunch_map.entry(lid).or_default().push(i);
            }
        }

        // Coworker contacts (same workplace)
        for (_building_id, members) in &workplace_map {
            add_mutual_contacts(&mut contacts, members, ContactType::Coworker);
        }

        // Neighbor contacts (same residential building)
        for (_building_id, members) in &home_map {
            add_mutual_contacts(&mut contacts, members, ContactType::Neighbor);
        }

        // Acquaintance contacts (shared leisure or lunch spots)
        for (_building_id, members) in &leisure_map {
            add_mutual_contacts(&mut contacts, members, ContactType::Acquaintance);
        }
        for (_building_id, members) in &lunch_map {
            add_mutual_contacts(&mut contacts, members, ContactType::Acquaintance);
        }

        // Deduplicate: keep strongest contact type per pair
        for contact_list in &mut contacts {
            // Sort by other_idx, then by weight (descending)
            contact_list.sort_by(|a, b| {
                a.other_idx.cmp(&b.other_idx)
                    .then_with(|| b.contact_type.weight().partial_cmp(&a.contact_type.weight())
                        .unwrap_or(std::cmp::Ordering::Equal))
            });
            contact_list.dedup_by(|a, b| a.other_idx == b.other_idx);

            // Cap total contacts per Blob (Dunbar's active circle ≈ 15).
            // Keep strongest contacts first: Household > Coworker > Neighbor > Acquaintance.
            if contact_list.len() > 15 {
                contact_list.sort_by(|a, b| {
                    b.contact_type.weight().partial_cmp(&a.contact_type.weight())
                        .unwrap_or(std::cmp::Ordering::Equal)
                });
                contact_list.truncate(15);
            }
        }

        ContactGraph { contacts }
    }

    /// Get contacts for a specific blob.
    pub fn get(&self, idx: usize) -> &[Contact] {
        &self.contacts[idx]
    }

    /// Average number of contacts per blob (for diagnostics).
    pub fn avg_contacts(&self) -> f64 {
        if self.contacts.is_empty() { return 0.0; }
        let total: usize = self.contacts.iter().map(|c| c.len()).sum();
        total as f64 / self.contacts.len() as f64
    }
}

/// Add mutual contacts between all members of a group (building).
/// Caps at 15 contacts per building to avoid O(n²) for large buildings.
fn add_mutual_contacts(
    contacts: &mut [Vec<Contact>],
    members: &[usize],
    contact_type: ContactType,
) {
    if members.len() < 2 {
        return;
    }
    // Cap connections for very large buildings (e.g., marketplace with 30+ capacity)
    let max_pairs = if members.len() > 15 { 15 } else { members.len() };
    for i in 0..max_pairs {
        for j in (i + 1)..max_pairs {
            let a = members[i];
            let b = members[j];
            contacts[a].push(Contact { other_idx: b, contact_type });
            contacts[b].push(Contact { other_idx: a, contact_type });
        }
    }
}
