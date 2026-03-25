use nalgebra::Point2;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Enums ──────────────────────────────────────────────────────

/// High-level building category.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FunctionalType {
    // Residential
    Residential,
    Villa,
    Rowhouse,
    Apartment,
    // Workplace
    Office,
    Factory,
    Warehouse,
    // Commercial
    Shop,
    Cafe,
    Restaurant,
    Bar,
    // Leisure
    Park,
    SportsFacility,
    // Civic / Landmark
    Parliament,
    Marketplace,
    MediaCenter,
    CentralSquare,
    University,
    Library,
    School,
    // Non-functional (decoration, road, water) — filtered out during import
    Decoration,
    Road,
    Water,
}

impl FunctionalType {
    /// Is this a residential building where Globs can live?
    pub fn is_residential(&self) -> bool {
        matches!(self, Self::Residential | Self::Villa | Self::Rowhouse | Self::Apartment)
    }

    /// Is this a workplace where Globs can work?
    pub fn is_workplace(&self) -> bool {
        matches!(
            self,
            Self::Office
                | Self::Factory
                | Self::Warehouse
                | Self::Shop
                | Self::Cafe
                | Self::Restaurant
                | Self::Bar
                | Self::University
                | Self::Library
                | Self::MediaCenter
                | Self::Parliament
        )
    }

    /// Is this a place suitable for lunch/dining?
    pub fn is_dining(&self) -> bool {
        matches!(
            self,
            Self::Cafe | Self::Restaurant | Self::Bar | Self::Marketplace
        )
    }

    /// Is this a leisure/social venue?
    pub fn is_leisure(&self) -> bool {
        matches!(
            self,
            Self::Park
                | Self::SportsFacility
                | Self::Bar
                | Self::Cafe
                | Self::Marketplace
                | Self::CentralSquare
                | Self::Library
        )
    }

    /// Is this a civic/political venue?
    pub fn is_civic(&self) -> bool {
        matches!(
            self,
            Self::Parliament | Self::CentralSquare | Self::Marketplace
        )
    }
}

// ─── Building ───────────────────────────────────────────────────

/// A building in the Blobtopia city.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Building {
    pub id: u32,
    /// World coordinates (0–1000 scale, matching the 3D frontend).
    pub x: f64,
    pub z: f64,
    pub district: u8,
    /// The original visual type from city generation (villa, apartment, factory, etc.)
    #[serde(rename = "type")]
    pub visual_type: String,
    pub model: String,
    pub label: String,
    pub functional_type: FunctionalType,
    pub capacity: u16,
}

impl Building {
    /// Position as a Point2 in world coordinates (0–1000).
    pub fn position(&self) -> Point2<f64> {
        Point2::new(self.x, self.z)
    }

    /// Position converted to simulation grid coordinates (0–250).
    /// The simulation grid is 4× smaller than the world grid.
    pub fn sim_position(&self) -> Point2<f64> {
        Point2::new(self.x / 4.0, self.z / 4.0)
    }
}

// ─── CityModel ──────────────────────────────────────────────────

/// The complete city model with all functional buildings.
/// Loaded from `globtopia-city.json` (the `buildings` array).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CityModel {
    pub buildings: Vec<Building>,
}

impl CityModel {
    /// Load city from the `buildings` array in the city JSON.
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        /// Helper struct matching city JSON layout (supports both `buildings` and `placements` keys).
        #[derive(Deserialize)]
        struct CityLayout {
            #[allow(dead_code)]
            version: u32,
            #[serde(alias = "placements")]
            buildings: Vec<Building>,
        }
        let layout: CityLayout = serde_json::from_str(json_str)?;
        let buildings: Vec<Building> = layout
            .buildings
            .into_iter()
            .filter(|b| !matches!(b.functional_type, FunctionalType::Decoration | FunctionalType::Road | FunctionalType::Water))
            .collect();
        Ok(CityModel { buildings })
    }

    /// Get all buildings of a given functional type.
    pub fn by_type(&self, ft: FunctionalType) -> Vec<&Building> {
        self.buildings
            .iter()
            .filter(|b| b.functional_type == ft)
            .collect()
    }

    /// Get all buildings in a given district.
    pub fn by_district(&self, district: u8) -> Vec<&Building> {
        self.buildings
            .iter()
            .filter(|b| b.district == district)
            .collect()
    }

    /// Get all residential buildings in a district.
    pub fn residential_in_district(&self, district: u8) -> Vec<&Building> {
        self.buildings
            .iter()
            .filter(|b| b.district == district && b.functional_type.is_residential())
            .collect()
    }

    /// Get all workplace buildings, optionally filtered by district.
    pub fn workplaces(&self, district: Option<u8>) -> Vec<&Building> {
        self.buildings
            .iter()
            .filter(|b| {
                b.functional_type.is_workplace()
                    && district.map_or(true, |d| b.district == d)
            })
            .collect()
    }

    /// Get all dining spots, optionally filtered by district.
    pub fn dining_spots(&self, district: Option<u8>) -> Vec<&Building> {
        self.buildings
            .iter()
            .filter(|b| {
                b.functional_type.is_dining()
                    && district.map_or(true, |d| b.district == d)
            })
            .collect()
    }

    /// Get all leisure venues, optionally filtered by district.
    pub fn leisure_spots(&self, district: Option<u8>) -> Vec<&Building> {
        self.buildings
            .iter()
            .filter(|b| {
                b.functional_type.is_leisure()
                    && district.map_or(true, |d| b.district == d)
            })
            .collect()
    }

    /// Get a building by its ID.
    pub fn get(&self, id: u32) -> Option<&Building> {
        self.buildings.iter().find(|b| b.id == id)
    }

    /// Build a lookup map from building ID to index for fast access.
    pub fn id_index_map(&self) -> HashMap<u32, usize> {
        self.buildings
            .iter()
            .enumerate()
            .map(|(i, b)| (b.id, i))
            .collect()
    }

    /// Total number of functional buildings.
    pub fn len(&self) -> usize {
        self.buildings.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buildings.is_empty()
    }
}
