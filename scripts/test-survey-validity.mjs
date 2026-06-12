/**
 * Functional test für Etappe D: Messfehler-Aufschlüsselung (fx → Teile),
 * Mischmodell-Validität (λ, Kreuzladung) und Reliabilität (Cronbachs α
 * gegen die wahre Reliabilität).
 * Run:  node scripts/test-survey-validity.mjs
 */
import { scoreConstructs, analyzeValidity } from '../src/lib/survey-constructs.js'
import { parseItem } from '../src/lib/survey-parse.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { drawSample } from '../src/lib/survey-sampling.js'
import { snapshotTruth, decompose } from '../src/lib/survey-truth.js'
import { reliabilityReport } from '../src/lib/survey-reliability.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length }

function makeBlob(i) {
  return {
    id: 'b' + i, district: i % 5, age: 20 + (i % 45), income: 2000
    , education_level: i % 4
    , attitudes: { political_satisfaction: 2 + (i % 3), institutional_trust: 8 - (i % 3) }
    , latent_traits: { party_indifference: (i * 3) % 11, generalized_trust: 5, community_participation: 5, powerlessness: 3 }
    , political_state: {}
  }
}
const blobs = []
for (let i = 0; i < 300; i++) blobs.push(makeBlob(i))
const units = blobs.map(b => ({ blob: b, weight: 1, stratum: null }))

console.log('Validitäts-Analyse (λ):')
{
  ok(analyzeValidity('Wie zufrieden sind Sie mit der Politik? Skala 1 bis 10.').lambda === 1, 'eindeutige Frage → λ = 1')
  const mixed = analyzeValidity('Wie zufrieden sind Sie mit der Regierung und wie sehr vertrauen Sie den Institutionen?')
  ok(mixed.lambda < 1 && mixed.crossKey != null, 'Doppelfrage → λ = ' + mixed.lambda + ', Kreuzladung auf ' + mixed.crossKey)
  ok(analyzeValidity('Wie alt sind Sie?').lambda === 1, 'Demografie bleibt λ = 1')
  ok(parseItem('Wie zufrieden und wie viel Vertrauen haben Sie? 1 bis 10.').validity.lambda < 1, 'parseItem reicht die Validität durch')
  const scored = scoreConstructs('Wie zufrieden sind Sie mit der Politik?')
  ok(scored[0].key === 'political_satisfaction', 'Scoring wählt das Top-Konstrukt')
}

console.log('Mischmodell in der Engine (Kreuzladung zieht zur Nachbarwahrheit):')
{
  // satisfaction ~2–4 niedrig, trust ~6–8 hoch: λ<1 muss den Mittelwert heben.
  const pure = { id: 'q', text: 'x', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'political_satisfaction', wording: {}, validity: { lambda: 1, crossKey: null } }
  const mixed = Object.assign({}, pure, { validity: { lambda: 0.7, crossKey: 'institutional_trust' } })
  const vals = res => res.rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value)
  const mPure = mean(vals(runSyntheticSurvey(units, [pure], { seed: 9 })))
  const mMixed = mean(vals(runSyntheticSurvey(units, [mixed], { seed: 9 })))
  ok(mMixed > mPure + 0.5, 'λ=0,7 zieht Richtung Kreuzkonstrukt (' + mPure.toFixed(2) + ' → ' + mMixed.toFixed(2) + ')')
}

console.log('Messfehler-Aufschlüsselung (Teile ≡ ④):')
{
  const items = [
    { id: 'q1', text: 'Stimmen Sie zu, dass man der Regierung vertrauen sollte?', scale: { min: 1, max: 5, format: 'likert' }, construct: 'institutional_trust', wording: { agreeScale: true, socialDesirability: true }, validity: { lambda: 1, crossKey: null } }
    , { id: 'q2', text: 'Einkommen?', scale: { min: null, max: null, format: 'open' }, construct: 'income', wording: {}, validity: { lambda: 1, crossKey: null } }
  ]
  const design = { technique: 'srs', n: 150, seed: 13, eligibility: { excludeMinors: true } }
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, items, { seed: 13 })
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items })
  result.meta.technique = 'srs'
  result.meta.frameSize = sample.frameSize
  const dec = decompose(result, items)
  for (const d of dec) {
    const p = d.measurementParts
    const sum = p.acquiescence + p.framing + p.socialDesirability + p.validity + p.underreporting + p.residual
    ok(Math.abs(sum - d.measurement) < 1e-9, d.id + ': Teile summieren exakt zu ④')
  }
  ok(dec[0].measurementParts.acquiescence > 0.05, 'Akquieszenz-Anteil sichtbar (+' + dec[0].measurementParts.acquiescence.toFixed(2) + ')')
  ok(dec[0].measurementParts.socialDesirability > 0.05, 'Erwünschtheits-Anteil sichtbar')
  ok(dec[1].measurementParts.underreporting < -50, 'Underreporting-Anteil beim Einkommen (' + Math.round(dec[1].measurementParts.underreporting) + ' €)')
}

console.log('Reliabilität (α vs. wahre Reliabilität):')
{
  const battery = [1, 2, 3].map(i => ({
    id: 'q' + i, text: 'Vertrauen ' + i + '? 1 bis 10.'
    , scale: { min: 1, max: 10, format: 'numeric' }, construct: 'institutional_trust'
    , wording: {}, validity: { lambda: 1, crossKey: null }
  }))
  const design = { technique: 'srs', n: 200, seed: 17, eligibility: { excludeMinors: true } }
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, battery, { seed: 17 })
  const truth = snapshotTruth({ blobs, design, units: sample.units, items: battery })
  const rep = reliabilityReport(result.rows, battery, truth)
  ok(rep.length === 1 && rep[0].itemIds.length === 3, 'Batterie erkannt (3 Items, ein Konstrukt)')
  ok(rep[0].alpha > 0.2 && rep[0].alpha < 0.95, 'α im plausiblen Bereich (' + rep[0].alpha.toFixed(2) + ')')
  ok(rep[0].avgR > 0, 'positive Inter-Item-Korrelation (' + rep[0].avgR.toFixed(2) + ')')
  ok(rep[0].trueReliability != null && rep[0].trueReliability <= 1, 'wahre Reliabilität berechnet (' + rep[0].trueReliability.toFixed(2) + ')')
  // mehr Rauschen → niedrigeres α
  const noisy = runSyntheticSurvey(sample.units, battery, { seed: 17, noiseSd: 3.0 })
  const repNoisy = reliabilityReport(noisy.rows, battery, truth)
  ok(repNoisy[0].alpha < rep[0].alpha, 'mehr Messrauschen senkt α (' + repNoisy[0].alpha.toFixed(2) + ' < ' + rep[0].alpha.toFixed(2) + ')')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
