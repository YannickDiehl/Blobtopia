/**
 * film-wander.js — Deterministic waypoint-based wandering for Film Mode.
 *
 * Replaces sine-wave idle drift with natural walk → pause → walk cycles.
 * All output is a pure function of (time, seed, phase) — no mutable state,
 * no Math.random(), safe for timeline scrubbing.
 *
 * Technique: "Random Waypoint Patrol" (as used in Cities: Skylines, The Sims, GTA crowds)
 */

import { mulberry32 } from '@/city/constants'
import { walkableGrid } from '@/city'

// Smoothstep easing: natural acceleration and deceleration
function smoothstep (t) {
  return t * t * (3 - 2 * t)
}

/**
 * Generate a deterministic walkable waypoint near an anchor position.
 *
 * Uses the blob's seed + cycle index to create a unique RNG,
 * then picks a point in polar coordinates within the wander radius.
 * Snaps to the nearest walkable grid cell (prefers Gehwege over roads).
 *
 * Cost: ~1 RNG creation + 1 grid lookup + BFS fallback (~64 cells max) ≈ 500ns
 */
function generateWaypoint (anchorX, anchorZ, seed, cycleIndex, radius) {
  const rng = mulberry32(seed * 7919 + cycleIndex * 104729)

  if (!walkableGrid.grid) {
    // No grid: simple polar offset
    const angle = rng() * Math.PI * 2
    const dist = Math.sqrt(rng()) * radius
    return { x: anchorX + Math.cos(angle) * dist, z: anchorZ + Math.sin(angle) * dist }
  }

  const { grid, size, gridRes } = walkableGrid
  const gcx = Math.floor(anchorX / gridRes)
  const gcz = Math.floor(anchorZ / gridRes)
  const gr = Math.max(1, Math.ceil(radius / gridRes))

  // Collect ALL walkable cells within the wander radius (circular)
  // Weight: Gehwege (2) = 10, roads (1) = 2, others = 0
  const candidates = []
  let totalWeight = 0
  for (let dx = -gr; dx <= gr; dx++) {
    for (let dz = -gr; dz <= gr; dz++) {
      if (dx * dx + dz * dz > gr * gr) continue // circular radius
      const nx = gcx + dx, nz = gcz + dz
      if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
        const v = grid[nz * size + nx]
        if (v === 1 || v === 2) {
          const weight = v === 2 ? 10 : 2
          totalWeight += weight
          candidates.push({ gx: nx, gz: nz, weight })
        }
      }
    }
  }

  if (candidates.length === 0) return { x: anchorX, z: anchorZ }

  // Weighted random pick from all walkable candidates
  let roll = rng() * totalWeight
  let pick = candidates[candidates.length - 1]
  for (const c of candidates) {
    roll -= c.weight
    if (roll <= 0) { pick = c; break }
  }

  // Sub-cell jitter so blobs don't stand at grid-cell centers
  const jx = (rng() - 0.5) * gridRes * 0.6
  const jz = (rng() - 0.5) * gridRes * 0.6
  return { x: pick.gx * gridRes + gridRes / 2 + jx, z: pick.gz * gridRes + gridRes / 2 + jz }
}

/**
 * Compute a deterministic wander position for a blob in film mode.
 *
 * Given an anchor point (keyframe destination), this produces natural-looking
 * walk → pause → walk cycles without any mutable state.
 *
 * @param {number} anchorX    - Center of wander area (world X)
 * @param {number} anchorZ    - Center of wander area (world Z)
 * @param {number} time       - Deterministic time (tick * 24 + hour + frac)
 * @param {number} phase      - Blob-unique phase offset (0–2π)
 * @param {number} seed       - Blob-unique integer seed
 * @param {number} speed      - Blob wander speed (0.2–0.4)
 * @param {number} radius     - Wander radius in world units
 * @returns {{ x, z, walking, dirX, dirZ }}
 */
export function computeWanderPosition (anchorX, anchorZ, time, phase, seed, speed, radius) {
  // Per-blob cycle timing: faster blobs have shorter cycles
  const speedFactor = 0.8 + speed * 0.8 // 0.96–1.12
  const cycleDuration = (0.18 + (phase / (Math.PI * 2)) * 0.22) / speedFactor
  const pauseFraction = 0.2 + (phase / (Math.PI * 2)) * 0.15 // 20–35% of cycle

  // Which cycle are we in?
  const cycleIndex = Math.floor(time / cycleDuration)
  const cycleProgress = (time % cycleDuration) / cycleDuration // 0.0–1.0

  // Generate the previous and current waypoints
  const wpPrev = generateWaypoint(anchorX, anchorZ, seed, cycleIndex - 1, radius)
  const wpCurr = generateWaypoint(anchorX, anchorZ, seed, cycleIndex, radius)

  const walkEnd = 1.0 - pauseFraction

  if (cycleProgress <= walkEnd) {
    // ── Walk phase: smoothstep interpolation from previous to current waypoint ──
    const t = smoothstep(cycleProgress / walkEnd)
    return {
      x: wpPrev.x + (wpCurr.x - wpPrev.x) * t
      ,z: wpPrev.z + (wpCurr.z - wpPrev.z) * t
      ,walking: true
      ,dirX: wpCurr.x - wpPrev.x
      ,dirZ: wpCurr.z - wpPrev.z,
    }
  } else {
    // ── Pause phase: stand still, slowly look around ──
    return {
      x: wpCurr.x
      ,z: wpCurr.z
      ,walking: false
      ,dirX: Math.sin(time * 0.3 + phase)
      ,dirZ: Math.cos(time * 0.3 + phase),
    }
  }
}
