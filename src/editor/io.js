/**
 * io.js — Laden/Speichern/Exportieren von Stadt-Layouts.
 *
 * Drei Persistenz-Ebenen, bewusst getrennt:
 *  - DRAFT  (localStorage EDITOR_DRAFT_KEY): Arbeitsstand, beeinflusst nichts.
 *  - PREVIEW (localStorage PREVIEW_STORAGE_KEY): explizit aktivierte
 *    Welt-Vorschau — layout-renderer rendert sie statt public/blobtopia-city.json.
 *  - EXPORT (Datei / Repo): data/blobtopia-city.json ist der Precompute-Input,
 *    public/blobtopia-city.json die ausgelieferte Welt. Der Dev-Endpoint
 *    schreibt beide synchron.
 */
import { CELL_SIZE, GRID_CELLS } from '@/config/world'
import {
  CITY_LAYOUT_VERSION, EDITOR_DRAFT_KEY, PREVIEW_STORAGE_KEY,
} from '@/city/constants'
import { TYPE_TO_FUNCTIONAL, FUNCTIONAL_MAP } from '@/city/catalog'

// ── Anreicherung (functional_type/capacity-Defaults) ─────────
export function enrichPlacements (placements) {
  for (const p of placements) {
    if (!p.functional_type) {
      p.functional_type = TYPE_TO_FUNCTIONAL[p.type] || 'decoration'
    }
    if (p.capacity == null) {
      const ft = FUNCTIONAL_MAP[p.functional_type]
      p.capacity = (ft && ft.defaultCapacity) || 0
    }
    if (p.district == null) p.district = -1
  }
  return placements
}

// ── WalkableGrid (Tile-Map R/B/D/W/. für Welt + Precompute) ──
export function generateWalkableGrid (placements) {
  const cells = GRID_CELLS
  const grid = new Array(cells * cells).fill('.')
  for (const p of placements) {
    const cx = Math.floor(p.x / CELL_SIZE)
    const cz = Math.floor(p.z / CELL_SIZE)
    if (cx < 0 || cx >= cells || cz < 0 || cz >= cells) continue
    const idx = cz * cells + cx
    if (p.type === 'road') grid[idx] = 'R'
    else if (p.type === 'water') grid[idx] = 'W'
    else if (p.type === 'deco' || p.model.startsWith('nature-path') || p.model.startsWith('suburban-path') || p.model.startsWith('pavement')) grid[idx] = 'D'
    else if (grid[idx] !== 'R') grid[idx] = 'B'
  }
  // Sidewalks: leere Zellen neben R oder B → D
  for (let cz = 0; cz < cells; cz++) {
    for (let cx = 0; cx < cells; cx++) {
      if (grid[cz * cells + cx] !== '.') continue
      let hasNeighbor = false
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = cx + dx, nz = cz + dz
        if (nx >= 0 && nx < cells && nz >= 0 && nz < cells) {
          const ch = grid[nz * cells + nx]
          if (ch === 'R' || ch === 'B') { hasNeighbor = true; break }
        }
      }
      if (hasNeighbor) grid[cz * cells + cx] = 'D'
    }
  }
  return { cells, cellSize: CELL_SIZE, map: grid.join('') }
}

/** Vollständiges Export-Objekt im Layout-Contract-Format. */
export function buildLayoutData (placements, districtMap) {
  enrichPlacements(placements)
  return {
    version: CITY_LAYOUT_VERSION
    , placements
    , districtMap
    , walkableGrid: generateWalkableGrid(placements)
  }
}

// ── localStorage: Draft + Vorschau ───────────────────────────
export function saveDraft (data) {
  try {
    localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(data))
    return true
  } catch (_e) { return false /* quota/private mode */ }
}

export function loadDraft () {
  try {
    const raw = localStorage.getItem(EDITOR_DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data && data.version >= CITY_LAYOUT_VERSION && Array.isArray(data.placements)) return data
  } catch (_e) { /* kaputter Draft */ }
  try { localStorage.removeItem(EDITOR_DRAFT_KEY) } catch (_e) { /* private mode */ }
  return null
}

export function clearDraft () {
  try { localStorage.removeItem(EDITOR_DRAFT_KEY) } catch (_e) { /* private mode */ }
}

export function setPreview (data) {
  try {
    localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (_e) { return false }
}

export function clearPreview () {
  try { localStorage.removeItem(PREVIEW_STORAGE_KEY) } catch (_e) { /* private mode */ }
}

export function isPreviewActive () {
  try { return localStorage.getItem(PREVIEW_STORAGE_KEY) != null } catch (_e) { return false }
}

// ── Ausgeliefertes Layout ────────────────────────────────────
export async function loadShippedLayout () {
  const resp = await fetch('/blobtopia-city.json')
  if (!resp.ok) throw new Error('blobtopia-city.json nicht gefunden')
  return resp.json()
}

// ── Datei-Import/-Export ─────────────────────────────────────
export function downloadJSON (data, filename = 'blobtopia-city.json') {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function pickJSONFile () {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = (ev) => {
        try { resolve(JSON.parse(ev.target.result)) }
        catch (err) { reject(err) }
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    }
    input.click()
  })
}

// ── Dev-Endpoint: direkt ins Repo schreiben (nur `npm run dev`) ──
export async function saveToRepo (data) {
  const res = await fetch('/api/editor/save-city', {
    method: 'POST'
    , headers: { 'Content-Type': 'application/json' }
    , body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}
