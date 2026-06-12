/**
 * src/lib/survey-truth.js
 *
 * The god-view of the simulation: because Blobtopia KNOWS every blob's true
 * stored values, a survey estimate can be decomposed EXACTLY (not estimated)
 * into the Total-Survey-Error components. The telescoping chain of five means
 * per item:
 *
 *   popMean          true mean, eligible target population (eligibility only)
 *     │ ① coverage        ← the students' frame filters (undercoverage)
 *   frameMean        true mean of the filtered sampling frame
 *     │ ② sampling        ← design-weighted; systematic for quota/manual
 *   sampleTrueMean   true mean of the drawn units
 *     │ ③ nonresponse     ← modeled non-random item nonresponse
 *   respTrueMean     true mean of the units that answered the item
 *     │ ④ measurement     ← wording effects (systematic) + noise (random)
 *   estimate         the observed, weighted estimate
 *
 * ①+②+③+④ ≡ estimate − popMean holds by construction (adjacent differences).
 *
 * Truth is mapped onto the STUDENT'S response scale (continuously, without
 * rounding — answer discretization is part of measurement, not of truth) and
 * must be SNAPSHOTTED at fieldwork time: the timeline keeps playing, so
 * recomputing later would compare against a different tick.
 *
 * All functions are pure; the replication simulator reuses the seeded
 * drawSample + runSyntheticSurvey, so the sampling distribution itself is
 * reproducible.
 */
import { drawSample, eligibleFrame } from './survey-sampling.js'
import { runSyntheticSurvey } from './survey-synthetic.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'
import { simulateParticipation, DISPOSITION, FIELD_MODES } from './survey-fieldwork.js'

// Zeile zählt als Unit-Respondent (Zeilen ohne disposition = Altbestand).
function isRespondentRow(r) {
  return r.disposition == null || r.disposition === DISPOSITION.RESPONDENT
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

function itemKey(item, qi) {
  return item.id || ('item_' + qi)
}

/**
 * A blob's true value for an item, mapped onto the item's response scale.
 * Continuous (no rounding); binary items threshold at the scale midpoint —
 * the same cut the synthetic engine applies. Null without a construct binding.
 */
export function trueValueOnItemScale(blob, item) {
  const c = item && item.construct ? CONSTRUCTS_BY_KEY[item.construct] : null
  const v = c ? c.get(blob) : null
  if (v == null || isNaN(v)) return null
  const s = item.scale || { min: 1, max: 10 }
  // Demografische Selbstauskünfte (raw): die Wahrheit IST die echte Größe —
  // nur in einen ggf. vorgegebenen Antwortbereich geklemmt, nie 0–10-gemappt.
  if (c.raw) {
    let t = v
    if (s.min != null) t = Math.max(s.min, t)
    if (s.max != null) t = Math.min(s.max, t)
    return t
  }
  if (s.format === 'binary') return v >= 5 ? 1 : 0
  return s.min + (clamp(v, 0, 10) / 10) * (s.max - s.min)
}

function meanOf(values) {
  let n = 0, sum = 0
  for (const v of values) {
    if (v == null) continue
    n++; sum += v
  }
  return n > 0 ? sum / n : null
}

/**
 * Freeze the ground truth at fieldwork time.
 *
 * Population = eligibility only (the target population: e.g. adults).
 * Frame      = eligibility + the students' filters/exclusions — the SAME
 *              frame drawSample uses, so ① is exactly their frame restriction.
 *
 * @param {Object} p { blobs, design, units, items }
 * @returns {{ popN, frameN, items: Object, perUnit: Object }}
 */
export function snapshotTruth({ blobs, design, units, items }) {
  design = design || {}
  const population = eligibleFrame(blobs, design.eligibility)
  const frame = eligibleFrame(blobs, Object.assign({}, design.eligibility, {
    filter: design.filter
    , manualExclude: design.manualExclude
    , accessors: design.accessors
  }))

  const truthItems = {}
  const perUnit = {}
  const perUnitCells = {}
  for (let qi = 0; qi < items.length; qi++) {
    const item = items[qi]
    const id = itemKey(item, qi)
    truthItems[id] = {
      construct: item.construct || null
      , popMean: meanOf(population.map(b => trueValueOnItemScale(b, item)))
      , frameMean: meanOf(frame.map(b => trueValueOnItemScale(b, item)))
    }
    for (const u of units) {
      const t = trueValueOnItemScale(u.blob, item)
      if (!perUnit[u.blob.id]) perUnit[u.blob.id] = {}
      perUnit[u.blob.id][id] = t
    }
  }
  // Zell-Zugehörigkeiten für die Post-Stratifizierung (survey-weighting.js):
  // wahre Rahmen-Zusammensetzung + Zelle jeder gezogenen Einheit.
  const frameCellList = frame.map(b => ({ district: b.district, education_level: b.education_level }))
  for (const u of units) {
    perUnitCells[u.blob.id] = { district: u.blob.district, education_level: u.blob.education_level }
  }
  return {
    popN: population.length, frameN: frame.length, items: truthItems
    , perUnit: perUnit, perUnitCells: perUnitCells, frameCellList: frameCellList
  }
}

// Weighted mean over rows; pick(row) returns the value or null to skip.
function weightedMean(rows, pick) {
  let sw = 0, sv = 0
  for (const r of rows) {
    const v = pick(r)
    if (v == null) continue
    const w = r.weight != null ? r.weight : 1
    sw += w; sv += w * v
  }
  return sw > 0 ? sv / sw : null
}

// Unweighted sample variance (n−1) of the picked values.
function sampleVariance(values) {
  const v = values.filter(x => x != null)
  if (v.length < 2) return null
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1)
}

// Design-honest standard error of the mean — or null with a teaching note.
function standardError(technique, answeredRows, id, frameN) {
  if (technique === 'quota' || technique === 'manual') {
    return {
      se: null
      , note: technique === 'quota'
        ? 'Quotenauswahl ist kein Zufallsdesign — es gibt keinen gültigen Standardfehler.'
        : 'Manuelle Auswahl ist kein Zufallsdesign — es gibt keinen gültigen Standardfehler.'
    }
  }
  if (technique === 'cluster') {
    return { se: null, note: 'Klumpendesign — der einfache Standardfehler unterschätzt die Streuung. Nutze die simulierte Stichprobenverteilung.' }
  }
  const val = r => { const a = r.answers[id]; return a && a.status === 'answered' ? a.value : null }
  if (technique === 'stratified') {
    // SE² = Σ W_h² · (1 − n_h/N_h) · s_h²/n_h, with N_h recovered from the
    // design weight (w = N_h / n_h^drawn) — no extra bookkeeping needed.
    const byStratum = new Map()
    for (const r of answeredRows) {
      if (!byStratum.has(r.stratum)) byStratum.set(r.stratum, [])
      byStratum.get(r.stratum).push(r)
    }
    let totalN = 0
    const strata = []
    for (const rows of byStratum.values()) {
      const nh = rows.length
      const Nh = (rows[0].weight != null ? rows[0].weight : 1) * nh
      const s2 = sampleVariance(rows.map(val))
      if (s2 == null) return { se: null, note: 'Zu wenige Antworten pro Schicht für einen Standardfehler (mind. 2 nötig).' }
      strata.push({ nh, Nh, s2 })
      totalN += Nh
    }
    if (!strata.length || totalN <= 0) return { se: null, note: 'Keine Antworten — kein Standardfehler berechenbar.' }
    let varSum = 0
    for (const h of strata) {
      const Wh = h.Nh / totalN
      const fpc = Math.max(0, 1 - h.nh / h.Nh)
      varSum += Wh * Wh * fpc * h.s2 / h.nh
    }
    return { se: Math.sqrt(varSum), note: null }
  }
  // SRS (default)
  const values = answeredRows.map(val)
  const s2 = sampleVariance(values)
  const n = values.filter(x => x != null).length
  if (s2 == null || n < 2) return { se: null, note: 'Zu wenige Antworten für einen Standardfehler (mind. 2 nötig).' }
  const fpc = frameN > 0 ? Math.max(0, 1 - n / frameN) : 1
  return { se: Math.sqrt(fpc * s2 / n), note: null }
}

/**
 * Exact TSE decomposition per item, from a fieldwork result whose meta carries
 * the truth snapshot (result.meta.truth, result.meta.technique,
 * result.meta.frameSize — wired up by the survey store).
 * @returns {Array} one entry per item (see fields below)
 */
export function decompose(result, items) {
  if (!result || !result.meta || !result.meta.truth) return []
  const truth = result.meta.truth
  const technique = result.meta.technique || 'srs'
  const out = []

  for (let qi = 0; qi < items.length; qi++) {
    const item = items[qi]
    const id = itemKey(item, qi)
    const t = truth.items[id] || {}
    const construct = item.construct ? CONSTRUCTS_BY_KEY[item.construct] : null

    const trueOf = r => (truth.perUnit[r.blobId] ? truth.perUnit[r.blobId][id] : null)
    const rows = result.rows.filter(r => trueOf(r) != null)
    const unitRows = rows.filter(isRespondentRow)
    const answered = unitRows.filter(r => { const a = r.answers[id]; return a && a.status === 'answered' && a.value != null })

    const entry = {
      id: id
      , text: item.text || ''
      , construct: item.construct || null
      , constructLabel: construct ? construct.label : null
      , scale: item.scale || { min: 1, max: 10 }
      , available: false
      , reason: null
    }

    if (!item.construct || t.popMean == null) {
      entry.reason = 'Kein Konstrukt erkannt — für dieses Item gibt es keine Wahrheit.'
      out.push(entry)
      continue
    }
    if (!answered.length) {
      entry.reason = 'Keine auswertbaren Antworten zu diesem Item.'
      out.push(entry)
      continue
    }

    // Teleskopkette, jetzt 6 Glieder: Population → Rahmen → Brutto (wahr) →
    // Teilnehmende (wahr) → Item-Antwortende (wahr) → Schätzer. ③ spaltet
    // sich in Unit- und Item-Nonresponse; `nonresponse` bleibt die Summe.
    const sampleTrueMean = weightedMean(rows, trueOf)
    const unitTrueMean = weightedMean(unitRows, trueOf)
    const respTrueMean = weightedMean(answered, trueOf)
    const estimate = weightedMean(answered, r => r.answers[id].value)

    entry.available = true
    entry.nPop = truth.popN
    entry.nFrame = truth.frameN
    entry.nSample = rows.length
    entry.nUnit = unitRows.length
    entry.nResp = answered.length
    entry.popMean = t.popMean
    entry.frameMean = t.frameMean
    entry.sampleTrueMean = sampleTrueMean
    entry.unitTrueMean = unitTrueMean
    entry.respTrueMean = respTrueMean
    entry.estimate = estimate
    entry.coverage = t.frameMean - t.popMean
    entry.sampling = sampleTrueMean - t.frameMean
    entry.nonresponseUnit = unitTrueMean - sampleTrueMean
    entry.nonresponseItem = respTrueMean - unitTrueMean
    entry.nonresponse = entry.nonresponseUnit + entry.nonresponseItem
    entry.measurement = estimate - respTrueMean
    entry.total = estimate - t.popMean

    const seInfo = standardError(technique, answered, id, result.meta.frameSize || truth.frameN)
    entry.se = seInfo.se
    entry.seNote = seInfo.note
    entry.ci95 = seInfo.se != null ? [estimate - 1.96 * seInfo.se, estimate + 1.96 * seInfo.se] : null
    out.push(entry)
  }
  return out
}

/**
 * Empirical sampling distribution: rerun the WHOLE pipeline (draw + synthetic
 * fieldwork) B times with varied seeds and collect the weighted estimate per
 * item. Shows what no single survey can: the estimator's spread (an empirical
 * SE valid for EVERY design, clusters included) and that bias — selection,
 * nonresponse, wording — survives replication while sampling noise averages out.
 *
 * Deterministic: seeds are baseSeed+1 … baseSeed+B. Chunked with a yielding
 * setTimeout so the UI stays responsive.
 *
 * @param {Array} blobs   full population (fieldwork-time snapshot)
 * @param {Object} design the SAME draw design used for the fieldwork
 * @param {Array} items   questionnaire items
 * @param {Object} [opts] { replications=500, chunkSize=50, onProgress, field }
 *   field = { mode, attempts } — wenn gesetzt, durchläuft jede Replikation
 *   auch die Feldarbeit (Unit-Nonresponse), wie die echte Erhebung.
 * @returns {Promise<{ replications, perItem: Object }>}
 */
export async function simulateSamplingDistribution(blobs, design, items, opts) {
  opts = opts || {}
  const B = opts.replications != null ? opts.replications : 500
  const chunkSize = opts.chunkSize != null ? opts.chunkSize : 50
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
  const baseSeed = design && design.seed != null ? design.seed : 12345
  const field = opts.field || null
  const sdFactor = field && FIELD_MODES[field.mode] ? FIELD_MODES[field.mode].sdFactor : 1

  const estimates = {}
  for (let qi = 0; qi < items.length; qi++) estimates[itemKey(items[qi], qi)] = []

  for (let b = 0; b < B; b++) {
    const d = Object.assign({}, design, { seed: baseSeed + 1 + b })
    const sample = drawSample(blobs, d)
    let units = sample.units
    if (field) {
      units = simulateParticipation(units, { mode: field.mode, attempts: field.attempts, seed: baseSeed + 1 + b })
        .filter(p => p.disposition === DISPOSITION.RESPONDENT)
    }
    const { rows } = runSyntheticSurvey(units, items, { seed: baseSeed + 1 + b, sdFactor })
    for (let qi = 0; qi < items.length; qi++) {
      const id = itemKey(items[qi], qi)
      const est = weightedMean(
        rows.filter(r => { const a = r.answers[id]; return a && a.status === 'answered' && a.value != null })
        , r => r.answers[id].value
      )
      if (est != null) estimates[id].push(est)
    }
    if ((b + 1) % chunkSize === 0 && b + 1 < B) {
      if (onProgress) onProgress(b + 1, B)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  if (onProgress) onProgress(B, B)

  const perItem = {}
  for (const id in estimates) {
    const v = estimates[id]
    const m = v.length ? v.reduce((a, x) => a + x, 0) / v.length : null
    const s2 = sampleVariance(v)
    perItem[id] = { estimates: v, mean: m, sd: s2 != null ? Math.sqrt(s2) : null }
  }
  return { replications: B, perItem: perItem }
}
