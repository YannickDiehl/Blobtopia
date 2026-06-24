/**
 * src/lib/survey-sampling.js
 *
 * Calibratable sampling designs for the Befragungsinstitut. Pure and
 * deterministically seeded, so a given (population, design, seed) always
 * yields the same sample — the property a teaching instrument needs.
 *
 * Operates on plain blob objects (as produced by src/lib/blob-adapter.js:
 * { id, district, education_level, age, income, is_child, ... }). Strata
 * variables are read via ACCESSORS, overridable per design.
 *
 * drawSample(blobs, design) -> {
 *   units: [{ blob, weight, stratum }],   // weight = design weight (1 for quota)
 *   frameSize, populationSize, realizedN, technique, seed
 * }
 */

export const SAMPLING = Object.freeze({
  SRS: 'srs'              // simple random sample (equal-probability, no replacement)
  , STRATIFIED: 'stratified' // split into strata, draw within each
  , CLUSTER: 'cluster'    // sample whole clusters (e.g. districts)
  , SYSTEMATIC: 'systematic' // every k-th unit from the (ordered) frame, random start
  , QUOTA: 'quota'        // non-probability: fill target counts per cell
  , MANUAL: 'manual'      // self-selected: the sample IS the hand-picked blobs
})

/**
 * Stichprobenumfangs-Planer: benötigtes n für ±e (95 %-KI) bei Streuung sigma,
 * mit Endlichkeitskorrektur. Bewusst OHNE Gott-Wissen: sigma kommt konservativ
 * aus der Skalenbreite (≈ Spannweite/4), nicht aus der wahren Varianz.
 */
export function planSampleSize({ e, sigma, N, z = 1.96 }) {
  if (!e || e <= 0 || !sigma || sigma <= 0) return null
  const n0 = Math.pow((z * sigma) / e, 2)
  const n = N && N > 0 ? n0 / (1 + (n0 - 1) / N) : n0
  return Math.max(2, Math.ceil(n))
}

// Deterministic PRNG (mulberry32). Same seed -> same stream.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Seeded Fisher-Yates shuffle (returns a new array).
function shuffle(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

// Default accessors for common stratifiers (override via design.accessors).
export const ACCESSORS = {
  district: b => b.district
  , education_level: b => b.education_level
  , age_group: b => (b.age_group != null ? b.age_group
    : (b.age != null ? (b.age < 30 ? 0 : b.age < 60 ? 1 : 2) : null))
  , party: b => (b.party_name != null ? b.party_name
    : (b.political_state ? b.political_state.party_affiliation : null))
}

function accessorFor(varName, design) {
  const custom = design && design.accessors && design.accessors[varName]
  return custom || ACCESSORS[varName] || (b => b[varName])
}

function blobAge(b) {
  if (b.age != null) return b.age
  if (b.age_years != null) return b.age_years
  return null
}

/**
 * Build a subpopulation predicate from a structured filter spec.
 * filter: { districts:[], education:[], ageMin, ageMax, parties:[], incomeMin, incomeMax }
 * Empty/undefined arrays mean "no restriction on that variable".
 */
export function buildFilterPredicate(filter, design) {
  if (!filter) return null
  const accD = accessorFor('district', design)
  const accE = accessorFor('education_level', design)
  const accP = accessorFor('party', design)
  return b => {
    if (filter.districts && filter.districts.length && filter.districts.indexOf(accD(b)) < 0) return false
    if (filter.education && filter.education.length && filter.education.indexOf(accE(b)) < 0) return false
    const age = b.age != null ? b.age : b.age_years
    if (filter.ageMin != null && age != null && age < filter.ageMin) return false
    if (filter.ageMax != null && age != null && age > filter.ageMax) return false
    if (filter.parties && filter.parties.length && filter.parties.indexOf(accP(b)) < 0) return false
    if (filter.incomeMin != null && b.income != null && b.income < filter.incomeMin) return false
    if (filter.incomeMax != null && b.income != null && b.income > filter.incomeMax) return false
    return true
  }
}

/**
 * Build the eligible sampling frame: defines the target population.
 * @param {Array} blobs
 * @param {Object} [opts] { excludeMinors=true, minAge=18, filter, predicate, manualExclude }
 */
export function eligibleFrame(blobs, opts) {
  opts = opts || {}
  const excludeMinors = opts.excludeMinors !== false
  const minAge = opts.minAge != null ? opts.minAge : 18
  const predicate = opts.predicate || buildFilterPredicate(opts.filter, opts)
  const exclude = opts.manualExclude && opts.manualExclude.length ? new Set(opts.manualExclude) : null
  return blobs.filter(b => {
    if (exclude && exclude.has(b.id)) return false
    if (excludeMinors) {
      if (b.is_child === true) return false
      const age = blobAge(b)
      if (age != null && age < minAge) return false
    }
    if (predicate && !predicate(b)) return false
    return true
  })
}

function strataKey(b, vars, design) {
  return vars.map(v => accessorFor(v, design)(b)).join('|')
}

function groupBy(items, keyFn) {
  const groups = new Map()
  for (const it of items) {
    const k = keyFn(it)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(it)
  }
  return groups
}

// ── Simple random sample ────────────────────────────────────────────────────
function srs(frame, n, rng) {
  const k = Math.min(n, frame.length)
  return shuffle(frame, rng).slice(0, k)
    .map(b => ({ blob: b, weight: k > 0 ? frame.length / k : 0, stratum: null }))
}

/**
 * Largest-remainder (Hamilton) allocation with capacity caps. Splits a target
 * sample size n across strata so the parts ALWAYS sum to n (or to the total
 * available capacity when n exceeds it) — unlike independent rounding, which
 * drifts, and unlike floor-division for equal allocation, which silently drops
 * the remainder. `proportional` weights strata by size, `equal` gives each the
 * same share. Whole units go first as floors, then the remainder lands on the
 * strata with the largest fractional part; a stratum that hits its capacity is
 * skipped and its surplus is redistributed to strata that still have room — so
 * the realized n matches the request even when a stratum is too small to fill.
 * @param {number} n
 * @param {Array} sizes  [{ key, size }]
 * @param {string} mode  'proportional' | 'equal'
 * @returns {Object} key -> n_h
 */
export function allocateLargestRemainder(n, sizes, mode) {
  const H = sizes.length
  const totalCap = sizes.reduce((a, s) => a + s.size, 0)
  const target = Math.max(0, Math.min(n, totalCap))
  const out = {}
  for (const s of sizes) out[s.key] = 0
  if (!H || target === 0) return out

  const totalSize = totalCap || 1
  const parts = sizes.map(s => {
    const ideal = mode === 'equal' ? target / H : target * s.size / totalSize
    return { key: s.key, size: s.size, n: Math.min(s.size, Math.floor(ideal)), frac: ideal - Math.floor(ideal) }
  })
  let assigned = parts.reduce((a, p) => a + p.n, 0)
  // Give out the remaining units, largest fractional part first; loop so that
  // capacity-driven deficits are redistributed until target is met or every
  // stratum is saturated. Ties: larger stratum, then key — fully deterministic.
  while (assigned < target) {
    const cand = parts.filter(p => p.n < p.size)
    if (!cand.length) break
    cand.sort((a, b) => (b.frac - a.frac) || (b.size - a.size) || (a.key < b.key ? -1 : 1))
    for (const p of cand) {
      if (assigned >= target) break
      p.n += 1; assigned += 1
      p.frac = 0 // served this pass; further passes round-robin by size
    }
  }
  for (const p of parts) out[p.key] = p.n
  return out
}

// ── Stratified sample (proportional [default] or equal allocation) ──────────
function stratified(frame, n, vars, allocation, rng, design) {
  const groups = groupBy(frame, b => strataKey(b, vars, design))
  const keys = Array.from(groups.keys())
  const out = []
  // Explicit per-stratum counts pass straight through; a 'proportional'/'equal'
  // string is resolved by largest-remainder so the realized n matches the request.
  let alloc
  if (allocation && typeof allocation === 'object') {
    alloc = allocation
  } else {
    const sizes = keys.map(k => ({ key: k, size: groups.get(k).length }))
    alloc = allocateLargestRemainder(n, sizes, allocation === 'equal' ? 'equal' : 'proportional')
  }
  for (const k of keys) {
    const stratum = groups.get(k)
    let nh = alloc[k] != null ? alloc[k] : 0
    nh = Math.min(nh, stratum.length)
    const drawn = shuffle(stratum, rng).slice(0, nh)
    const w = nh > 0 ? stratum.length / nh : 0            // design weight = N_h / n_h
    drawn.forEach(b => out.push({ blob: b, weight: w, stratum: k }))
  }
  return out
}

// ── Systematic sample (every k-th unit, seeded random start) ────────────────
function systematic(frame, n, rng) {
  const N = frame.length
  if (!N || !n) return []
  const k = Math.max(1, Math.floor(N / Math.min(n, N)))
  const start = Math.floor(rng() * k)
  const picked = []
  for (let i = start; i < N && picked.length < n; i += k) picked.push(frame[i])
  const w = picked.length ? N / picked.length : 0
  return picked.map(b => ({ blob: b, weight: w, stratum: null }))
}

// ── Cluster sample (one-stage; optional within-cluster subsample) ───────────
function cluster(frame, design, rng) {
  const v = design.clusterVar || 'district'
  const groups = groupBy(frame, accessorFor(v, design))
  const keys = shuffle(Array.from(groups.keys()), rng)
  const totalClusters = keys.length
  const numClusters = Math.min(design.numClusters || totalClusters, totalClusters)
  const out = []
  for (const k of keys.slice(0, numClusters)) {
    const all = groups.get(k)
    const members = design.withinClusterN
      ? shuffle(all, rng).slice(0, design.withinClusterN)
      : all
    // weight = (clusters / sampled clusters) * (cluster size / sampled-in-cluster)
    const w = (totalClusters / numClusters) * (members.length > 0 ? all.length / members.length : 0)
    members.forEach(b => out.push({ blob: b, weight: w, stratum: k }))
  }
  return out
}

// ── Quota sample (non-probability: fill a target count per cell) ────────────
function quota(frame, design, rng) {
  const vars = design.strataVars || []
  const targets = design.quotas || {}
  const groups = groupBy(frame, b => strataKey(b, vars, design))
  const out = []
  for (const cell in targets) {
    const pool = groups.get(cell) || []
    const drawn = shuffle(pool, rng).slice(0, targets[cell])
    drawn.forEach(b => out.push({ blob: b, weight: 1, stratum: cell })) // quota -> no probability weight
  }
  return out
}

/**
 * Draw a sample according to a (calibratable) design.
 * @param {Array} blobs   full population
 * @param {Object} design { technique, n, seed, strataVars, allocation,
 *                          clusterVar, numClusters, withinClusterN, quotas,
 *                          eligibility, accessors }
 */
export function drawSample(blobs, design) {
  design = design || {}
  const seed = design.seed != null ? design.seed : 12345
  const rng = makeRng(seed)
  const frameOpts = Object.assign({}, design.eligibility, {
    filter: design.filter
    , manualExclude: design.manualExclude
    , accessors: design.accessors
  })
  const frame = eligibleFrame(blobs, frameOpts)
  let units
  switch (design.technique) {
    case SAMPLING.STRATIFIED:
      units = stratified(frame, design.n || 0, design.strataVars || ['district'], design.allocation, rng, design)
      break
    case SAMPLING.CLUSTER:
      units = cluster(frame, design, rng)
      break
    case SAMPLING.SYSTEMATIC:
      units = systematic(frame, design.n || 0, rng)
      break
    case SAMPLING.QUOTA:
      units = quota(frame, design, rng)
      break
    case SAMPLING.MANUAL:
      // Self-selected: start empty; the manualInclude pass below fills it.
      units = []
      break
    case SAMPLING.SRS:
    default:
      units = srs(frame, design.n || 0, rng)
      break
  }
  // Manual override: force-include specific blobs not already drawn.
  if (design.manualInclude && design.manualInclude.length) {
    const present = new Set(units.map(u => u.blob.id))
    const byId = {}
    for (const b of blobs) byId[b.id] = b
    for (const id of design.manualInclude) {
      if (!present.has(id) && byId[id]) {
        units.push({ blob: byId[id], weight: 1, stratum: 'manuell' })
        present.add(id)
      }
    }
  }
  return {
    units: units
    , frameSize: frame.length
    , populationSize: blobs.length
    , realizedN: units.length
    , technique: design.technique || SAMPLING.SRS
    , seed: seed
  }
}

/** Tally one variable across sampled units (for the realized-distribution preview). */
export function realizedDistribution(units, varName, design) {
  const acc = accessorFor(varName, design || {})
  const counts = {}
  for (const u of units) {
    const k = acc(u.blob)
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
}
