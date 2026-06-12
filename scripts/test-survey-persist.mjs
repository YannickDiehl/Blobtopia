/**
 * Functional test für Etappe A: Studien-Persistenz (Serialize/Parse-Roundtrip,
 * Validierung), systematische Auswahl, Stichprobenumfangs-Planer und
 * Codebook-CSV.
 * Run:  node scripts/test-survey-persist.mjs
 */
import { serializeStudy, parseStudy, STUDY_VERSION } from '../src/lib/survey-persist.js'
import { drawSample, SAMPLING, planSampleSize } from '../src/lib/survey-sampling.js'
import { codebookToCSV } from '../src/lib/survey-dataset.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { toCSV } from '../src/lib/survey-dataset.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

function makeBlob(i) {
  return {
    id: 'b' + i, age: 20 + (i % 45), income: 1000 + (i % 9) * 400
    , education_level: i % 4, district: i % 5
    , attitudes: { political_satisfaction: (i * 7) % 11, institutional_trust: (i * 3) % 11 }
    , latent_traits: { party_indifference: i % 11 }, political_state: {}
  }
}
const blobs = []
for (let i = 0; i < 300; i++) blobs.push(makeBlob(i))

const items = [{ id: 'q1', text: 'Wie zufrieden? 1 bis 10.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'political_satisfaction', wording: {} }]
const design = { technique: 'srs', n: 40, seed: 99, eligibility: { excludeMinors: true } }

console.log('Studien-Datei: Roundtrip + Replay-Determinismus:')
{
  const text = serializeStudy({ items, design, tick: 3000 })
  const back = parseStudy(text)
  ok(back.tick === 3000 && back.items.length === 1 && back.design.seed === 99, 'Serialize→Parse erhält Items, Design, Feld-Tick')
  // Replay: gleiche Studie ⇒ byte-identisches CSV
  const run = (d, it) => {
    const sample = drawSample(blobs, d)
    return toCSV(runSyntheticSurvey(sample.units, it, { seed: d.seed }).rows, it)
  }
  ok(run(design, items) === run(back.design, back.items), 'Import + Durchführen ⇒ byte-identischer Datensatz')
}

console.log('Studien-Datei: Validierung weist Müll ab:')
{
  const fails = ['kein json', '{}', JSON.stringify({ type: 'blobtopia-studie', version: STUDY_VERSION + 1, items: [], design: {} })
    , JSON.stringify({ type: 'blobtopia-studie', version: 1, items: 'nope', design: {} })]
  ok(fails.every(t => { try { parseStudy(t); return false } catch (_e) { return true } }), 'JSON-Müll, falscher Typ, zu neue Version, kaputte items → Fehler')
}

console.log('Systematische Auswahl:')
{
  const d = { technique: SAMPLING.SYSTEMATIC, n: 30, seed: 5, eligibility: { excludeMinors: true } }
  const a = drawSample(blobs, d)
  const b = drawSample(blobs, d)
  ok(a.units.length === 30, 'zieht n Einheiten (' + a.units.length + ')')
  ok(JSON.stringify(a.units.map(u => u.blob.id)) === JSON.stringify(b.units.map(u => u.blob.id)), 'seeded: gleicher Start, gleiche Auswahl')
  const ids = a.units.map(u => blobs.findIndex(x => x.id === u.blob.id))
  const k = ids[1] - ids[0]
  ok(ids.every((v, i) => i === 0 || v - ids[i - 1] === k), 'konstantes Intervall k=' + k)
  ok(Math.abs(a.units[0].weight * a.units.length - blobs.length) < 1e-9, 'Designgewicht = N/n')
}

console.log('Stichprobenumfangs-Planer (mit fpc):')
{
  ok(planSampleSize({ e: 0.5, sigma: 2.25, N: 380 }) === 65, '±0,5 bei σ=2,25, N=380 → n=65')
  ok(planSampleSize({ e: 0.5, sigma: 2.25 }) === 78, 'ohne fpc → n=78')
  ok(planSampleSize({ e: 0, sigma: 2.25 }) === null && planSampleSize({ e: 1 }) === null, 'unsinnige Eingaben → null')
}

console.log('Codebook-CSV:')
{
  const csv = codebookToCSV(items, { political_satisfaction: 'Politische Zufriedenheit' })
  const lines = csv.split('\r\n')
  ok(lines[0].indexOf('variable') >= 0 && lines[0].indexOf('misst') >= 0, 'Header mit variable…misst')
  ok(lines[1].indexOf('q1') === 0 && lines[1].indexOf('Politische Zufriedenheit') > 0, 'Zeile trägt Variable + Konstrukt-Label')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
