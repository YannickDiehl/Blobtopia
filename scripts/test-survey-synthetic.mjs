/**
 * Functional test for the synthetic answer engine + construct registry.
 * Run:  node scripts/test-survey-synthetic.mjs
 */
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { CONSTRUCTS_BY_KEY, suggestConstruct } from '../src/lib/survey-constructs.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

function blob(id, opts) {
  return {
    id: id
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
const scaleItem = (construct) => ({ id: 'q', type: 'scale', text: 'x', scale: { min: 1, max: 10 }, construct })

console.log('registry:')
ok(Object.keys(CONSTRUCTS_BY_KEY).length >= 25, 'registry has the measurable constructs (' + Object.keys(CONSTRUCTS_BY_KEY).length + ')')
ok(CONSTRUCTS_BY_KEY.self_efficacy.get({ latent_traits: { self_efficacy: 7 } }) === 7, 'construct accessor reads stored value')

console.log('synthetic answers track the stored value (+noise):')
{
  const u = units(300, { eff: 8, pi: 2, trust: 8 })
  const { rows } = runSyntheticSurvey(u, [scaleItem('self_efficacy')], { seed: 7 })
  const vals = rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value)
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  ok(vals.every(v => v >= 1 && v <= 10), 'all answers within the 1–10 scale')
  ok(mean > 7 && mean < 9, 'mean ≈ rescaled stored value 8 (got ' + mean.toFixed(2) + ')')
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

console.log('unsupported items (no binding / open / choice):')
{
  const u = units(10, { eff: 5, pi: 5, trust: 5 })
  const r1 = runSyntheticSurvey(u, [{ id: 'q', type: 'scale', scale: { min: 1, max: 10 }, construct: null }], {})
  ok(r1.rows.every(r => r.answers.q.status === 'unsupported'), 'unbound item → unsupported')
  const r2 = runSyntheticSurvey(u, [{ id: 'q', type: 'open', construct: 'self_efficacy' }], {})
  ok(r2.rows.every(r => r.answers.q.status === 'unsupported'), 'open item → unsupported (needs LLM)')
}

console.log('binary thresholding:')
{
  const u = units(300, { eff: 9, pi: 2, trust: 8 })
  const { rows } = runSyntheticSurvey(u, [{ id: 'q', type: 'binary', construct: 'self_efficacy' }], { seed: 3 })
  const ones = rows.filter(r => r.answers.q.status === 'answered' && r.answers.q.value === 1).length
  ok(ones / rows.length > 0.7, 'high stored value → mostly 1 (' + ones + '/' + rows.length + ')')
}

console.log('modeled nonresponse (non-random):')
{
  const u = units(300, { eff: 5, pi: 10, trust: 0 })
  const { rows } = runSyntheticSurvey(u, [scaleItem('self_efficacy')], { seed: 5 })
  const nonresp = rows.filter(r => r.answers.q.status !== 'answered').length
  ok(nonresp > 5, 'high party-indifference + low trust → some dont-know/refusal (' + nonresp + ')')
}

console.log('auto-suggest:')
ok(suggestConstruct('Wie zufrieden sind Sie mit der Politik?') === 'political_satisfaction', 'suggests satisfaction')
ok(suggestConstruct('Politiker haben den Kontakt zum Volk verloren') === 'anti_elitism', 'suggests anti-elitism')
ok(suggestConstruct('Mein Lieblingsessen?') === null, 'no match → null')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
