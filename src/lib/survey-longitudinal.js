/**
 * src/lib/survey-longitudinal.js
 *
 * Trend- und Panel-Designs über die Timeline — der Hebel, den kein reales
 * Lehrdatenset hat: Veränderung lässt sich gegen die WAHRE Veränderung halten.
 *
 *   TREND: gleiches Design, NEUE Ziehung pro Welle (Seed variiert pro Welle).
 *   PANEL: die Netto-Stichprobe aus Welle 1 wird wiederbefragt — mit
 *          selektiver, MONOTONER Attrition (wer einmal ausfällt, bleibt
 *          draußen) und „nicht mehr in Population" für verschwundene Blobs.
 *
 * Attrition ist modellgetrieben (niedrige Gemeinschaftsbeteiligung, hohe
 * Machtlosigkeit, Jüngere fallen eher aus) und seeded — wie alles hier.
 * Pure Funktionen: die Populationen pro Welle werden INJIZIERT (der Store
 * lädt sie über die Timeline), dadurch komplett in Node testbar.
 */
import { drawSample } from './survey-sampling.js'
import { runSyntheticSurvey } from './survey-synthetic.js'
import { simulateParticipation, fieldReport, questionnaireBurden, DISPOSITION, FIELD_MODES } from './survey-fieldwork.js'
import { snapshotTruth } from './survey-truth.js'
import { makeRng } from './survey-sampling.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'

function hashSeed(parts) {
  const s = parts.join('|')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function logistic(x) { return 1 / (1 + Math.exp(-x)) }
function trait(blob, key) {
  const c = CONSTRUCTS_BY_KEY[key]
  const v = c ? c.get(blob) : null
  return v == null || isNaN(v) ? 5 : v
}

/** P(im Panel bleiben) pro Welle — sozialkapital-/alters-selektiv, ~80–85 %. */
export function panelStayProbability(blob) {
  const age = blob.age != null ? blob.age : 40
  return logistic(1.6
    + 0.08 * (trait(blob, 'community_participation') - 5)
    - 0.08 * (trait(blob, 'powerlessness') - 5)
    - 0.012 * Math.max(0, 45 - age))
}

/**
 * @param {Object} p
 *   type   'trend' | 'panel'
 *   waves  [{ tick, blobs }] — Welle 1 zuerst; blobs = adaptierte Population
 *   design Ziehungs-/Feld-Design (wie runFieldwork)
 *   items  Fragebogen
 *   demographics  (blob) => Spalten
 * @returns {{ rows: Array, meta: { type, waves: Array } }}
 */
export function runLongitudinalStudy({ type, waves, design, items, demographics }) {
  const demo = typeof demographics === 'function' ? demographics : () => ({})
  const mode = FIELD_MODES[design.fieldMode] ? design.fieldMode : 'personal'
  const sdFactor = FIELD_MODES[mode].sdFactor
  const baseSeed = design.seed != null ? design.seed : 12345
  const burden = questionnaireBurden(items)

  const allRows = []
  const waveMeta = []
  let panelBase = null   // [{ blob (Welle-1-Zustand), weight, stratum }]
  let activeIds = null   // monotone Attrition: einmal raus = raus

  for (let w = 0; w < waves.length; w++) {
    const wave = waves[w]
    const waveSeed = baseSeed + 7919 * w
    const blobsById = {}
    for (const b of wave.blobs) blobsById[b.id] = b
    let participation
    let truthUnits

    if (type === 'panel' && w > 0) {
      // Panel-Welle: Basis = Netto aus Welle 1, am Welle-w-Zustand befragt.
      participation = panelBase.map(u => {
        const current = blobsById[u.blob.id]
        if (!current) return { blob: u.blob, weight: u.weight, stratum: u.stratum, disposition: DISPOSITION.GONE }
        const unit = { blob: current, weight: u.weight, stratum: u.stratum }
        if (!activeIds.has(u.blob.id)) return Object.assign(unit, { disposition: DISPOSITION.ATTRITION })
        const rng = makeRng(hashSeed([u.blob.id, 'attrition', w, baseSeed]))
        if (rng() > panelStayProbability(current)) {
          activeIds.delete(u.blob.id)
          return Object.assign(unit, { disposition: DISPOSITION.ATTRITION })
        }
        return Object.assign(unit, { disposition: DISPOSITION.RESPONDENT })
      })
      truthUnits = participation.filter(p => blobsById[p.blob.id]).map(p => ({ blob: p.blob, weight: p.weight, stratum: p.stratum }))
    } else {
      // Welle 1 (oder Trend-Welle): frische Ziehung + volle Feldarbeit.
      const sample = drawSample(wave.blobs, Object.assign({}, design, { seed: waveSeed }))
      participation = simulateParticipation(sample.units, { mode, attempts: design.contactAttempts, seed: waveSeed, burden })
      truthUnits = sample.units
      waveMeta[w] = { frameSize: sample.frameSize }
      if (type === 'panel' && w === 0) {
        panelBase = participation.filter(p => p.disposition === DISPOSITION.RESPONDENT)
          .map(p => ({ blob: p.blob, weight: p.weight, stratum: p.stratum }))
        activeIds = new Set(panelBase.map(u => u.blob.id))
      }
    }

    const respondents = participation.filter(p => p.disposition === DISPOSITION.RESPONDENT)
    const net = runSyntheticSurvey(respondents, items, { seed: waveSeed, demographics: demo, sdFactor })
    const netById = {}
    for (const r of net.rows) netById[r.blobId] = r
    for (const p of participation) {
      const r = netById[p.blob.id]
      const row = r
        ? Object.assign({}, r, { disposition: p.disposition })
        : Object.assign({ blobId: p.blob.id, stratum: p.stratum, weight: p.weight }, demo(p.blob), { disposition: p.disposition, answers: {} })
      if (waves.length > 1) row.welle = w + 1
      allRows.push(row)
    }

    const truth = snapshotTruth({ blobs: wave.blobs, design, units: truthUnits, items })
    waveMeta[w] = Object.assign(waveMeta[w] || {}, fieldReport(participation), {
      tick: wave.tick, truth, technique: design.technique
      , frameSize: (waveMeta[w] && waveMeta[w].frameSize) || truth.frameN
    })
  }

  return { rows: allRows, meta: { type, items: items.length, mode: 'synthetic', waves: waveMeta } }
}

/**
 * Veränderungs-Sicht pro Item × Welle: geschätzte vs. WAHRE Veränderung,
 * plus die Attritions-Diagnose fürs Panel (wahre Werte der Verbleiber vs.
 * der gesamten Panel-Basis — beides am Welle-w-Zustand).
 */
export function waveSummary(result, items) {
  if (!result || !result.meta || !result.meta.waves) return []
  const out = []
  for (let qi = 0; qi < items.length; qi++) {
    const id = items[qi].id || ('item_' + qi)
    const perWave = []
    for (let w = 0; w < result.meta.waves.length; w++) {
      const wm = result.meta.waves[w]
      const rows = result.rows.filter(r => (r.welle || 1) === w + 1)
      const trueOf = r => (wm.truth.perUnit[r.blobId] ? wm.truth.perUnit[r.blobId][id] : null)
      let sw = 0, sv = 0, tw = 0, tv = 0, bw = 0, bv = 0
      for (const r of rows) {
        const t = trueOf(r)
        const weight = r.weight != null ? r.weight : 1
        if (t != null) { bw += weight; bv += weight * t }
        const a = r.answers && r.answers[id]
        if (!a || a.status !== 'answered' || a.value == null) continue
        sw += weight; sv += weight * a.value
        if (t != null) { tw += weight; tv += weight * t }
      }
      perWave.push({
        wave: w + 1
        , tick: wm.tick
        , n: rows.filter(r => r.disposition == null || r.disposition === DISPOSITION.RESPONDENT).length
        , estimate: sw > 0 ? sv / sw : null
        , popMean: wm.truth.items[id] ? wm.truth.items[id].popMean : null
        , respTrueMean: tw > 0 ? tv / tw : null   // Verbleiber (wahr)
        , baseTrueMean: bw > 0 ? bv / bw : null   // gesamte Basis inkl. Ausfälle (wahr)
      })
    }
    out.push({ id, perWave })
  }
  return out
}
