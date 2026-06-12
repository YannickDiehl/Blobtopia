/**
 * src/lib/survey-reliability.js
 *
 * Reliabilität für Mehr-Item-Batterien: Messen ≥2 Items dasselbe Konstrukt,
 * werden Cronbachs α, die mittlere Inter-Item-Korrelation und — Gott-Wissen —
 * die WAHRE Reliabilität des Summenscores (Var(τ)/Var(X)) berechnet.
 *
 * Pikantes Detail des Antwortmodells gratis dazu: Akquieszenz ist
 * personenkorreliert (gleicher Bildungs-Shift über Items) → korrelierte
 * Fehler → α ÜBERSCHÄTZT die Reliabilität. Eine Lektion, die sonst nur im
 * Lehrbuch steht.
 */
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'
import { DISPOSITION } from './survey-fieldwork.js'

function variance(values) {
  if (values.length < 2) return 0
  const m = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((a, b) => a + (b - m) * (b - m), 0) / (values.length - 1)
}

function pearson(x, y) {
  const n = x.length
  if (n < 2) return null
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) * (x[i] - mx)
    syy += (y[i] - my) * (y[i] - my)
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

/**
 * @param {Array} rows   Ergebniszeilen (Brutto; Unit-Respondenten zählen)
 * @param {Array} items  Fragebogen
 * @param {Object} [truth] Wahrheits-Snapshot (für Var(τ)/Var(X)); optional
 * @returns {Array} [{ construct, label, itemIds, n, alpha, avgR, trueReliability }]
 */
export function reliabilityReport(rows, items, truth) {
  const groups = {}
  items.forEach((it, qi) => {
    const id = it.id || ('item_' + qi)
    const c = it.construct ? CONSTRUCTS_BY_KEY[it.construct] : null
    if (!c || c.raw) return
    if (!groups[it.construct]) groups[it.construct] = []
    groups[it.construct].push(id)
  })

  const out = []
  for (const key of Object.keys(groups)) {
    const ids = groups[key]
    if (ids.length < 2) continue
    const label = CONSTRUCTS_BY_KEY[key].label
    const cases = rows.filter(r => (r.disposition == null || r.disposition === DISPOSITION.RESPONDENT)
      && ids.every(id => { const a = r.answers && r.answers[id]; return a && a.status === 'answered' && a.value != null }))
    if (cases.length < 8) {
      out.push({ construct: key, label, itemIds: ids, n: cases.length, alpha: null, avgR: null, trueReliability: null })
      continue
    }
    const k = ids.length
    const cols = ids.map(id => cases.map(r => r.answers[id].value))
    const totals = cases.map((r, i) => cols.reduce((s, col) => s + col[i], 0))
    const totalVar = variance(totals)
    const itemVarSum = cols.reduce((s, col) => s + variance(col), 0)
    const alpha = totalVar > 0 ? (k / (k - 1)) * (1 - itemVarSum / totalVar) : null
    let rSum = 0, rN = 0
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const r = pearson(cols[i], cols[j])
        if (r != null) { rSum += r; rN++ }
      }
    }
    let trueReliability = null
    if (truth && totalVar > 0) {
      const taus = cases.map(r => ids.reduce((s, id) =>
        s + (truth.perUnit[r.blobId] && truth.perUnit[r.blobId][id] != null ? truth.perUnit[r.blobId][id] : 0), 0))
      trueReliability = Math.min(1, variance(taus) / totalVar)
    }
    out.push({ construct: key, label, itemIds: ids, n: cases.length, alpha, avgR: rN ? rSum / rN : null, trueReliability })
  }
  return out
}
