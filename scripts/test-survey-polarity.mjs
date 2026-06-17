/**
 * Skalen-Polung: respektiert die Engine die Endpunkt-Labels?
 *
 * Eine invers gepolte Skala („1 = sehr zufrieden; 5 = gar nicht zufrieden")
 * muss dazu führen, dass ein hochzufriedener Blob eine NIEDRIGE Zahl angibt.
 * Geprüft wird beides: die Erkennung (detectPolarity, konstruktübergreifend
 * inkl. Pol-Wort-Skalen wie links/rechts) UND die Wirkung (synthetische
 * Antworten + Wahrheit-Zerlegung bleiben label-treu und bilanzieren weiter).
 *
 * Run:  node scripts/test-survey-polarity.mjs
 */
import { parseItem, detectPolarity } from '../src/lib/survey-parse.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { trueValueOnItemScale, snapshotTruth, decompose } from '../src/lib/survey-truth.js'
import { drawSample } from '../src/lib/survey-sampling.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length }
const sc = (minLabel, maxLabel, min = 1, max = 5) => ({ min, max, minLabel, maxLabel, format: 'numeric' })

console.log('\nA) detectPolarity erkennt die Polung über Konstrukt-Typen:')
{
  // unipolar (Intensität/Negation)
  ok(detectPolarity(sc('sehr zufrieden', 'gar nicht zufrieden'), 'political_satisfaction') === true, 'Zufriedenheit 1=sehr…5=gar nicht → invers')
  ok(detectPolarity(sc('gar nicht zufrieden', 'sehr zufrieden'), 'political_satisfaction') === false, 'Zufriedenheit 1=gar nicht…5=sehr → normal')
  ok(detectPolarity(sc('zufrieden', 'unzufrieden'), 'political_satisfaction') === true, 'Antonym ohne Intensität (zufrieden→unzufrieden) → invers')
  ok(detectPolarity(sc('großes Vertrauen', 'gar kein Vertrauen'), 'institutional_trust') === true, 'Vertrauen 1=groß…5=gar kein → invers')
  // bipolar (Pol-Wörter)
  ok(detectPolarity(sc('links', 'rechts', 1, 10), 'ideology') === false, 'Ideologie 1=links…10=rechts → normal')
  ok(detectPolarity(sc('rechts', 'links', 1, 10), 'ideology') === true, 'Ideologie 1=rechts…10=links → invers')
  ok(detectPolarity(sc('offen', 'restriktiv'), 'policy_migration') === false, 'Migration 1=offen…5=restriktiv → normal')
  ok(detectPolarity(sc('restriktiv', 'offen'), 'policy_migration') === true, 'Migration 1=restriktiv…5=offen → invers')
  ok(detectPolarity(sc('staatliche Steuerung', 'freier Markt', 0, 10), 'policy_economy') === false, 'Wirtschaft Staat→Markt → normal')
  ok(detectPolarity(sc('freier Markt', 'staatliche Steuerung', 0, 10), 'policy_economy') === true, 'Wirtschaft Markt→Staat → invers')
  // Vorsicht: kein voreiliges Umpolen
  ok(detectPolarity(sc('', ''), 'political_satisfaction') === false, 'ohne Labels → Konvention (normal)')
  ok(detectPolarity(sc('1', '5'), 'political_satisfaction') === false, 'reine Zahlen-Labels → Konvention (normal)')
  ok(detectPolarity(sc('sehr stark', 'gar nicht'), null) === true, 'ohne Konstrukt: reine Intensität reicht (sehr→gar nicht)')
}

console.log('\nB) parseItem hängt reversed an die Skala (echter Pfad):')
{
  const p = parseItem('Wie zufrieden sind Sie mit der Politik? Auf einer Skala von 1-5. 1 = sehr zufrieden; 5 = gar nicht zufrieden.')
  ok(p.scale.reversed === true, 'dein Beispiel → scale.reversed = true')
  const q = parseItem('Wie zufrieden sind Sie? Skala 1-5. 1 = gar nicht; 5 = sehr zufrieden.')
  ok(q.scale.reversed === false, 'normal gepolt → scale.reversed = false')
}

console.log('\nC) trueValueOnItemScale spiegelt bei inverser Polung:')
{
  const blob = { attitudes: { political_satisfaction: 9 } }
  const normal = { construct: 'political_satisfaction', scale: { min: 1, max: 5, format: 'numeric', reversed: false } }
  const rev = { construct: 'political_satisfaction', scale: { min: 1, max: 5, format: 'numeric', reversed: true } }
  ok(Math.abs(trueValueOnItemScale(blob, normal) - 4.6) < 1e-9, 'Wahrwert 9/10 normal → 4,6')
  ok(Math.abs(trueValueOnItemScale(blob, rev) - 1.4) < 1e-9, 'Wahrwert 9/10 invers → 1,4 (gespiegelt)')
}

// Kohorten mit bekanntem Wahrwert durch eine Frage schicken.
function cohort(n, prefix, { sat, ideo }) {
  const u = []
  for (let i = 0; i < n; i++) {
    u.push({ blob: {
      id: prefix + i, education_level: 2
      , attitudes: { political_satisfaction: sat, ideology: ideo, institutional_trust: 5 }
      , latent_traits: { party_indifference: 3 }, political_state: {}
    }, stratum: null, weight: 1 })
  }
  return u
}
function meanAnswer(units, item) {
  const { rows } = runSyntheticSurvey(units, [item], { seed: 4242 })
  return mean(rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value))
}
function itemOf(text) {
  const p = parseItem(text)
  return { id: 'q', text, scale: p.scale, construct: p.construct, wording: p.wording, validity: p.validity }
}

console.log('\nD) Synthetische Antworten folgen den Labels (HIGH- vs. LOW-Kohorte):')
{
  const N = 200
  const hiSat = cohort(N, 'hs', { sat: 9, ideo: 9 }), loSat = cohort(N, 'ls', { sat: 1, ideo: 1 })
  const revSat = itemOf('Wie zufrieden sind Sie? Auf einer Skala 1-5. 1 = sehr zufrieden; 5 = gar nicht zufrieden.')
  ok(meanAnswer(hiSat, revSat) < meanAnswer(loSat, revSat), 'Zufriedenheit invers: zufriedene Blobs → niedrigere Zahl')

  const normSat = itemOf('Wie zufrieden sind Sie? Skala 1-5. 1 = gar nicht; 5 = sehr zufrieden.')
  ok(meanAnswer(hiSat, normSat) > meanAnswer(loSat, normSat), 'Zufriedenheit normal: zufriedene Blobs → höhere Zahl')

  // Pol-Wort-Skala: Ideologie links/rechts, invers
  const revIdeo = itemOf('Wo stehen Sie politisch? Skala 1-10. 1 = rechts; 10 = links.')
  ok(revIdeo.scale.reversed === true, 'Ideologie 1=rechts…10=links → reversed erkannt')
  const hiR = cohort(N, 'hr', { sat: 5, ideo: 9 }), loR = cohort(N, 'lr', { sat: 5, ideo: 1 })
  ok(meanAnswer(hiR, revIdeo) < meanAnswer(loR, revIdeo), 'Ideologie invers: rechte Blobs (hoher Wert) → niedrigere Zahl')
}

console.log('\nE) Wahrheit-Zerlegung bleibt bilanziert UND label-treu bei inverser Polung:')
{
  // Population: Zufriedenheit variiert deterministisch.
  const blobs = []
  for (let i = 0; i < 400; i++) {
    blobs.push({
      id: 'p' + i, district: i % 5, age: 25 + (i % 40), education_level: i % 4, income: 1500 + (i % 8) * 300
      , attitudes: { political_satisfaction: (i * 7) % 11, institutional_trust: 5 }
      , latent_traits: { party_indifference: (i * 3) % 11 }, political_state: {}
    })
  }
  const p = parseItem('Wie zufrieden sind Sie mit der Politik? Skala 1-5. 1 = sehr zufrieden; 5 = gar nicht zufrieden.')
  const item = { id: 'q1', text: 'Zufriedenheit (invers)', scale: p.scale, construct: p.construct, wording: p.wording, validity: p.validity }
  const design = { technique: 'srs', n: 120, seed: 77, eligibility: { excludeMinors: true } }
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, [item], { seed: design.seed })
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items: [item] })
  result.meta.technique = design.technique
  result.meta.frameSize = sample.frameSize
  const d = decompose(result, [item])[0]

  const identity = d.coverage + d.sampling + d.nonresponse + d.measurement
  ok(Math.abs(identity - d.total) < 1e-9, 'Teleskop-Identität ①+②+③+④ ≡ Schätzer−Population hält weiter')
  // label-treu: gemittelte Zufriedenheit der Population ~5/10 → auf inverser 1–5-Skala ~Mitte (≈3)
  const popTrueMean = mean(blobs.map(b => b.attitudes.political_satisfaction)) // ~5 auf 0–10
  const expectedReversed = 1 + (1 - popTrueMean / 10) * 4
  ok(Math.abs(d.popMean - expectedReversed) < 0.2, 'popMean steht auf der gespiegelten Skala (label-treu, got ' + d.popMean.toFixed(2) + ')')
  ok(d.measurementParts.residual != null, 'Messfehler-Aufschlüsselung vorhanden (Residual gesetzt)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
