/**
 * Functional test for the synthetic answer engine (free-text item model +
 * modeled questionnaire effects).
 * Run:  node scripts/test-survey-synthetic.mjs
 */
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { CONSTRUCTS_BY_KEY } from '../src/lib/survey-constructs.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length }
function answeredValues(rows) {
  return rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value)
}

function blob(id, opts) {
  return {
    id: id
    , education_level: opts.edu != null ? opts.edu : 2
    , attitudes: { political_satisfaction: opts.sat, institutional_trust: opts.trust }
    , latent_traits: { self_efficacy: opts.eff, party_indifference: opts.pi }
    , political_state: {}
  }
}
function units(n, opts) {
  const u = []
  for (let i = 0; i < n; i++) u.push({ blob: blob('b' + i, opts), stratum: null, weight: 1 })
  return u
}
// New item model: free text + detected scale{format} + construct (+ optional wording).
const scaleItem = (construct, wording) => ({
  id: 'q', text: 'x', scale: { min: 1, max: 10, format: 'numeric' }, construct: construct, wording: wording || {}
})

console.log('registry:')
ok(Object.keys(CONSTRUCTS_BY_KEY).length >= 25, 'registry has the measurable constructs (' + Object.keys(CONSTRUCTS_BY_KEY).length + ')')
ok(CONSTRUCTS_BY_KEY.self_efficacy.get({ latent_traits: { self_efficacy: 7 } }) === 7, 'construct accessor reads stored value')

console.log('synthetic answers track the stored value (+noise):')
{
  const { rows } = runSyntheticSurvey(units(300, { eff: 8, pi: 2, trust: 8 }), [scaleItem('self_efficacy')], { seed: 7 })
  const vals = answeredValues(rows)
  ok(vals.every(v => v >= 1 && v <= 10), 'all answers within the 1–10 scale')
  ok(mean(vals) > 7 && mean(vals) < 9, 'mean ≈ rescaled stored value 8 (got ' + mean(vals).toFixed(2) + ')')
}

console.log('reproducibility:')
{
  const u = units(50, { eff: 6, pi: 3, trust: 6 })
  const a = runSyntheticSurvey(u, [scaleItem('self_efficacy')], { seed: 11 })
  const b = runSyntheticSurvey(u, [scaleItem('self_efficacy')], { seed: 11 })
  ok(JSON.stringify(a.rows) === JSON.stringify(b.rows), 'same seed → identical dataset')
  const c = runSyntheticSurvey(u, [scaleItem('self_efficacy')], { seed: 99 })
  ok(JSON.stringify(a.rows) !== JSON.stringify(c.rows), 'different seed → different dataset')
}

console.log('unsupported items (no construct binding):')
{
  const r1 = runSyntheticSurvey(units(10, { eff: 5, pi: 5, trust: 5 }), [scaleItem(null)], {})
  ok(r1.rows.every(r => r.answers.q.status === 'unsupported'), 'unbound item → unsupported (needs a construct)')
}

console.log('binary format thresholding:')
{
  const item = { id: 'q', text: 'x', scale: { min: 0, max: 1, format: 'binary' }, construct: 'self_efficacy' }
  const { rows } = runSyntheticSurvey(units(300, { eff: 9, pi: 2, trust: 8 }), [item], { seed: 3 })
  const ones = rows.filter(r => r.answers.q.status === 'answered' && r.answers.q.value === 1).length
  ok(ones / rows.length > 0.7, 'high stored value → mostly 1 (' + ones + '/' + rows.length + ')')
}

console.log('modeled nonresponse (non-random):')
{
  const { rows } = runSyntheticSurvey(units(300, { eff: 5, pi: 10, trust: 0 }), [scaleItem('self_efficacy')], { seed: 5 })
  const nonresp = rows.filter(r => r.answers.q.status !== 'answered').length
  ok(nonresp > 5, 'high party-indifference + low trust → some dont-know/refusal (' + nonresp + ')')
}

console.log('modeled questionnaire effects (the teachable point):')
{
  // Same construct + same blobs, two wordings. Low education amplifies acquiescence.
  const u = units(400, { eff: 5, pi: 1, trust: 9, edu: 0 })
  const neutral = mean(answeredValues(runSyntheticSurvey(u, [scaleItem('self_efficacy', {})], { seed: 4 }).rows))
  const acquiesce = mean(answeredValues(runSyntheticSurvey(u, [scaleItem('self_efficacy', { agreeScale: true })], { seed: 4 }).rows))
  ok(acquiesce > neutral + 0.3, 'acquiescence wording raises the mean (' + neutral.toFixed(2) + ' → ' + acquiesce.toFixed(2) + ')')

  const pos = mean(answeredValues(runSyntheticSurvey(u, [scaleItem('self_efficacy', { loadedPositive: true })], { seed: 4 }).rows))
  const neg = mean(answeredValues(runSyntheticSurvey(u, [scaleItem('self_efficacy', { loadedNegative: true })], { seed: 4 }).rows))
  ok(pos > neg + 1.0, 'positive vs negative framing shifts the mean (' + neg.toFixed(2) + ' vs ' + pos.toFixed(2) + ')')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
