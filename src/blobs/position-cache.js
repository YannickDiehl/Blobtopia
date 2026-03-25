/**
 * position-cache.js — Deterministic keyframe computation and path interpolation
 * for Film-Modus (timeline playback).
 *
 * Exports:
 *   computeHourPositions(schedule, locations, registry) → Array<24> of keyframes
 *   interpolateAlongPath(path, fraction) → {x, z}
 *   getCachedPath(fromX, fromZ, toX, toZ, walkableGrid) → [{x,z}]
 *   clearPathCache() — clear cached paths (e.g. on city reload)
 */

import { findPath } from '@/lib/pathfinder'
import { resolveBuildingPos } from './blob-locations'
import { walkableGrid } from '@/city'

// ── Module-level path cache ──
// Key: "x1,z1→x2,z2" (rounded to grid resolution for dedup)
// Value: [{x, z}] waypoints
const pathCache = new Map()
const CACHE_ROUND = 8  // Round coords to nearest 8 for cache key dedup

function pathKey (x1, z1, x2, z2) {
  const r = CACHE_ROUND
  return `${Math.round(x1 / r) * r},${Math.round(z1 / r) * r}→${Math.round(x2 / r) * r},${Math.round(z2 / r) * r}`
}

/**
 * Get or compute a cached A* path between two world positions.
 */
export function getCachedPath (fromX, fromZ, toX, toZ, walkableGrid) {
  const key = pathKey(fromX, fromZ, toX, toZ)
  if (pathCache.has(key)) return pathCache.get(key)

  const path = findPath(fromX, fromZ, toX, toZ, walkableGrid)
  pathCache.set(key, path)
  return path
}

export function clearPathCache () {
  pathCache.clear()
}

/**
 * States where the blob is indoors (invisible).
 */
const INDOOR_STATES = new Set(['SLEEPING', 'AT_WORK'])

/**
 * States where the blob is in transit (walking between buildings).
 */
const TRANSIT_STATES = new Set([
  'GO_TO_WORK', 'GO_TO_HOME', 'GO_TO_LUNCH',
  'GO_TO_SHOP', 'GO_TO_SOCIAL', 'GO_TO_LEISURE', 'GO_TO_STROLL', 'GO_TO_PROTEST'
])

/**
 * Map GO_TO_* → target location key in the locations object.
 */
const TRANSIT_TARGET = {
  'GO_TO_WORK': 'workplace',
  'GO_TO_HOME': 'homeBuilding',
  'GO_TO_LUNCH': 'lunchSpot',
  'GO_TO_SHOP': 'shopSpot',
  'GO_TO_SOCIAL': 'socialSpot',
  'GO_TO_LEISURE': 'leisureSpot',
  'GO_TO_STROLL': 'leisureSpot',   // stroll uses outdoor zone; fallback to leisure
  'GO_TO_PROTEST': 'leisureSpot',  // fallback; schedule building_id preferred
}

/**
 * Map AT_* → location key for idle position.
 */
const IDLE_LOCATION = {
  'AT_WORK': 'workplace',
  'AT_HOME': 'homeBuilding',
  'AT_LUNCH': 'lunchSpot',
  'AT_SHOP': 'shopSpot',
  'AT_SOCIAL': 'socialSpot',
  'AT_LEISURE': 'leisureSpot',
  'AT_STROLL': 'leisureSpot',
  'AT_PROTEST': 'leisureSpot',
}

/**
 * Compute keyframe positions for all 24 hours based on the blob's schedule.
 *
 * @param {Array<{hour, state, building_id}>} schedule - sorted by hour
 * @param {{homeBuilding, workplace, lunchSpot, leisureSpot}} locations
 * @param {Array} registry - buildingRegistry for resolving building_id
 * @returns {Array<{x, z, state, indoor}>} — 24 entries, one per hour
 */
export function computeHourPositions (schedule, locations, registry) {
  const positions = new Array(24)

  for (let h = 0; h < 24; h++) {
    // Find active schedule entry for this hour
    let active = schedule[0]
    for (const entry of schedule) {
      if (h >= entry.hour) active = entry
      else break
    }

    const state = active.state
    const indoor = INDOOR_STATES.has(state)

    // Resolve position: prefer schedule's building_id, then fallback to assigned locations
    let pos = null
    if (active.building_id != null) {
      pos = resolveBuildingPos(active.building_id, registry)
    }

    if (!pos) {
      if (TRANSIT_STATES.has(state)) {
        // For transit states, the keyframe position is the START of transit
        // (the blob hasn't arrived yet). We use the previous hour's position.
        // Find what position the blob was at before this transit started.
        const targetKey = TRANSIT_TARGET[state]
        const target = locations[targetKey]
        // For the keyframe, we store the TARGET — interpolation handles the in-between
        pos = target || locations.homeBuilding
      } else if (IDLE_LOCATION[state]) {
        pos = locations[IDLE_LOCATION[state]]
      } else {
        // SLEEPING or unknown — use home
        pos = locations.homeBuilding
      }
    }

    // Snap outdoor positions to nearest road/Gehweg cell so blobs don't stand on grass
    let fx = pos ? pos.x : 0
    let fz = pos ? pos.z : 0
    if (!indoor && walkableGrid.grid) {
      const { grid, size, gridRes } = walkableGrid
      const gx = Math.floor(fx / gridRes)
      const gz = Math.floor(fz / gridRes)
      if (gx >= 0 && gx < size && gz >= 0 && gz < size) {
        const cv = grid[gz * size + gx]
        if (cv !== 1 && cv !== 2) {
          // BFS for nearest road (1) or Gehweg (2) cell
          for (let r = 1; r <= 10; r++) {
            let found = false
            for (let dx = -r; dx <= r && !found; dx++) {
              for (const dz of [-r, r]) {
                const nx = gx + dx, nz = gz + dz
                if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
                  const v = grid[nz * size + nx]
                  if (v === 1 || v === 2) { fx = nx * gridRes + gridRes / 2; fz = nz * gridRes + gridRes / 2; found = true; break }
                }
              }
            }
            if (!found) {
              for (let dz = -r + 1; dz < r && !found; dz++) {
                for (const dx of [-r, r]) {
                  const nx = gx + dx, nz = gz + dz
                  if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
                    const v = grid[nz * size + nx]
                    if (v === 1 || v === 2) { fx = nx * gridRes + gridRes / 2; fz = nz * gridRes + gridRes / 2; found = true; break }
                  }
                }
              }
            }
            if (found) break
          }
        }
      }
    }
    positions[h] = {
      x: fx,
      z: fz,
      state,
      indoor
    }
  }

  return positions
}

/**
 * Interpolate a position along a path at a given fraction (0–1).
 *
 * @param {Array<{x, z}>} path - waypoints
 * @param {number} fraction - 0.0 = start, 1.0 = end
 * @returns {{x: number, z: number}}
 */
export function interpolateAlongPath (path, fraction) {
  if (!path || path.length === 0) return { x: 0, z: 0 }
  if (path.length === 1 || fraction <= 0) return { x: path[0].x, z: path[0].z }
  if (fraction >= 1) {
    const last = path[path.length - 1]
    return { x: last.x, z: last.z }
  }

  // Compute total path length
  let totalLen = 0
  const segLens = []
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x
    const dz = path[i].z - path[i - 1].z
    const len = Math.sqrt(dx * dx + dz * dz)
    segLens.push(len)
    totalLen += len
  }

  if (totalLen === 0) return { x: path[0].x, z: path[0].z }

  // Find position at fraction of total length
  let targetDist = fraction * totalLen
  for (let i = 0; i < segLens.length; i++) {
    if (targetDist <= segLens[i]) {
      const t = segLens[i] > 0 ? targetDist / segLens[i] : 0
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        z: path[i].z + (path[i + 1].z - path[i].z) * t
      }
    }
    targetDist -= segLens[i]
  }

  // Fallback: return last point
  const last = path[path.length - 1]
  return { x: last.x, z: last.z }
}
