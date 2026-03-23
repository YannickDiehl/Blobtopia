import { ACTIVITY_MAP, buildSchedule } from './blob-schedule'

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

  // ── Lunch spot ──
  const serverLunch = findBuildingById(c.lunch_spot_id, registry)
  let lunchSpot
  if (serverLunch) {
    lunchSpot = { x: serverLunch.x, z: serverLunch.z }
  } else {
    if (income > 6) {
      lunchSpot = { x: 960 + rng() * 80, z: 920 + rng() * 80 }
    } else if (socialCapital > 6) {
      lunchSpot = { x: 1000 + rng() * 60, z: 840 + rng() * 60 }
    } else {
      const lx = workplace.x + (rng() - 0.5) * 60
      const lz = workplace.z + (rng() - 0.5) * 60
      lunchSpot = { x: lx, z: lz }
    }
  }

  // ── Leisure spot ──
  const serverLeisure = findBuildingById(c.leisure_spot_id, registry)
  let leisureSpot
  if (serverLeisure) {
    leisureSpot = { x: serverLeisure.x, z: serverLeisure.z }
  } else {
    const LEISURE_TYPES = ['park', 'sports_facility', 'bar', 'cafe', 'central_square', 'library']
    const leisureB = findNearestBuilding(
      homeBuilding.x, homeBuilding.z, registry,
      b => LEISURE_TYPES.includes(b.functional_type)
    )
    if (leisureB) {
      leisureSpot = { x: leisureB.x, z: leisureB.z }
    } else {
      leisureSpot = homeBuilding
    }
  }

  // ── Daily schedule: use server-provided if available ──
  let schedule
  if (c.server_schedule && c.server_schedule.entries) {
    schedule = c.server_schedule.entries.map(e => ({
      hour: e.hour
      , state: ACTIVITY_MAP[e.activity] || 'SLEEPING'
      , building_id: e.building_id != null ? e.building_id : null
    }))
  } else {
    // Legacy fallback: client-side schedule generation
    schedule = buildSchedule(phase, ageGroup, edu, income, district, c)
  }

  // Nametag
  const blobName = c.name || null

  return {
    homeBuilding, workplace, lunchSpot, leisureSpot,
    schedule, wanderSpeed, wanderRadius, commuteMaxDist, blobName
  }
}
