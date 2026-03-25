use rand::rngs::SmallRng;
use rand::Rng;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// German household type distribution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HouseholdType {
    Single,
    Couple,
    SmallFamily,
    LargeFamily,
}

impl HouseholdType {
    /// Number of members for this household type.
    pub fn size(&self) -> usize {
        match self {
            HouseholdType::Single => 1,
            HouseholdType::Couple => 2,
            HouseholdType::SmallFamily => 3,
            HouseholdType::LargeFamily => 4,
        }
    }
}

/// A household unit — a group of Blobs living together.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Household {
    pub id: u32,
    pub household_type: HouseholdType,
    pub last_name: String,
    pub district: u8,
    pub member_ids: Vec<Uuid>,
    #[serde(default)]
    pub home_building_id: Option<u32>,
}

/// Generate metric ages (in years) for household members.
pub fn household_ages(ht: HouseholdType, rng: &mut SmallRng) -> Vec<u8> {
    match ht {
        HouseholdType::Single => {
            // Full adult range 18-78
            vec![rng.gen_range(18..79u8)]
        }
        HouseholdType::Couple => {
            // 80% middle-aged couple (28-55), 20% older couple (56-75)
            if rng.gen::<f64>() < 0.8 {
                let a1 = rng.gen_range(28..56u8);
                let a2 = (a1 as i16 + rng.gen_range(-4..5)).clamp(25, 58) as u8;
                vec![a1, a2]
            } else {
                let a1 = rng.gen_range(56..76u8);
                let a2 = (a1 as i16 + rng.gen_range(-3..4)).clamp(54, 78) as u8;
                vec![a1, a2]
            }
        }
        HouseholdType::SmallFamily => {
            // 1 parent (30-50), 1 child (2-17), 1 random (could be child or grandparent)
            // Ensure parent-child age gap >= 18 (realistic minimum parenting age)
            let parent = rng.gen_range(30..51u8);
            let max_child_age = (parent - 18).min(17);
            let child = rng.gen_range(2..max_child_age.max(3) + 1);
            let third: u8 = if rng.gen::<f64>() < 0.6 {
                rng.gen_range(2..max_child_age.max(3) + 1)  // another child
            } else if rng.gen::<f64>() < 0.5 {
                rng.gen_range(30..51)  // second parent
            } else {
                rng.gen_range(60..79)  // grandparent
            };
            vec![parent, child, third]
        }
        HouseholdType::LargeFamily => {
            // 2 parents (30-52), 2 children (2-17)
            // Ensure parent-child age gap >= 18
            let p1 = rng.gen_range(30..53u8);
            let p2 = (p1 as i16 + rng.gen_range(-4..5)).clamp(28, 55) as u8;
            let max_child_age = (p1.min(p2) - 18).min(17);
            let c1 = rng.gen_range(2..max_child_age.max(3) + 1);
            let c2 = rng.gen_range(2..max_child_age.max(3) + 1);
            vec![p1, p2, c1, c2]
        }
    }
}

/// Form households for a district to reach exactly `count` Blobs.
/// Uses German household distribution: 42% single, 33% couple, 12% small family, 13% large family.
pub fn form_households(
    district: u8,
    count: usize,
    last_name_fn: &dyn Fn(u8, &mut SmallRng) -> String,
    rng: &mut SmallRng,
    next_id: &mut u32,
) -> Vec<Household> {
    if count == 0 {
        return Vec::new();
    }

    let mut households = Vec::new();
    let mut remaining = count;

    // Phase 1: Draw from distribution until we can't fit more multi-person households
    while remaining > 0 {
        let r: f64 = rng.gen();
        let ht = if r < 0.42 {
            HouseholdType::Single
        } else if r < 0.75 {
            HouseholdType::Couple
        } else if r < 0.87 {
            HouseholdType::SmallFamily
        } else {
            HouseholdType::LargeFamily
        };

        let size = ht.size();
        if size > remaining {
            // Can't fit this type — try smaller or fill with singles
            if remaining >= 4 {
                // Still room for a large family
                continue;
            } else if remaining >= 3 {
                // Fill with a small family
                let hh = make_household(HouseholdType::SmallFamily, district, last_name_fn, rng, next_id);
                remaining -= 3;
                households.push(hh);
            } else if remaining >= 2 {
                let hh = make_household(HouseholdType::Couple, district, last_name_fn, rng, next_id);
                remaining -= 2;
                households.push(hh);
            } else {
                let hh = make_household(HouseholdType::Single, district, last_name_fn, rng, next_id);
                remaining -= 1;
                households.push(hh);
            }
            continue;
        }

        let hh = make_household(ht, district, last_name_fn, rng, next_id);
        remaining -= size;
        households.push(hh);
    }

    // Sort: large households first (for greedy building assignment)
    households.sort_by(|a, b| b.household_type.size().cmp(&a.household_type.size()));

    households
}

fn make_household(
    ht: HouseholdType,
    district: u8,
    last_name_fn: &dyn Fn(u8, &mut SmallRng) -> String,
    rng: &mut SmallRng,
    next_id: &mut u32,
) -> Household {
    let id = *next_id;
    *next_id += 1;
    let last_name = last_name_fn(district, rng);
    Household {
        id,
        household_type: ht,
        last_name,
        district,
        member_ids: Vec::new(), // filled later when Globs are created
        home_building_id: None,
    }
}
