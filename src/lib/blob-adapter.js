/**
 * Adapts Blobtopia server data (SocietySnapshot with Blobs)
 * to the format expected by the WorldViewer.
 *
 * District defaults are loaded from data/districts.json (single source of truth).
 * They can be overwritten at runtime via initDistrictMetadata() from server data.
 */
import districtsData from '../../data/districts.json'

// District metadata — defaults from JSON, overwritten on server connect.
let DISTRICT_COLORS = {}
let DISTRICT_COLORS_HEX = {}
let DISTRICT_NAMES = []
let NUM_DISTRICTS = districtsData.length

for (const d of districtsData) {
  DISTRICT_COLORS[d.id] = parseInt(d.color_3d, 16)
  DISTRICT_COLORS_HEX[d.id] = d.color_hex
  DISTRICT_NAMES.push(d.name)
}

const PARTY_NAMES = ['Fortschritt', 'Mitte', 'Tradition', 'Unabhängige']

const EDUCATION_LABELS = ['Keine', 'Grundbildung', 'Höhere Bildung', 'Akademisch']

const AGE_GROUP_LABELS = ['Jung', 'Mittel', 'Älter']

/**
 * Initialize district metadata from server status response.
 * Call this once after connecting to the server.
 */
export function initDistrictMetadata(districts) {
  if (!districts || !Array.isArray(districts) || districts.length === 0) return

  NUM_DISTRICTS = districts.length
  DISTRICT_NAMES = districts.map(d => d.name)
  DISTRICT_COLORS = {}
  DISTRICT_COLORS_HEX = {}
  for (const d of districts) {
    DISTRICT_COLORS[d.id] = d.color_3d
    DISTRICT_COLORS_HEX[d.id] = d.color_hex
  }
}

/**
 * Convert a SocietySnapshot to a world-state object
 * that the WorldViewer can render.
 */
export function snapshotToGeneration(snapshot) {
  // Accept both keys for compatibility (prefer "blobs", fall back to "globs")
  const rawBlobs = snapshot && (snapshot.blobs || snapshot.globs)
  if (!rawBlobs) {
    return null
  }

  const schedules = snapshot.daily_schedules || {}
  const blobs = rawBlobs.map(g => {
    const adapted = adaptBlob(g)
    // Attach server-generated daily schedule if available
    // Schedule entries include building_id for each activity
    adapted.server_schedule = schedules[g.id] || null
    return adapted
  })

  return {
    steps: 1 // animation handled per-frame in blob.js
    , blobs
  }
}

/**
 * Adapt a single server Blob to the frontend entity format.
 */
function adaptBlob(blob) {
  const x = blob.pos.x !== undefined ? blob.pos.x : (blob.pos[0] || 0)
  const y = blob.pos.y !== undefined ? blob.pos.y : (blob.pos[1] || 0)
  const hx = blob.home_pos ? (blob.home_pos.x !== undefined ? blob.home_pos.x : (blob.home_pos[0] || x)) : x
  const hy = blob.home_pos ? (blob.home_pos.y !== undefined ? blob.home_pos.y : (blob.home_pos[1] || y)) : y

  // Visual size based on income (subtle: 8-12 range)
  // Normalize EUR income (800-7000) to 1-10 scale for visual sizing
  const incomeNorm = blob.income > 100 ? ((blob.income - 800) / 688 + 1) : (blob.income || 5)
  const visualSize = 8 + (incomeNorm - 1) * 0.4

  // Social range based on education
  const socialRange = 15 + blob.education_level * 5

  return {
    id: blob.id
    , species: 'district_' + blob.district
    , state: 'ACTIVE'
    , pos: [x, y]
    , home_pos: [hx, hy]
    , movement_history: [[x, y]] // server position; smooth animation in creature.js
    , age: blob.age || blob.age_group || 30
    , size: [visualSize, 0.2]
    , sense_range: [socialRange, 0.3]
    // Blobtopia-specific fields (for tooltip/inspection)
    , district: blob.district
    , district_name: DISTRICT_NAMES[blob.district] || 'Unbekannt'
    , education_level: blob.education_level
    , education_label: EDUCATION_LABELS[blob.education_level] || '?'
    , income: blob.income
    , age_group: blob.age != null ? (blob.age < 30 ? 0 : blob.age < 60 ? 1 : 2) : (blob.age_group || 1)
    , age_years: blob.age || blob.age_group || 30
    , age_label: (blob.age != null ? (blob.age + ' J.') : AGE_GROUP_LABELS[blob.age_group] || '?')
    , attitudes: blob.attitudes
    , political_state: blob.political_state
    , party_name: blob.political_state && blob.political_state.party_affiliation != null
        ? PARTY_NAMES[blob.political_state.party_affiliation] : 'Keine'
    , latent_traits: blob.latent_traits
    , emotion: blob.emotion || { valence: 0, arousal: 0, label: 'gelassen', icon: 'calm' }
    // Name & Job
    , name: blob.name || null
    , job: blob.job || null
    // Building assignments (from server, persistent)
    , home_building_id: blob.home_building_id || null
    , workplace_id: blob.workplace_id || null
    , lunch_spot_id: blob.lunch_spot_id || null
    , leisure_spot_id: blob.leisure_spot_id || null
    // Household
    , household_id: blob.household_id || null
  }
}

/**
 * Aggregate real statistics from snapshot data.
 */
export function snapshotToStatistics(snapshot) {
  // Accept both keys for compatibility (prefer "blobs", fall back to "globs")
  const rawBlobs = snapshot && (snapshot.blobs || snapshot.globs)
  if (!rawBlobs) {
    return null
  }

  const blobs = rawBlobs
  const n = blobs.length

  // Per-district aggregation (dynamic — uses NUM_DISTRICTS)
  const districtStats = {}
  for (let d = 0; d < NUM_DISTRICTS; d++) {
    const inDistrict = blobs.filter(g => g.district === d)
    const count = inDistrict.length
    if (count === 0) {
      districtStats[d] = { count: 0, name: DISTRICT_NAMES[d], avgSatisfaction: 0, avgIdeology: 0 }
      continue
    }
    const avg = (arr, fn) => arr.reduce((s, g) => s + fn(g), 0) / arr.length
    districtStats[d] = {
      count
      , name: DISTRICT_NAMES[d]
      , avgSatisfaction: Math.round(avg(inDistrict, g => g.attitudes.political_satisfaction) * 100) / 100
      , avgIdeology: Math.round(avg(inDistrict, g => g.attitudes.ideology) * 100) / 100
      , avgTrust: Math.round(avg(inDistrict, g => g.attitudes.institutional_trust) * 100) / 100
      , avgIncome: Math.round(avg(inDistrict, g => g.income) * 100) / 100
    }
  }

  // Ideology distribution (buckets from 1 to 10)
  const ideologyBuckets = new Array(10).fill(0) // index 0 = 1, index 9 = 10
  blobs.forEach(g => {
    const bucket = Math.round(g.attitudes.ideology - 1)
    const clamped = Math.max(0, Math.min(9, bucket))
    ideologyBuckets[clamped]++
  })

  return {
    num_generations: snapshot.tick + 1
    , population: { mean: n, deviation: 0, sum: n, size: 1, max: n, min: n }
    , districtStats
    , ideologyBuckets
    , tick: snapshot.tick
    , year: snapshot.year
  }
}

export { DISTRICT_COLORS, DISTRICT_COLORS_HEX, DISTRICT_NAMES, PARTY_NAMES, EDUCATION_LABELS, AGE_GROUP_LABELS, NUM_DISTRICTS }
