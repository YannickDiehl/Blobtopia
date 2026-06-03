/**
 * Functional smoke test for src/lib/survey-sampling.js (no framework).
 * Run:  node scripts/test-survey-sampling.mjs
 */
import {
  SAMPLING, drawSample, eligibleFrame, realizedDistribution, makeRng
} from '../src/lib/survey-sampling.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

// Synthetic population: 200 blobs across 5 districts, 4 education levels,
// ages 10..79 (so ~some minors), is_child set for age < 18.
const POP = []
for (let i = 0; i < 200; i++) {
  const age = 10 + (i % 70)
  POP.push({
    id: 'b' + i
    , district: i % 5
    , education_level: i % 4
    , age: age
    , income: 1000 + (i % 50) * 80
    , is_child: age < 18
  })
}
const adults = POP.filter(b => b.age >= 18).length

console.log('eligibleFrame:')
ok(eligibleFrame(POP).length === adults, 'excludes minors by default (' + eligibleFrame(POP).length + ' of ' + POP.length + ')')
ok(eligibleFrame(POP, { excludeMinors: false }).length === POP.length, 'can include minors')
ok(eligibleFrame(POP, { predicate: b => b.district === 0 }).every(b => b.district === 0), 'subpopulation predicate filters')

console.log('SRS:')
const a = drawSample(POP, { technique: SAMPLING.SRS, n: 30, seed: 42 })
ok(a.realizedN === 30, 'draws requested n (' + a.realizedN + ')')
ok(a.units.every(u => u.blob.age >= 18), 'no minors in sample')
ok(new Set(a.units.map(u => u.blob.id)).size === 30, 'distinct units (no duplicates)')
const a2 = drawSample(POP, { technique: SAMPLING.SRS, n: 30, seed: 42 })
ok(JSON.stringify(a.units.map(u => u.blob.id)) === JSON.stringify(a2.units.map(u => u.blob.id)), 'same seed -> identical sample (reproducible)')
const a3 = drawSample(POP, { technique: SAMPLING.SRS, n: 30, seed: 99 })
ok(JSON.stringify(a.units.map(u => u.blob.id)) !== JSON.stringify(a3.units.map(u => u.blob.id)), 'different seed -> different sample')
ok(Math.abs(a.units[0].weight - a.frameSize / 30) < 1e-9, 'SRS design weight = N/n')

console.log('Stratified (proportional by district):')
const s = drawSample(POP, { technique: SAMPLING.STRATIFIED, n: 25, strataVars: ['district'], seed: 7 })
const sDist = realizedDistribution(s.units, 'district')
ok(Object.keys(sDist).length === 5, 'all 5 district strata represented (' + JSON.stringify(sDist) + ')')
ok(s.units.every(u => u.weight > 0), 'every unit carries a positive design weight')
ok(s.units.every(u => u.blob.age >= 18), 'no minors in stratified sample')

console.log('Cluster (2 of 5 districts):')
const c = drawSample(POP, { technique: SAMPLING.CLUSTER, clusterVar: 'district', numClusters: 2, seed: 3 })
ok(new Set(c.units.map(u => u.blob.district)).size === 2, 'sample spans exactly 2 clusters')
ok(c.units.length > 0, 'cluster sample is non-empty')

console.log('Quota (district cells):')
const q = drawSample(POP, { technique: SAMPLING.QUOTA, strataVars: ['district'], quotas: { '0': 5, '1': 8 }, seed: 1 })
const qDist = realizedDistribution(q.units, 'district')
ok(qDist['0'] === 5, 'district 0 quota filled to 5 (' + qDist['0'] + ')')
ok(qDist['1'] === 8, 'district 1 quota filled to 8 (' + qDist['1'] + ')')
ok(q.units.every(u => u.weight === 1), 'quota units carry no probability weight (=1)')

console.log('PRNG:')
const r1 = makeRng(123), r2 = makeRng(123)
ok(r1() === r2() && r1() === r2(), 'mulberry32 deterministic per seed')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
