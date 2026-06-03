/**
 * src/lib/survey-synthetic.js
 *
 * Free, instant, reproducible answer engine — the cost workaround for large
 * surveys. For an item BOUND to a construct, it draws an answer from the blob's
 * stored 0–10 value plus calibrated measurement noise, maps it onto the item's
 * response scale, and models item-nonresponse (predicted from blob traits).
 * It never returns the raw stored value, and the same (blob, item, seed) always
 * yields the same answer.
 *
 * Produces the SAME row shape as survey-engine.runSurvey, so survey-dataset.js
 * (toCSV/toCodebook/responseSummary) works unchanged.
 *
 * Default noise SD (1.3 on the 0–10 scale) reflects the ±1–2 measurement slack
 * the LLM prompt teaches; it can later be calibrated to the validation suite's
 * measured LLM deviation (scripts/validation/layer4).
 */
import { makeRng } from './survey-sampling.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'

const DEFAULT_NOISE_SD = 1.3

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

// Stable 32-bit hash of the (blob, item, run) triple -> RNG seed.
function hashSeed(parts) {
  const s = parts.join('|')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Standard normal via Box-Muller, driven by the seeded RNG.
function gaussian(rng) {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Map a (noisy) stored 0–10 value onto the item's response scale.
function rescaleToItem(value, item) {
  const s = item.scale || { min: 1, max: 10 }
  const frac = clamp(value, 0, 10) / 10
  const mapped = s.min + frac * (s.max - s.min)
  return clamp(Math.round(mapped), s.min, s.max)
}

function trait(blob, key) {
  const c = CONSTRUCTS_BY_KEY[key]
  const v = c ? c.get(blob) : null
  return (v == null || isNaN(v)) ? null : v
}

function syntheticAnswer(blob, item, itemId, runSeed, noiseSd) {
  const ck = item.construct
  // Synthetic answers need a construct binding and a numeric (scale/binary) item.
  if (!ck || item.type === 'open' || item.type === 'choice') {
    return { status: 'unsupported', value: null, verbatim: '' }
  }
  const stored = trait(blob, ck)
  if (stored == null) return { status: 'unsupported', value: null, verbatim: '' }

  const rng = makeRng(hashSeed([blob.id, itemId, runSeed]))

  // Modeled item nonresponse: rises with party-indifference (don't-know) and
  // distrust (refusal) — so nonresponse is non-random, the teachable point.
  const partyIndiff = trait(blob, 'party_indifference')
  const instTrust = trait(blob, 'institutional_trust')
  const pRefuse = 0.02 + 0.03 * ((instTrust == null ? 5 : (10 - instTrust)) / 10)
  const pDontKnow = 0.02 + 0.04 * ((partyIndiff == null ? 5 : partyIndiff) / 10)
  const roll = rng()
  if (roll < pRefuse) return { status: 'refused', value: null, verbatim: '' }
  if (roll < pRefuse + pDontKnow) return { status: 'dontknow', value: null, verbatim: '' }

  const noisy = stored + gaussian(rng) * noiseSd
  if (item.type === 'binary') {
    return { status: 'answered', value: noisy >= 5 ? 1 : 0, verbatim: '' }
  }
  return { status: 'answered', value: rescaleToItem(noisy, item), verbatim: '' }
}

/**
 * Administer a questionnaire to a sample synthetically (no LLM).
 * @param {Array} units  [{ blob, weight, stratum }]
 * @param {Array} items  questionnaire items (those with a `construct` binding get answered)
 * @param {Object} [opts] { seed=12345, noiseSd=1.3, demographics }
 * @returns {{ rows: Array, meta: Object }}
 */
export function runSyntheticSurvey(units, items, opts) {
  opts = opts || {}
  const runSeed = opts.seed != null ? opts.seed : 12345
  const noiseSd = opts.noiseSd != null ? opts.noiseSd : DEFAULT_NOISE_SD
  const demographics = typeof opts.demographics === 'function' ? opts.demographics : () => ({})

  const rows = units.map(u => {
    const b = u.blob
    const answers = {}
    for (let qi = 0; qi < items.length; qi++) {
      const item = items[qi]
      const id = item.id || ('item_' + qi)
      answers[id] = syntheticAnswer(b, item, id, runSeed, noiseSd)
    }
    return Object.assign(
      { blobId: b.id, stratum: u.stratum, weight: u.weight }
      , demographics(b)
      , { answers: answers }
    )
  })

  return { rows: rows, meta: { n: units.length, items: items.length, mode: 'synthetic', seed: runSeed } }
}

/** Population ground truth for a construct (for the measurement-error view). */
export function groundTruthValue(blob, constructKey) {
  return trait(blob, constructKey)
}
