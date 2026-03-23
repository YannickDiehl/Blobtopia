/**
 * constants.js — Shared constants, materials, geometries, and PRNG for city modules
 */
import * as THREE from 'three'
import { GRID_SIZE, CELL_SIZE, GRID_CELLS } from '@/config/world'

// ── Seeded PRNG (Mulberry32) ─────────────────────────────────
export function mulberry32 (seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Constants ────────────────────────────────────────────────
export const GRID = GRID_SIZE
export const CX = GRID_SIZE / 2
export const CY = GRID_SIZE / 2 // civic center

export const RIVER_POINTS = [
  [-20, 190], [100, 176], [240, 200], [400, 184],
  [560, 164], [720, 144], [880, 130], [1020, 116],
]

// ── Shared Materials ─────────────────────────────────────────
export const streetMat = new THREE.MeshLambertMaterial({ color: 0x444444 })
export const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xaaa898 })
export const waterMat = new THREE.MeshLambertMaterial({
  color: 0x2563a8, transparent: true, opacity: 0.85, side: THREE.DoubleSide
})
export const riverBankMat = new THREE.MeshLambertMaterial({ color: 0x6b5a3e })
export const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5D4037 })
export const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x8B7355 })

// Shared geometries
export const trunkGeo = new THREE.CylinderGeometry(0.4, 0.55, 5, 6)
export const leafSphereGeo = new THREE.IcosahedronGeometry(3, 1)
export const leafConeGeo = new THREE.ConeGeometry(2.2, 6, 6)

// ── Editor / Layout constants ────────────────────────────────
export const EDITOR_STORAGE_KEY = 'blobtopia-city-layout'

export const EDITOR_SCALE_MAP = {
  villa: 37, rowhouse: 28, apartment: 30, office: 30, factory: 28, road: 32, deco: 16, building: 24, water: 32, civic: 0.5
}

// Per-model scales from editor (overrides EDITOR_SCALE_MAP when model-specific scale differs)
export const MODEL_SCALE_MAP = {
  // Gehwege / Steinwege / Pfade
  'pavement': 34, 'pavement-fountain': 34,
  'nature-path_stone': 34, 'nature-path_stoneCorner': 43, 'nature-path_stoneEnd': 53,
  'suburban-path-long': 82, 'suburban-path-short': 162,
  'suburban-path-stones-long': 82, 'suburban-path-stones-short': 162, 'suburban-path-stones-messy': 90,
  // Natur mit abweichender Skalierung
  'nature-tree_small': 14, 'nature-tree_tall': 18,
  'nature-plant_bush': 12, 'nature-plant_bushLarge': 14,
  'nature-flower_redA': 10, 'nature-flower_yellowA': 10, 'nature-flower_purpleA': 10,
  'nature-grass_large': 12, 'nature-rock_smallA': 12, 'nature-rock_largeA': 14,
  'nature-log_stack': 12, 'nature-sign': 12,
  // Fantasy
  'fantasy-stall': 22, 'fantasy-stall-green': 22, 'fantasy-stall-red': 22,
  'fantasy-cart': 14, 'fantasy-lantern': 14, 'fantasy-hedge': 14,
  'fantasy-banner-green': 14, 'fantasy-banner-red': 14, 'fantasy-fence': 14,
  'fantasy-wall-arch': 22,
  // Industrie-Deko
  'industrial-chimney-medium': 15, 'industrial-chimney-small': 14,
  // Suburban
  'suburban-tree-small': 12,
}

export const CIVIC_SCALE = {
  'civic-church': 75,
  'civic-townhall': 24,
  'civic-school': 2.52,
  'civic-hospital': 0.288,
}

export const ROAD_TILE_SCALE = CELL_SIZE // each tile becomes ~32 units wide/long (matches CELL_SIZE)

export const KENNEY_ROAD_NAMES = [
  'road-straight', 'road-straight-lightposts',
  'road-intersection', 'road-corner', 'road-split',
]

// ── Label maps ───────────────────────────────────────────────
export const TYPE_LABELS = {
  villa: 'Wohnhaus', rowhouse: 'Reihenhaus', apartment: 'Mehrfamilienhaus', factory: 'Gewerbegebäude'
}

export const DISTRICT_LABELS = {
  0: 'Grüntal', 1: 'Sonnenberg', 2: 'Hafenviertel', 3: 'Mittelfeld', 4: 'Industriezone'
}

// Re-export config values for convenience
export { GRID_SIZE, CELL_SIZE, GRID_CELLS }
