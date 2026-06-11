/**
 * Functional test for the ground-truth / TSE-decomposition lib
 * (src/lib/survey-truth.js) — the heart of the Wahrheit-Lernansicht.
 * Run:  node scripts/test-survey-truth.mjs
 */
import {
  trueValueOnItemScale, snapshotTruth, decompose, simulateSamplingDistribution
} from '../src/lib/survey-truth.js'
import { drawSample } from '../src/lib/survey-sampling.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { toCSV } from '../src/lib/survey-dataset.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length }

// Deterministic fake population: trust correlates with district (the lever the
// weighting / selection tests need), satisfaction varies independently.
function makeBlob(i, district, trust) {
  return {
    id: 'b' + i
    , district: district
    , age: 20 + (i % 50)
    , education_level: i % 4
    , income: 1000 + (i % 9) * 400
    , attitudes: {
      political_satisfaction: (i * 7) % 11
      , institutional_trust: trust
    }
    , latent_traits: { party_indifference: (i * 3) % 11 }
    , political_state: {}
  }
}
// 5 districts: trust = district * 2.5 (0, 2.5, 5, 7.5, 10) — very unequal
// sizes so equal allocation REQUIRES weights to recover the frame mean.
function makePopulation() {
  const blobs = []
  let i = 0
  const sizes = [200, 25, 25, 25, 25]
  for (let d = 0; d < 5; d++) {
    for (let k = 0; k < sizes[d]; k++) blobs.push(makeBlob(i++, d, d * 2.5))
  }
  return blobs
}
const item = (id, construct, scaleMin, scaleMax) => ({
  id: id, text: 'x'
  , scale: { min: scaleMin != null ? scaleMin : 1, max: scaleMax != null ? scaleMax : 10, format: 'numeric' }
  , construct: construct, wording: {}
})

// Wire a result the way the store does (truth snapshot in meta).
function runPipeline(blobs, design, items) {
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, items, { seed: design.seed })
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items })
  result.meta.technique = design.technique
  result.meta.frameSize = sample.frameSize
  return result
}

console.log('trueValueOnItemScale (continuous mapping, no rounding):')
{
  const b = makeBlob(0, 2, 5)
  ok(trueValueOnItemScale(b, item('q', 'institutional_trust', 1, 10)) === 5.5, 'stored 5 on a 1–10 scale → 5.5')
  ok(trueValueOnItemScale(makeBlob(0, 0, 0), item('q', 'institutional_trust', 1, 10)) === 1, 'stored 0 → scale min')
  ok(trueValueOnItemScale(makeBlob(0, 4, 10), item('q', 'institutional_trust', 1, 10)) === 10, 'stored 10 → scale max')
  const bin = { id: 'q', scale: { min: 0, max: 1, format: 'binary' }, construct: 'institutional_trust' }
  ok(trueValueOnItemScale(makeBlob(0, 2, 6), bin) === 1 && trueValueOnItemScale(makeBlob(0, 1, 4), bin) === 0, 'binary thresholds at the midpoint')
  ok(trueValueOnItemScale(b, { id: 'q', scale: { min: 1, max: 10 }, construct: null }) === null, 'no construct → no truth')
}

console.log('snapshotTruth (population vs frame):')
{
  const blobs = makePopulation()
  const items = [item('q1', 'institutional_trust')]
  const design = { technique: 'srs', n: 40, seed: 7, eligibility: { excludeMinors: true }, filter: { districts: [0] } }
  const sample = drawSample(blobs, design)
  const t = snapshotTruth({ blobs, design, units: sample.units, items })
  ok(t.popN === blobs.length, 'population = eligibility only (all ' + t.popN + ' adults)')
  ok(t.frameN === 200, 'frame respects the district filter (' + t.frameN + ')')
  ok(Math.abs(t.items.q1.frameMean - 1) < 1e-9, 'frameMean = district-0 truth on the item scale')
  ok(t.items.q1.popMean > t.items.q1.frameMean, 'filtered frame under-covers high-trust districts')
  ok(Object.keys(t.perUnit).length === sample.units.length, 'perUnit truth for every sampled blob')
}

console.log('decompose: the telescoping identity holds exactly:')
{
  const blobs = makePopulation()
  const items = [item('q1', 'institutional_trust'), item('q2', 'political_satisfaction')]
  const design = { technique: 'srs', n: 60, seed: 11, eligibility: { excludeMinors: true } }
  const result = runPipeline(blobs, design, items)
  const dec = decompose(result, items)
  for (const d of dec) {
    const sum = d.coverage + d.sampling + d.nonresponse + d.measurement
    ok(Math.abs(sum - d.total) < 1e-9, d.id + ': ①+②+③+④ ≡ Schätzer − Wahrheit (' + sum.toFixed(4) + ')')
    ok(Math.abs(d.total - (d.estimate - d.popMean)) < 1e-9, d.id + ': total = estimate − popMean')
  }
  ok(dec[0].se != null && dec[0].se > 0, 'SRS yields a standard error (' + dec[0].se.toFixed(3) + ')')
  ok(dec[0].ci95 && dec[0].ci95[0] < dec[0].estimate && dec[0].ci95[1] > dec[0].estimate, 'CI brackets the estimate')
}

console.log('design weights repair disproportional allocation:')
{
  const blobs = makePopulation()
  const items = [item('q1', 'institutional_trust')]
  const design = {
    technique: 'stratified', n: 50, seed: 13, strataVars: ['district']
    , allocation: 'equal', eligibility: { excludeMinors: true }
  }
  const result = runPipeline(blobs, design, items)
  const d = decompose(result, items)[0]
  // Unweighted true mean of an equal-allocation sample ≈ mean of district
  // means (≈5.05 on the 1–10 scale); the frame truth is dominated by the big
  // low-trust district (≈2.9). Weights must pull the estimate back.
  const unweighted = mean(result.rows.map(r => result.meta.truth.perUnit[r.blobId].q1))
  ok(Math.abs(d.sampleTrueMean - d.frameMean) < Math.abs(unweighted - d.frameMean) - 0.5
    , 'weighted sample truth ≈ frame truth (' + d.sampleTrueMean.toFixed(2) + ' vs unweighted ' + unweighted.toFixed(2) + ', frame ' + d.frameMean.toFixed(2) + ')')
  ok(d.se != null && d.se > 0, 'stratified standard error computed (' + d.se.toFixed(3) + ')')
}

console.log('non-probability designs are flagged honestly:')
{
  const blobs = makePopulation()
  const items = [item('q1', 'institutional_trust')]
  const design = {
    technique: 'quota', n: 50, seed: 17, strataVars: ['district']
    , quotas: { 0: 10, 1: 10, 2: 10, 3: 10, 4: 10 }, eligibility: { excludeMinors: true }
  }
  const result = runPipeline(blobs, design, items)
  const d = decompose(result, items)[0]
  ok(d.se == null && /kein Zufallsdesign/.test(d.seNote), 'quota → no SE, teaching note instead')
  ok(Math.abs((d.coverage + d.sampling + d.nonresponse + d.measurement) - d.total) < 1e-9, 'identity also holds under quota')
}

console.log('items without construct / decompose edge cases:')
{
  const blobs = makePopulation()
  const items = [item('q1', null)]
  const design = { technique: 'srs', n: 30, seed: 19, eligibility: { excludeMinors: true } }
  const result = runPipeline(blobs, design, items)
  const d = decompose(result, items)[0]
  ok(d.available === false && /Konstrukt/.test(d.reason), 'unbound item → unavailable with reason')
}

console.log('simulateSamplingDistribution (deterministic, bias survives):')
{
  const blobs = makePopulation()
  const items = [item('q1', 'institutional_trust')]
  const design = { technique: 'srs', n: 80, seed: 23, eligibility: { excludeMinors: true } }
  const a = await simulateSamplingDistribution(blobs, design, items, { replications: 60 })
  const b = await simulateSamplingDistribution(blobs, design, items, { replications: 60 })
  ok(a.perItem.q1.estimates.length === 60, 'one estimate per replication')
  ok(JSON.stringify(a.perItem.q1.estimates) === JSON.stringify(b.perItem.q1.estimates), 'same seed → identical distribution')
  ok(a.perItem.q1.sd > 0, 'estimator has spread (sd ' + a.perItem.q1.sd.toFixed(3) + ')')
  const truth = snapshotTruth({ blobs, design, units: [], items }).items.q1.popMean
  ok(Math.abs(a.perItem.q1.mean - truth) < 0.6, 'SRS distribution centers near the truth (' + a.perItem.q1.mean.toFixed(2) + ' vs ' + truth.toFixed(2) + ')')

  // Manual selection: hand-pick only the high-trust district — the bias must
  // survive every replication (selection bias is not noise).
  const picked = blobs.filter(bl => bl.district === 4).slice(0, 30).map(bl => bl.id)
  const manual = { technique: 'manual', seed: 23, manualInclude: picked, eligibility: { excludeMinors: true } }
  const m = await simulateSamplingDistribution(blobs, manual, items, { replications: 40 })
  ok(m.perItem.q1.estimates.every(e => e > truth + 2), 'hand-picked high-trust sample stays biased across all replications')
}

console.log('instructor CSV (truth columns):')
{
  const blobs = makePopulation()
  const items = [item('q1', 'institutional_trust')]
  const design = { technique: 'srs', n: 20, seed: 29, eligibility: { excludeMinors: true } }
  const result = runPipeline(blobs, design, items)
  const student = toCSV(result.rows, items)
  const instructor = toCSV(result.rows, items, { truth: result.meta.truth })
  ok(student.indexOf('q1_wahr') < 0, 'student CSV stays truth-free')
  ok(instructor.split('\r\n')[0].indexOf('q1_wahr') >= 0, 'instructor CSV gains the q1_wahr column')
  const header = instructor.split('\r\n')[0].split(';')
  const firstRow = instructor.split('\r\n')[1].split(';')
  const idx = header.indexOf('q1_wahr')
  ok(idx >= 0 && firstRow[idx] !== '', 'truth cell is populated')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
