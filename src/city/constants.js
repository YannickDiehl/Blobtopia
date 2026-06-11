/**
 * constants.js — Gemeinsame Stadt-Konstanten, Layout-Contract und PRNG
 */
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

// ── Layout-Contract ──────────────────────────────────────────
// Version des Stadt-Layout-Formats. Der Editor stempelt sie beim Export,
// die Welt akzeptiert Vorschau-Layouts nur mit passender Version —
// ältere Formate (v2-Editor-Stände, v5-Generator) werden verworfen.
export const CITY_LAYOUT_VERSION = 6

// Arbeitsstand des Editors (überlebt Reloads, beeinflusst die Welt NICHT)
export const EDITOR_DRAFT_KEY = 'blobtopia-editor-draft'
// Explizit aktivierte Welt-Vorschau („In Welt ansehen" im Editor)
export const PREVIEW_STORAGE_KEY = 'blobtopia-city-preview'
// Vor dem Contract-Fix teilten sich Editor und Welt-Cache diese Schlüssel
export const LEGACY_STORAGE_KEYS = ['blobtopia-city-layout', 'globtopia-city-layout']

// Re-export config values for convenience
export { GRID_SIZE, CELL_SIZE, GRID_CELLS }
