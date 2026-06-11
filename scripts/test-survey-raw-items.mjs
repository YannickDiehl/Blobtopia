/**
 * Functional test für erfragbare demografische Selbstauskünfte (raw-Konstrukte:
 * Alter, Einkommen) — echte Größen statt 0–10-Skala, mit modelliertem
 * Antwortverhalten: Alter exakt, Einkommen unterberichtet + geheapt + als
 * sensible Frage öfter verweigert. Die Wahrheits-Zerlegung muss auch auf
 * offenen Zahlenfragen exakt aufgehen.
 * Run:  node scripts/test-survey-raw-items.mjs
 */
import { parseItem } from '../src/lib/survey-parse.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { trueValueOnItemScale, snapshotTruth, decompose } from '../src/lib/survey-truth.js'
import { drawSample } from '../src/lib/survey-sampling.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length }
function answered(rows, id) {
  return rows.map(r => r.answers[id]).filter(a => a.status === 'answered').map(a => a.value)
}

function makeBlob(i) {
  return {
    id: 'b' + i, age: 20 + (i % 45), income: 1200 + (i % 10) * 350
    , education_level: i % 4, district: i % 5
    , attitudes: { political_satisfaction: 5, institutional_trust: 5 + (i % 5) }
    , latent_traits: { party_indifference: i % 10 }, political_state: {}
  }
}
const blobs = []
for (let i = 0; i < 300; i++) blobs.push(makeBlob(i))
const units = blobs.map(b => ({ blob: b, weight: 1, stratum: null }))

console.log('parseItem erkennt demografische Selbstauskünfte:')
{
  const age = parseItem('Wie alt sind Sie?')
  ok(age.construct === 'age' && age.scale.format === 'open', 'Altersfrage → age, offene Zahlenangabe')
  const ranged = parseItem('Wie alt sind Sie? Bitte in Jahren von 18 bis 99.')
  ok(ranged.construct === 'age' && ranged.scale.min === 18 && ranged.scale.max === 99, 'expliziter Bereich (auch >10) wird übernommen')
  const inc = parseItem('Wie hoch ist Ihr monatliches Nettoeinkommen?')
  ok(inc.construct === 'income' && inc.scale.format === 'open', 'Einkommensfrage → income, offen')
}

const ageItem = { id: 'qa', text: 'Wie alt sind Sie?', scale: { min: null, max: null, format: 'open' }, construct: 'age', wording: {} }
const incItem = { id: 'qi', text: 'Wie hoch ist Ihr Einkommen?', scale: { min: null, max: null, format: 'open' }, construct: 'income', wording: {} }

console.log('Alter: exakte Selbstauskunft (Antwort = wahres Alter):')
{
  const { rows } = runSyntheticSurvey(units, [ageItem], { seed: 7 })
  const exact = rows.filter(r => r.answers.qa.status === 'answered')
    .every(r => r.answers.qa.value === blobs.find(b => b.id === r.blobId).age)
  ok(exact, 'alle beantworteten Altersangaben stimmen mit dem wahren Alter überein')
  ok(answered(rows, 'qa').length > 250, 'Nonresponse beim Alter bleibt niedrig (' + (300 - answered(rows, 'qa').length) + '/300)')
}

console.log('Einkommen: Underreporting + Heaping + sensible Verweigerung:')
{
  const { rows } = runSyntheticSurvey(units, [ageItem, incItem], { seed: 7 })
  const vals = answered(rows, 'qi')
  ok(vals.every(v => v % 100 === 0), 'Heaping: alle Angaben auf glatte 100er gerundet')
  const trueMean = mean(blobs.map(b => b.income))
  const ratio = mean(vals) / trueMean
  ok(ratio > 0.85 && ratio < 0.99, 'Underreporting: berichtetes Mittel ≈ ' + Math.round(ratio * 100) + '% der Wahrheit')
  const refusedInc = rows.filter(r => r.answers.qi.status === 'refused').length
  const refusedAge = rows.filter(r => r.answers.qa.status === 'refused').length
  ok(refusedInc > refusedAge * 2, 'sensible Frage wird öfter verweigert (Einkommen ' + refusedInc + ' vs. Alter ' + refusedAge + ')')
}

console.log('Wahrheit auf der echten Skala:')
{
  const b = makeBlob(3)
  ok(trueValueOnItemScale(b, ageItem) === b.age, 'wahres Alter bleibt unskaliert')
  const ranged = { ...ageItem, scale: { min: 30, max: 40, format: 'numeric' } }
  ok(trueValueOnItemScale(makeBlob(0), ranged) === 30, 'expliziter Bereich klemmt die Wahrheit (Alter 20 → 30)')
}

console.log('TSE-Zerlegung geht auch auf offenen Zahlenfragen exakt auf:')
{
  const design = { technique: 'srs', n: 80, seed: 11, eligibility: { excludeMinors: true } }
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, [ageItem, incItem], { seed: 11 })
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items: [ageItem, incItem] })
  result.meta.technique = design.technique
  result.meta.frameSize = sample.frameSize
  const dec = decompose(result, [ageItem, incItem])
  for (const d of dec) {
    const sum = d.coverage + d.sampling + d.nonresponse + d.measurement
    ok(Math.abs(sum - d.total) < 1e-9, d.id + ': ①+②+③+④ ≡ Schätzer − Wahrheit')
  }
  ok(Math.abs(dec[0].measurement) < 0.6, 'Alter: kein nennenswerter Messfehler (' + dec[0].measurement.toFixed(2) + ')')
  ok(dec[1].measurement < -100, 'Einkommen: systematischer Messfehler nach unten (' + Math.round(dec[1].measurement) + ' €)')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
