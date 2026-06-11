/**
 * validation.js — Live-Prüfung eines Stadt-Layouts auf Simulationstauglichkeit.
 *
 * Eine handgebaute Stadt muss zwei harte Bedingungen erfüllen, sonst
 * produziert `cargo precompute` Unsinn: genug Wohnkapazität für alle Blobs
 * und ein zusammenhängendes Straßennetz, an dem die Gebäude liegen.
 * Alles Weitere sind Warnungen/Infos.
 */
import { CELL_SIZE, GRID_CELLS } from '@/config/world'
import { FUNCTIONAL_MAP } from '@/city/catalog'
import { generateWalkableGrid } from './io'

const NON_FUNCTIONAL = new Set(['decoration', 'road', 'water'])

/**
 * Erreichbarkeit über das echte Walkable-Grid: Flood-Fill von den Straßen
 * über R∪D (Gehwege). Eigenständig exportiert, weil der Editor daraus auch
 * das Erreichbarkeits-Overlay rendert.
 */
export function computeReachability (placements) {
  const cells = GRID_CELLS
  const tileMap = generateWalkableGrid(placements).map
  const flooded = new Uint8Array(cells * cells)
  const stack = []
  for (let i = 0; i < tileMap.length; i++) {
    if (tileMap[i] === 'R') { flooded[i] = 1; stack.push(i) }
  }
  while (stack.length) {
    const idx = stack.pop()
    const cx = idx % cells, cz = (idx / cells) | 0
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cx + dx, nz = cz + dz
      if (nx < 0 || nx >= cells || nz < 0 || nz >= cells) continue
      const nIdx = nz * cells + nx
      if (!flooded[nIdx] && (tileMap[nIdx] === 'R' || tileMap[nIdx] === 'D')) {
        flooded[nIdx] = 1
        stack.push(nIdx)
      }
    }
  }
  const unreachable = []
  for (const p of placements) {
    const ft = FUNCTIONAL_MAP[p.functional_type]
    if (!ft || NON_FUNCTIONAL.has(ft.value)) continue
    const cx = Math.max(0, Math.min(cells - 1, Math.floor(p.x / CELL_SIZE)))
    const cz = Math.max(0, Math.min(cells - 1, Math.floor(p.z / CELL_SIZE)))
    let reachable = false
    for (let dx = -1; dx <= 1 && !reachable; dx++) {
      for (let dz = -1; dz <= 1 && !reachable; dz++) {
        if (dx === 0 && dz === 0) continue
        const nx = cx + dx, nz = cz + dz
        if (nx >= 0 && nx < cells && nz >= 0 && nz < cells && flooded[nz * cells + nx]) reachable = true
      }
    }
    if (!reachable) unreachable.push(p)
  }
  return { cells, flooded, unreachable }
}

export function computeValidation ({ placements, population = 500 }) {
  const errors = []
  const warnings = []

  // ── Kapazitäten ────────────────────────────────────────────
  let housing = 0
  let workplaces = 0
  let functionalCount = 0
  const functional = []
  for (const p of placements) {
    const ft = FUNCTIONAL_MAP[p.functional_type]
    if (!ft || NON_FUNCTIONAL.has(ft.value)) continue
    functionalCount++
    functional.push(p)
    if (ft.residential) housing += p.capacity || 0
    if (ft.workplace) workplaces += p.capacity || 0
  }

  if (housing < population) {
    errors.push(`Zu wenig Wohnraum: ${housing} Plätze für ${population} Blobs — Precompute kann nicht alle unterbringen.`)
  }
  if (workplaces === 0 && functionalCount > 0) {
    warnings.push('Keine Arbeitsplätze (Büro/Fabrik/Geschäft …) — alle Blobs wären arbeitslos.')
  }

  // ── Distrikt-Zuordnung ────────────────────────────────────
  const noDistrict = functional.filter(p => p.district == null || p.district < 0).length
  if (noDistrict > 0) {
    warnings.push(`${noDistrict} funktionale Gebäude ohne Distrikt (zählen als „Zentrum").`)
  }

  // ── Straßennetz: Zusammenhang + Erreichbarkeit ────────────
  const cells = GRID_CELLS
  const roadGrid = new Uint8Array(cells * cells)
  let roadCount = 0
  for (const p of placements) {
    if (p.type !== 'road') continue
    const cx = Math.floor(p.x / CELL_SIZE)
    const cz = Math.floor(p.z / CELL_SIZE)
    if (cx < 0 || cx >= cells || cz < 0 || cz >= cells) continue
    roadGrid[cz * cells + cx] = 1
    roadCount++
  }

  if (roadCount === 0) {
    if (functionalCount > 0) errors.push('Keine Straßen — Blobs können sich nicht bewegen.')
  } else {
    // Komponenten per Flood-Fill zählen
    const comp = new Int32Array(cells * cells).fill(-1)
    let nComp = 0
    const compSizes = []
    for (let i = 0; i < roadGrid.length; i++) {
      if (!roadGrid[i] || comp[i] !== -1) continue
      let size = 0
      const stack = [i]
      comp[i] = nComp
      while (stack.length) {
        const idx = stack.pop()
        size++
        const cx = idx % cells, cz = (idx / cells) | 0
        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cx + dx, nz = cz + dz
          if (nx < 0 || nx >= cells || nz < 0 || nz >= cells) continue
          const nIdx = nz * cells + nx
          if (roadGrid[nIdx] && comp[nIdx] === -1) {
            comp[nIdx] = nComp
            stack.push(nIdx)
          }
        }
      }
      compSizes.push(size)
      nComp++
    }
    const fragments = compSizes.filter(s => s >= 3).length
    if (fragments > 1) {
      warnings.push(`Straßennetz zerfällt in ${fragments} getrennte Teile — Blobs wechseln nicht zwischen ihnen.`)
    }

    // Erreichbarkeit über das ECHTE Walkable-Grid (siehe computeReachability):
    // Blobs laufen auch über Gehweg-Zellen — kalibriert an der
    // ausgelieferten Stadt (dort 0 Treffer).
    const { unreachable } = computeReachability(placements)
    if (unreachable.length > 0) {
      const sample = unreachable.slice(0, 3).map(p => p.label || p.model).join(', ')
      warnings.push(`${unreachable.length} Gebäude ohne Anbindung ans Straßen-/Gehwegnetz (${sample}${unreachable.length > 3 ? ', …' : ''}).`)
    }
  }

  return {
    ok: errors.length === 0
    , errors
    , warnings
    , stats: {
      buildings: placements.length
      , functional: functionalCount
      , housing
      , workplaces
      , population
      , roads: roadCount
    }
  }
}

/** Population aus den Timeline-Daten (Fallback: 500). */
export async function fetchPopulation (dataBase) {
  try {
    const res = await fetch(`${dataBase}/blob-index.json`)
    if (res.ok) {
      const index = await res.json()
      if (Array.isArray(index) && index.length > 0) return index.length
    }
  } catch (_e) { /* offline/dev ohne Daten */ }
  return 500
}
