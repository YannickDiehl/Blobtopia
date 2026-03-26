import { ACTIVITY_MAP, buildSchedule } from './blob-schedule'
import { walkableGrid } from '@/city'
import { randomWalkableNear } from '@/lib/pathfinder'

// ── Outdoor leisure zones: named areas with real city coordinates ──
// Each zone is a walkable outdoor area where blobs go for leisure/lunch.
// Zone choice is driven by latent construct values.
export const OUTDOOR_ZONES = [
  {
    id: 'steinweg_park',
    name: 'Steinweg-Park',
    x: 368, z: 528, // Center of stone path area in Grüntal
    walkRadius: 200,
    microWalk: { radius: 200, intervalMs: 30000 },  // wide, gentle wandering
    district: 0, // Grüntal
    // Postmaterialists prefer nature/parks
    weights: (t) => {
      const envOverEcon = t.environment_over_economy || 5
      const freedom = t.freedom_over_order || 5
      const econPriority = t.economic_security_priority || 5
      return (envOverEcon * 0.4) + (freedom * 0.3) + ((10 - econPriority) * 0.3)
    }
  },
  {
    id: 'hafenpromenade',
    name: 'Hafenpromenade',
    x: 848, z: 752, // North edge of harbor basin — pavement row z=752, x=720-976
    walkRadius: 150,
    microWalk: { radius: 150, intervalMs: 30000 },
    district: 2,
    // Social evening stroll along the harbor — high base weight
    weights: (t) => {
      const community = t.community_participation || 5
      const neighborTrust = t.neighbor_trust || 5
      const genTrust = t.generalized_trust || 5
      return 3 + (community * 0.35) + (neighborTrust * 0.2) + (genTrust * 0.2)
    }
  },
  {
    id: 'hafenufer-west',
    name: 'Westliches Hafenufer',
    x: 720, z: 864, // West edge of harbor basin — pavement column x=720, z=752-976
    walkRadius: 130,
    microWalk: { radius: 130, intervalMs: 35000 },
    district: 2,
    // Nature-loving, relaxed blobs walk along the waterfront
    weights: (t) => {
      const envOverEcon = t.environment_over_economy || 5
      const lowPowerless = 10 - (t.powerlessness || 5)
      const community = t.community_participation || 5
      return 2 + (envOverEcon * 0.3) + (lowPowerless * 0.2) + (community * 0.25)
    }
  },
  {
    id: 'laternenstrasse',
    name: 'Laternenstraße',
    x: 500, z: 720, // Lantern-lit promenade street z=720, x=272-720
    walkRadius: 230,
    microWalk: { radius: 230, intervalMs: 30000 },
    district: 2,
    // Evening flaneurs under the lanterns
    weights: (t) => {
      const community = t.community_participation || 5
      const genTrust = t.generalized_trust || 5
      return 1 + (community * 0.3) + (genTrust * 0.25)
    }
  },
  {
    id: 'marktplatz',
    name: 'Marktplatz',
    x: 528, z: 560, // Central civic area near Rathaus
    walkRadius: 120,
    microWalk: { radius: 120, intervalMs: 40000 },
    district: -1, // Any district (central)
    // Reduced weight — LEISURE server-schedule already sends many blobs here
    weights: (t) => {
      const econPriority = t.economic_security_priority || 5
      const community = t.community_participation || 5
      return (econPriority * 0.2) + (community * 0.25)
    }
  },
  {
    id: 'flussufer',
    name: 'Flussufer',
    x: 340, z: 400, // Along river mid-section
    walkRadius: 180,
    microWalk: { radius: 180, intervalMs: 40000 },  // riverside stroll
    district: -1, // Any district (runs through city)
    // Satisfied, low-alienation blobs enjoy nature
    weights: (t) => {
      const lowPowerless = 10 - (t.powerlessness || 5)
      const lowComplexity = 10 - (t.political_complexity || 5)
      const envOverEcon = t.environment_over_economy || 5
      return (lowPowerless * 0.4) + (lowComplexity * 0.3) + (envOverEcon * 0.3)
    }
  },
  {
    id: 'ringstrassen_allee',
    name: 'Ringstraßen-Allee',
    x: 688, z: 176, // Tree-lined ring road spine
    walkRadius: 300,
    microWalk: { radius: 300, intervalMs: 25000 },  // jogging, fast movement
    district: -1, // Any district
    // Young, self-efficacious, non-conformist blobs
    weights: (t, blob) => {
      const selfEff = t.self_efficacy || 5
      const youthFactor = (blob.age_group === 0) ? 8 : (blob.age_group === 1) ? 5 : 3
      const lowObedience = 10 - (t.obedience_value || 5)
      return (selfEff * 0.3) + (youthFactor * 0.4) + (lowObedience * 0.2)
    }
  }
]

/**
 * Choose an outdoor zone based on blob's latent trait values.
 * Uses weighted random selection: higher construct match = higher probability.
 * @param {object} blob - creature data
 * @param {Function} rng - deterministic RNG
 * @returns {object} chosen outdoor zone
 */
export function chooseOutdoorZone(blob, rng) {
  // Traits are flat on the blob object: blob.latent_traits.self_efficacy etc.
  const t = blob.latent_traits || {}

  const weights = OUTDOOR_ZONES.map(zone => Math.max(0.5, zone.weights(t, blob)))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  let roll = rng() * totalWeight
  for (let i = 0; i < OUTDOOR_ZONES.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return OUTDOOR_ZONES[i]
  }
  return OUTDOOR_ZONES[0]
}

// ── Building label patterns for matching named venues ──
const SHOP_PATTERNS = /supermarkt|bäckerei|bioladen|spätkauf|apotheke|fischmarkt|blumenladen|schreibwaren|imbiss|friseur|reinigung|optiker|tabakladen|schlüsseldienst|waschsalon|hofladen|kräuterladen|laden|geschäft|markt/i
const SOCIAL_PATTERNS = /café|kneipe|restaurant|hafencafé|konditorei|teehaus|weinbar|bar|bistro/i

/**
 * Find nearest building whose label matches a pattern.
 * @param {number} x
 * @param {number} z
 * @param {Array} registry
 * @param {RegExp} pattern
 * @returns {{x: number, z: number}|null}
 */
export function findNearestLabeledBuilding(x, z, registry, pattern) {
  let bestDist = Infinity
  let bestB = null
  for (const b of registry) {
    if (!b.label || !pattern.test(b.label)) continue
    const dx = b.x - x
    const dz = b.z - z
    const d = dx * dx + dz * dz
    if (d < bestDist) { bestDist = d; bestB = b }
  }
  return bestB ? { x: bestB.x, z: bestB.z } : null
}

/**
 * Snap a world position to the nearest road (1) or Gehweg (2) grid cell.
 * Returns the original position if already on a valid cell or grid not loaded.
 */
function snapToPath(x, z) {
  if (!walkableGrid.grid) return { x, z }
  const { grid, size, gridRes } = walkableGrid
  const gx = Math.floor(x / gridRes)
  const gz = Math.floor(z / gridRes)
  if (gx >= 0 && gx < size && gz >= 0 && gz < size) {
    const v = grid[gz * size + gx]
    if (v === 1 || v === 2) return { x, z }
  }
  for (let r = 1; r <= 15; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const nx = gx + dx, nz = gz + dz
        if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
          const v = grid[nz * size + nx]
          if (v === 1 || v === 2) return { x: nx * gridRes + gridRes / 2, z: nz * gridRes + gridRes / 2 }
        }
      }
    }
    for (let dz = -r + 1; dz < r; dz++) {
      for (const dx of [-r, r]) {
        const nx = gx + dx, nz = gz + dz
        if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
          const v = grid[nz * size + nx]
          if (v === 1 || v === 2) return { x: nx * gridRes + gridRes / 2, z: nz * gridRes + gridRes / 2 }
        }
      }
    }
  }
  return { x, z }
}

/**
 * Find a building by ID in the registry.
 * @param {string|number} id
 * @param {Array} registry
 * @returns {object|null}
 */
export function findBuildingById(id, registry){
  if (id == null) return null
  return registry.find(b => b.id === id) || null
}

/**
 * Find the nearest building matching a filter function.
 * Falls back to nearest non-landmark building if no match.
 * @param {number} x
 * @param {number} z
 * @param {Array} registry
 * @param {Function} [filterFn]
 * @returns {{x: number, z: number}|null}
 */
export function findNearestBuilding(x, z, registry, filterFn){
  let bestDist = Infinity
  let bestB = null
  for (const b of registry) {
    if (filterFn && !filterFn(b)) continue
    const dx = b.x - x
    const dz = b.z - z
    const d = dx * dx + dz * dz
    if (d < bestDist) { bestDist = d; bestB = b }
  }
  if (!bestB) {
    // Relax filter — find ANY nearest building
    for (const b of registry) {
      if (b.type === 'landmark') continue
      const dx = b.x - x
      const dz = b.z - z
      const d = dx * dx + dz * dz
      if (d < bestDist) { bestDist = d; bestB = b }
    }
  }
  return bestB ? { x: bestB.x, z: bestB.z } : null
}

/**
 * Resolve a building's {x, z} position by ID.
 * @param {string|number} buildingId
 * @param {Array} registry
 * @returns {{x: number, z: number}|null}
 */
export function resolveBuildingPos(buildingId, registry){
  if (buildingId == null) return null
  const b = registry.find(b => b.id === buildingId)
  return b ? { x: b.x, z: b.z } : null
}

/**
 * Find the civic building (parliament or central_square) for protests.
 * @param {Array} registry
 * @returns {{x: number, z: number}|null}
 */
export function findCivicBuilding(registry){
  const civic = registry.find(b =>
    b.functional_type === 'parliament' || b.functional_type === 'central_square'
  )
  return civic ? { x: civic.x, z: civic.z } : null
}

/**
 * Assign all location data, schedule, and individual traits for a blob.
 *
 * @param {object} blob - creature data object
 * @param {number} phase - unique per-blob phase (0–2π)
 * @param {Array} registry - buildingRegistry
 * @param {number} serverX - server sim x (world-scaled)
 * @param {number} serverY - server sim y (world-scaled)
 * @returns {{
 *   homeBuilding: {x,z}, workplace: {x,z}, lunchSpot: {x,z}, leisureSpot: {x,z},
 *   schedule: Array, wanderSpeed: number, wanderRadius: number, commuteMaxDist: number,
 *   blobName: string|null
 * }}
 */
export function assignLocations(blob, phase, registry, serverX, serverY, rng){
  rng = rng || Math.random  // Backward-compatible for live mode
  const c = blob
  const edu = c.education_level || 0  // 0-3
  const income = c.income > 100 ? ((c.income - 800) / 688 + 1) : (c.income || 5) // normalize EUR→1-10
  const ageGroup = c.age_group || 1   // 0=young, 1=middle, 2=older
  const district = c.district         // 0-4

  // ── Individual pace: young + fit = faster, older = slower ──
  const ageFactor = ageGroup === 0 ? 1.1 : ageGroup === 2 ? 0.7 : 0.9
  const wanderSpeed = (0.3 + rng() * 0.3) * ageFactor

  // ── Commute distance: higher income → can afford longer commute ──
  const commuteMaxDist = 300 + income * 60  // 360–900

  // ── Wander radius: social capital + education → more mobile ──
  const socialCapital = c.latent_traits
    ? (c.latent_traits.social_capital || {}).community_participation || 5
    : 5
  const wanderRadius = 50 + socialCapital * 8 + edu * 15 // 50–190

  // ── Home building ──
  const serverHome = findBuildingById(c.home_building_id, registry)
  let homeBuilding
  if (serverHome) {
    homeBuilding = { x: serverHome.x, z: serverHome.z }
  } else {
    // Legacy fallback: nearest building in district
    const HOME_TYPES = { 0: 'villa', 1: 'rowhouse', 2: 'apartment', 3: 'rowhouse', 4: 'factory' }
    const preferredHome = HOME_TYPES[district] || 'rowhouse'
    homeBuilding = findNearestBuilding(serverX, serverY, registry, b => {
      if (b.type === 'landmark') return false
      if (b.type === preferredHome && b.district === district) return true
      if (b.district === district) return true
      return false
    }) || { x: serverX, z: serverY }
  }

  // ── Workplace ──
  const serverWork = findBuildingById(c.workplace_id, registry)
  let workplace
  if (serverWork) {
    workplace = { x: serverWork.x, z: serverWork.z }
  } else {
    // Legacy fallback
    const WORK_TYPES = {
      3: ['landmark', 'apartment']
      , 2: ['apartment', 'rowhouse']
      , 1: ['rowhouse', 'factory']
      , 0: ['factory', 'villa']
    }
    const workTypes = WORK_TYPES[edu] || ['rowhouse']
    let workCandidates = registry.filter(b => {
      if (!workTypes.includes(b.type)) return false
      const dx = b.x - homeBuilding.x
      const dz = b.z - homeBuilding.z
      const d = Math.sqrt(dx * dx + dz * dz)
      return d > 30 && d < commuteMaxDist
    })
    if (workCandidates.length > 0) {
      const idx = Math.floor(phase / (Math.PI * 2) * workCandidates.length) % workCandidates.length
      const pick = workCandidates[idx]
      workplace = { x: pick.x, z: pick.z }
    } else {
      workplace = { x: 900 + phase * 30, z: 900 + phase * 30 }
    }
  }

  // ── Shop & Social spots: nearest labeled buildings ──
  const homeX = homeBuilding.x, homeZ = homeBuilding.z
  const shopSpot = findNearestLabeledBuilding(homeX, homeZ, registry, SHOP_PATTERNS)
  const socialSpot = findNearestLabeledBuilding(homeX, homeZ, registry, SOCIAL_PATTERNS)

  // ── Lunch spot: diversified (outdoor / restaurant / near workplace) ──
  const serverLunch = findBuildingById(c.lunch_spot_id, registry)
  let lunchSpot
  let lunchOutdoor = false
  const traits = c.latent_traits || {}
  const envOverEcon = traits.environment_over_economy || 5
  const lunchRoll = rng()
  // ~30% outdoor lunch (postmaterialist), ~15% restaurant (high income/social), rest near work
  const outdoorThreshold = 0.15 + (envOverEcon / 10) * 0.3  // 0.15–0.45
  const restaurantThreshold = outdoorThreshold + (income > 6 || socialCapital > 6 ? 0.15 : 0.05)
  if (lunchRoll < outdoorThreshold) {
    const lunchZone = chooseOutdoorZone(c, rng)
    const lunchRwn = randomWalkableNear(lunchZone.x, lunchZone.z, lunchZone.walkRadius, walkableGrid, rng)
    lunchSpot = lunchRwn || snapToPath(lunchZone.x, lunchZone.z)
    lunchOutdoor = true
  } else if (lunchRoll < restaurantThreshold && socialSpot) {
    lunchSpot = socialSpot  // Lunch at café/restaurant
  } else if (serverLunch) {
    lunchSpot = { x: serverLunch.x, z: serverLunch.z }
  } else {
    const lunchNearWork = randomWalkableNear(workplace.x, workplace.z, 80, walkableGrid, rng)
    lunchSpot = lunchNearWork || { x: workplace.x, z: workplace.z }
  }

  // ── Leisure spot: outdoor zones driven by latent constructs ──
  let leisureSpot
  let leisureZone = null
  leisureZone = chooseOutdoorZone(c, rng)
  const rwn = randomWalkableNear(leisureZone.x, leisureZone.z, leisureZone.walkRadius, walkableGrid, rng)
  leisureSpot = rwn || snapToPath(leisureZone.x, leisureZone.z)

  // ── Daily schedule: use server-provided if available ──
  let schedule
  if (c.server_schedule && c.server_schedule.entries) {
    schedule = c.server_schedule.entries.map(e => ({
      hour: e.hour
      , state: ACTIVITY_MAP[e.activity] || 'SLEEPING'
      , building_id: e.building_id != null ? e.building_id : null
    }))
  } else {
    schedule = buildSchedule(phase, ageGroup, edu, income, district, c)
  }

  // ── Schedule enrichment: diversify evening leisure into shop/social/outdoor ──
  // Replace some GO_TO_LEISURE entries with GO_TO_SHOP or GO_TO_SOCIAL
  const econPriority = traits.economic_security_priority || 5
  const communityPart = traits.community_participation || 5
  for (let i = 0; i < schedule.length; i++) {
    if (schedule[i].state !== 'GO_TO_LEISURE') continue
    const diverseRoll = rng()
    // Construct-modulated thresholds
    const shopChance = 0.15 + (econPriority / 10) * 0.2       // 0.15–0.35
    const socialChance = shopChance + 0.1 + (communityPart / 10) * 0.2  // +0.1–0.3
    if (diverseRoll < shopChance && shopSpot) {
      schedule[i] = { ...schedule[i], state: 'GO_TO_SHOP' }
    } else if (diverseRoll < socialChance && socialSpot) {
      schedule[i] = { ...schedule[i], state: 'GO_TO_SOCIAL' }
    }
    // else: stays GO_TO_LEISURE (outdoor zone)
  }

  const blobName = c.name || null

  return {
    homeBuilding, workplace, lunchSpot, leisureSpot,
    shopSpot, socialSpot,
    leisureZone, lunchOutdoor,
    schedule, wanderSpeed, wanderRadius, commuteMaxDist, blobName
  }
}
