/**
 * src/lib/survey-weighting.js
 *
 * Post-Stratifizierung (Zellgewichtung): Die Antwortenden werden an die
 * WAHREN Randverteilungen des Auswahlrahmens angepasst (in der Simulation
 * bekannt — in der Realität bräuchte man Registerdaten/amtliche Statistik).
 *
 * w_kal = w_design × N_zelle / Σ(w_design der Antwortenden in der Zelle)
 *
 * Der lehrbare Doppelpunkt: Gewichtung repariert Nonresponse-Bias nur auf
 * (und über) den Anpassungsvariablen — und sie kann leere Zellen nicht
 * füllen. Messfehler bleibt vollständig unberührt.
 */
import { DISPOSITION } from './survey-fieldwork.js'

/**
 * @param {Object} p
 *   rows   Ergebniszeilen (Brutto; Antwortende via disposition)
 *   truth  Snapshot aus survey-truth.js (frameCellList + perUnitCells)
 *   vars   Anpassungsvariablen, ⊆ ['district', 'education_level']
 * @returns {{ weights: Object, cells: Array, uncovered: number }}
 *   weights: blobId → kalibriertes Gewicht (nur Antwortende)
 */
export function postStratify({ rows, truth, vars }) {
  vars = vars && vars.length ? vars : ['district']
  const keyOf = cells => vars.map(v => String(cells && cells[v] != null ? cells[v] : '?')).join('|')

  // Soll: wahre Zellbesetzung des Rahmens
  const frameN = {}
  for (const cells of truth.frameCellList || []) {
    const k = keyOf(cells)
    frameN[k] = (frameN[k] || 0) + 1
  }

  // Ist: designgewichtete Antwortende pro Zelle
  const respondents = rows.filter(r => r.disposition == null || r.disposition === DISPOSITION.RESPONDENT)
  const respW = {}
  for (const r of respondents) {
    const k = keyOf(truth.perUnitCells ? truth.perUnitCells[r.blobId] : null)
    respW[k] = (respW[k] || 0) + (r.weight != null ? r.weight : 1)
  }

  const weights = {}
  const cells = []
  let uncovered = 0
  for (const k of Object.keys(frameN)) {
    const factor = respW[k] > 0 ? frameN[k] / respW[k] : null
    cells.push({ key: k, frameN: frameN[k], respondents: respW[k] || 0, factor })
    if (factor == null) uncovered += frameN[k]
  }
  for (const r of respondents) {
    const k = keyOf(truth.perUnitCells ? truth.perUnitCells[r.blobId] : null)
    const factor = respW[k] > 0 ? frameN[k] / respW[k] : null
    if (factor != null) weights[r.blobId] = (r.weight != null ? r.weight : 1) * factor
  }
  return { weights, cells, uncovered }
}

/** Kalibrierter Schätzer pro Item (Mittel über Antwortende mit w_kal). */
export function calibratedEstimate(rows, itemId, weights) {
  let sw = 0, sv = 0
  for (const r of rows) {
    const a = r.answers && r.answers[itemId]
    if (!a || a.status !== 'answered' || a.value == null) continue
    const w = weights[r.blobId]
    if (w == null) continue
    sw += w; sv += w * a.value
  }
  return sw > 0 ? sv / sw : null
}
