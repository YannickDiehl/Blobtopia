/**
 * districts.js — District definitions, palettes, landmarks, and exclusion logic
 *
 * Core district data (names, bounds, colors) is loaded from data/districts.json
 * which serves as the single source of truth shared with generate-city.js and the Rust server.
 */
import * as THREE from 'three'
import { RIVER_POINTS } from './constants'
import districtsData from '../../data/districts.json'

// Rendering-specific palettes (not in the shared JSON — only used for 3D building tinting)
const BUILDING_PALETTES = {
  0: [0xf5f0e8, 0xe8e0d0, 0xd4cfc0, 0xc8dcc8]
  ,1: [0xe8d4a0, 0xd4c088, 0xc8b878, 0xdcc8a0]
  ,2: [0xa0b0c0, 0x8898a8, 0x7888a0, 0x90a0b8]
  ,3: [0xe0c8a0, 0xd0b888, 0xc8b080, 0xd8c4a0]
  ,4: [0x808080, 0x707070, 0x888888, 0x757575],
}

// ── Districts (derived from JSON + rendering extras) ─────────
export const DISTRICTS = districtsData.map(d => ({
  id: d.id
  ,name: d.name
  ,x1: d.bounds_world[0], y1: d.bounds_world[1], x2: d.bounds_world[2], y2: d.bounds_world[3]
  ,groundColor: d.ground_color
  ,palette: BUILDING_PALETTES[d.id] || [0xcccccc, 0xbbbbbb, 0xaaaaaa, 0x999999]
  ,buildType: d.build_type
  ,treeCount: d.tree_count,
}))

export const CIVIC_COLOR = [0.83, 0.77, 0.66]
export const BASE_COLOR = [0.66, 0.78, 0.53]

// ── Landmarks ────────────────────────────────────────────────
export const LANDMARKS_DATA = [
  { name: 'Parliament', label: 'Rathaus', x: 500, y: 500, radius: 20
    ,description: 'Das Rathaus von Blobtopia — hier werden Gesetze debattiert und Wahlen abgehalten.' }
  ,{ name: 'Marketplace', label: 'Marktplatz', x: 500, y: 460, radius: 25
    ,description: 'Der zentrale Marktplatz — Handelsort und sozialer Treffpunkt der Blobs.' }
  ,{ name: 'University', label: 'Universität', x: 500, y: 800, radius: 20
    ,description: 'Die Universität von Blobtopia — Bildungsinstitution und Forschungszentrum.' }
,]

// ── District palettes for tinting ────────────────────────────
export const DISTRICT_PALETTES = {
  0: { r: [0.85, 0.95], g: [0.92, 1.00], b: [0.88, 0.98] }  // Grüntal — grünlich
  ,1: { r: [0.95, 1.00], g: [0.88, 0.96], b: [0.75, 0.85] }  // Sonnenberg — warm/gelblich
  ,2: { r: [0.82, 0.92], g: [0.88, 0.96], b: [0.95, 1.00] }  // Hafenviertel — bläulich
  ,3: { r: [0.95, 1.00], g: [0.85, 0.95], b: [0.78, 0.88] }  // Mittelfeld — orange-warm
  ,4: { r: [0.88, 0.96], g: [0.88, 0.96], b: [0.88, 0.96] },  // Industriezone — neutral-grau
}
export const DEFAULT_PALETTE = { r: [0.92, 1.00], g: [0.90, 1.00], b: [0.85, 0.95] }

// ── Exclusion zones ──────────────────────────────────────────
const riverCurveBlobal = new THREE.CatmullRomCurve3(
  RIVER_POINTS.map(p => new THREE.Vector3(p[0], 0, p[1]))
)

export function isExcluded (x, y) {
  for (const lm of LANDMARKS_DATA) {
    const dx = x - lm.x, dy = y - lm.y
    if (dx * dx + dy * dy < (lm.radius + 32) ** 2) return true
  }
  // River exclusion
  for (let t = 0; t <= 1; t += 0.03) {
    const rp = riverCurveBlobal.getPointAt(t)
    if (Math.sqrt((x - rp.x) ** 2 + (y - rp.z) ** 2) < 56) return true
  }
  return false
}

// ── District map from editor (set by layout-renderer) ────────
let _editorDistrictMap = null
let _cellSize = 32

export function setEditorDistrictMap (dm, cellSize) {
  _editorDistrictMap = dm
  _cellSize = cellSize || 32
}

// ── Determine district for a point ───────────────────────────
export function getDistrictAt (x, y) {
  // Use editor districtMap if available (pixel-accurate, matches editor)
  if (_editorDistrictMap) {
    const cx = Math.floor(x / _cellSize)
    const cz = Math.floor(y / _cellSize)
    const key = `${cx},${cz}`
    const dIdx = _editorDistrictMap[key]
    if (dIdx != null && DISTRICTS[dIdx]) return DISTRICTS[dIdx]
  }
  // Fallback: bounds-based lookup
  for (const d of DISTRICTS) {
    if (x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2) return d
  }
  return null
}
