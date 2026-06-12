/**
 * Functional test für Etappe C: Trend- und Panel-Designs über injizierte
 * Wellen-Populationen — geschätzte vs. wahre Veränderung, monotone selektive
 * Attrition, Abgänge aus der Population.
 * Run:  node scripts/test-survey-longitudinal.mjs
 */
import { runLongitudinalStudy, waveSummary, panelStayProbability } from '../src/lib/survey-longitudinal.js'
import { DISPOSITION } from '../src/lib/survey-fieldwork.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

// Welle 1: Vertrauen variiert; Welle 2: ALLE +1.5 (wahre Veränderung);
// 10 % der Blobs verlassen die Population (GONE-Fall fürs Panel).
function makeBlob(i, trustShift) {
  const trust = Math.min(10, ((i * 3) % 11) + trustShift)
  return {
    id: 'b' + i, district: i % 5, age: 20 + (i % 45), income: 1500
    , education_level: i % 4
    , attitudes: { political_satisfaction: 5, institutional_trust: trust }
    , latent_traits: {
      party_indifference: (i * 7) % 11, generalized_trust: trust
      , community_participation: (i * 5) % 11, powerlessness: 10 - trust
    }
    , political_state: {}
  }
}
const wave1 = []
for (let i = 0; i < 400; i++) wave1.push(makeBlob(i, 0))
const wave2 = []
for (let i = 0; i < 400; i++) { if (i % 10 !== 3) wave2.push(makeBlob(i, 1.5)) }

const item = { id: 'q1', text: 'Vertrauen? 1 bis 10.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'institutional_trust', wording: {} }
const design = {
  technique: 'srs', n: 150, seed: 7, fieldMode: 'personal', contactAttempts: 2
  , eligibility: { excludeMinors: true }
}
const waves = [{ tick: 1000, blobs: wave1 }, { tick: 2460, blobs: wave2 }]

console.log('Trend: frische Ziehung pro Welle, Schätzer folgt der wahren Veränderung:')
{
  const result = runLongitudinalStudy({ type: 'trend', waves, design, items: [item] })
  ok(result.meta.waves.length === 2, 'zwei Wellen mit eigener Wahrheit')
  ok(result.rows.every(r => r.welle === 1 || r.welle === 2), 'jede Zeile trägt die Welle')
  const w2ids = new Set(result.rows.filter(r => r.welle === 2).map(r => r.blobId))
  const w1ids = new Set(result.rows.filter(r => r.welle === 1).map(r => r.blobId))
  let overlap = 0
  for (const id of w2ids) if (w1ids.has(id)) overlap++
  ok(overlap < w2ids.size, 'Trend zieht frisch (Überschneidung ' + overlap + '/' + w2ids.size + ')')
  const ws = waveSummary(result, [item])[0]
  const deltaTrue = ws.perWave[1].popMean - ws.perWave[0].popMean
  const deltaEst = ws.perWave[1].estimate - ws.perWave[0].estimate
  ok(deltaTrue > 1.0, 'wahre Veränderung sichtbar (+' + deltaTrue.toFixed(2) + ')')
  ok(Math.abs(deltaEst - deltaTrue) < 0.8, 'geschätzte Δ trackt wahre Δ (' + deltaEst.toFixed(2) + ' vs. ' + deltaTrue.toFixed(2) + ')')
  const again = runLongitudinalStudy({ type: 'trend', waves, design, items: [item] })
  ok(JSON.stringify(again.rows) === JSON.stringify(result.rows), 'deterministisch')
}

console.log('Panel: Wiederbefragung der Welle-1-Netto-Stichprobe:')
{
  const result = runLongitudinalStudy({ type: 'panel', waves, design, items: [item] })
  const w1resp = result.rows.filter(r => r.welle === 1 && r.disposition === DISPOSITION.RESPONDENT)
  const w2rows = result.rows.filter(r => r.welle === 2)
  ok(w2rows.length === w1resp.length, 'Panel-Basis = Welle-1-Netto (' + w2rows.length + ')')
  const w1ids = new Set(w1resp.map(r => r.blobId))
  ok(w2rows.every(r => w1ids.has(r.blobId)), 'Welle 2 enthält nur Welle-1-Teilnehmende')
  const attrited = w2rows.filter(r => r.disposition === DISPOSITION.ATTRITION).length
  const gone = w2rows.filter(r => r.disposition === DISPOSITION.GONE).length
  ok(attrited > 5, 'Attrition tritt auf (' + attrited + ')')
  ok(gone > 0, 'Abgänge aus der Population erkannt (' + gone + ')')
  // Selektivität: Verbleiber haben (am Welle-2-Zustand) höheres Vertrauen als
  // die gesamte Basis — Attrition trifft die Machtlosen/Unbeteiligten.
  const ws = waveSummary(result, [item])[0]
  ok(ws.perWave[1].respTrueMean > ws.perWave[1].baseTrueMean, 'Attrition ist selektiv (Verbleiber '
    + ws.perWave[1].respTrueMean.toFixed(2) + ' vs. Basis ' + ws.perWave[1].baseTrueMean.toFixed(2) + ')')
}

console.log('Stay-Modell:')
{
  const engaged = makeBlob(0, 0)
  engaged.latent_traits.community_participation = 9
  engaged.latent_traits.powerlessness = 1
  const alienated = makeBlob(1, 0)
  alienated.latent_traits.community_participation = 1
  alienated.latent_traits.powerlessness = 9
  ok(panelStayProbability(engaged) > panelStayProbability(alienated) + 0.15
    , 'Engagierte bleiben eher (' + panelStayProbability(engaged).toFixed(2) + ' vs. ' + panelStayProbability(alienated).toFixed(2) + ')')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
