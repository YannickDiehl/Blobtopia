/**
 * building-registry.js — Mutable singleton registry for buildings and walkable grid
 */

// ── Walkable Grid (exported for pathfinding) ────────────────
// Populated by createCity() — grid cells with value 1 are walkable (road surface).
export const walkableGrid = { grid: null, size: 0, gridRes: 16 }
if (typeof window !== 'undefined') window.__wg = walkableGrid  // debug access

// ── Building Registry ────────────────────────────────────────
export const buildingRegistry = []
export let nextBuildingId = 1

export function resetBuildingId (val) {
  nextBuildingId = val
}

export function advanceBuildingId () {
  return nextBuildingId++
}

// Tag all meshes in a building group so it becomes clickable
export function tagBuildingMesh (bldg, info) {
  bldg.traverse(child => {
    if (child.isMesh) {
      child.name = 'building'
      child.userData = { buildingInfo: info }
    }
  })
}
