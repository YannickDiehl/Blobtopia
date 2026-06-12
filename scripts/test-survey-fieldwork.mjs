/**
 * Functional test für Etappe B: Unit-Nonresponse (Kontakt + Kooperation,
 * selektiv), Erhebungsmodus, Ausschöpfung, 6-Glieder-Zerlegung und
 * Post-Stratifizierung.
 * Run:  node scripts/test-survey-fieldwork.mjs
 */
import { simulateParticipation, fieldReport, DISPOSITION, FIELD_MODES } from '../src/lib/survey-fieldwork.js'
import { postStratify, calibratedEstimate } from '../src/lib/survey-weighting.js'
import { drawSample } from '../src/lib/survey-sampling.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { snapshotTruth, decompose } from '../src/lib/survey-truth.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length }

// Vertrauen korreliert mit Distrikt — der Hebel für Selektivitäts-Checks.
function makeBlob(i, district, trust) {
  return {
    id: 'b' + i, district, age: 20 + (i % 45), income: 1000 + (i % 9) * 400
    , education_level: i % 4
    , attitudes: { political_satisfaction: (i * 7) % 11, institutional_trust: trust }
    , latent_traits: { party_indifference: (i * 3) % 11, generalized_trust: trust, community_participation: 5, powerlessness: 10 - trust }
    , political_state: {}
  }
}
const blobs = []
{
  let i = 0
  for (let d = 0; d < 5; d++) for (let k = 0; k < 100; k++) blobs.push(makeBlob(i++, d, d * 2.5))
}
const units = blobs.map(b => ({ blob: b, weight: 1, stratum: null }))
const trustOf = id => blobs.find(b => b.id === id).attitudes.institutional_trust

console.log('Teilnahmemodell (deterministisch, selektiv):')
{
  const a = simulateParticipation(units, { mode: 'personal', attempts: 2, seed: 7 })
  const b = simulateParticipation(units, { mode: 'personal', attempts: 2, seed: 7 })
  ok(JSON.stringify(a.map(p => p.disposition)) === JSON.stringify(b.map(p => p.disposition)), 'gleicher Seed → identische Dispositionen')
  const rep = fieldReport(a)
  ok(rep.responseRate > 0.5 && rep.responseRate < 0.8, 'Ausschöpfung im realistischen Band (' + Math.round(rep.responseRate * 100) + ' %)')
  const respTrust = mean(a.filter(p => p.disposition === DISPOSITION.RESPONDENT).map(p => trustOf(p.blob.id)))
  const grossTrust = mean(a.map(p => trustOf(p.blob.id)))
  ok(respTrust > grossTrust + 0.3, 'Teilnahme ist vertrauensselektiv (Netto ' + respTrust.toFixed(2) + ' vs. Brutto ' + grossTrust.toFixed(2) + ')')
}

console.log('Kontaktversuche + Modus:')
{
  const r1 = fieldReport(simulateParticipation(units, { mode: 'personal', attempts: 1, seed: 7 }))
  const r4 = fieldReport(simulateParticipation(units, { mode: 'personal', attempts: 4, seed: 7 }))
  ok(r4.responseRate > r1.responseRate + 0.05, 'mehr Versuche → höhere Ausschöpfung (' + Math.round(r1.responseRate * 100) + ' % → ' + Math.round(r4.responseRate * 100) + ' %)')
  ok((r4.dispositions[DISPOSITION.NONCONTACT] || 0) < (r1.dispositions[DISPOSITION.NONCONTACT] || 0), 'Nichterreichte sinken mit Versuchen')
  const on = fieldReport(simulateParticipation(units, { mode: 'online', attempts: 2, seed: 7 }))
  ok(on.responseRate < r1.responseRate + 0.2 && on.responseRate < fieldReport(simulateParticipation(units, { mode: 'personal', attempts: 2, seed: 7 })).responseRate, 'online kooperiert schlechter als persönlich')
}

console.log('Modus dämpft soziale Erwünschtheit (sdFactor):')
{
  const item = { id: 'q', text: 'x', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'political_satisfaction', wording: { socialDesirability: true } }
  const u = units.slice(0, 300)
  const pers = runSyntheticSurvey(u, [item], { seed: 5, sdFactor: FIELD_MODES.personal.sdFactor })
  const onl = runSyntheticSurvey(u, [item], { seed: 5, sdFactor: FIELD_MODES.online.sdFactor })
  const m = res => mean(res.rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value))
  ok(m(pers) > m(onl) + 0.3, 'persönlich > online bei Erwünschtheits-Item (' + m(pers).toFixed(2) + ' vs. ' + m(onl).toFixed(2) + ')')
}

// Voller Feldlauf wie im Store: Brutto → Disposition → Netto antwortet.
function runField(design, items) {
  const sample = drawSample(blobs, design)
  const participation = simulateParticipation(sample.units, { mode: design.fieldMode, attempts: design.contactAttempts, seed: design.seed })
  const respondents = participation.filter(p => p.disposition === DISPOSITION.RESPONDENT)
  const net = runSyntheticSurvey(respondents, items, { seed: design.seed })
  const byId = {}
  for (const r of net.rows) byId[r.blobId] = r
  const rows = participation.map(p => byId[p.blob.id]
    ? Object.assign({}, byId[p.blob.id], { disposition: p.disposition })
    : { blobId: p.blob.id, stratum: p.stratum, weight: p.weight, disposition: p.disposition, answers: {} })
  const result = { rows, meta: Object.assign(net.meta, fieldReport(participation)) }
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items })
  result.meta.technique = design.technique
  result.meta.frameSize = sample.frameSize
  return result
}

const trustItem = { id: 'q1', text: 'Vertrauen? 1 bis 10.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'institutional_trust', wording: {} }
const design = { technique: 'srs', n: 200, seed: 11, fieldMode: 'personal', contactAttempts: 2, eligibility: { excludeMinors: true } }

console.log('6-Glieder-Zerlegung mit Unit-Nonresponse:')
{
  const result = runField(design, [trustItem])
  const d = decompose(result, [trustItem])[0]
  const sum = d.coverage + d.sampling + d.nonresponseUnit + d.nonresponseItem + d.measurement
  ok(Math.abs(sum - d.total) < 1e-9, '①+②+③a+③b+④ ≡ Schätzer − Wahrheit')
  ok(Math.abs(d.nonresponse - (d.nonresponseUnit + d.nonresponseItem)) < 1e-12, 'nonresponse = ③a + ③b (Kompatibilität)')
  ok(d.nonresponseUnit > 0.1, 'Unit-NR verzerrt Vertrauensitem nach oben (+' + d.nonresponseUnit.toFixed(2) + ')')
  ok(d.nUnit < d.nSample, 'Netto < Brutto (' + d.nUnit + ' < ' + d.nSample + ')')
}

console.log('Post-Stratifizierung:')
{
  // Rahmen mit distrikt-korreliertem Ausfall: Kalibrierung an Distrikt muss
  // die gewichteten Distrikt-Anteile exakt auf die Rahmen-Anteile ziehen.
  const result = runField(design, [trustItem])
  const truth = result.meta.truth
  const cal = postStratify({ rows: result.rows, truth, vars: ['district'] })
  const respondents = result.rows.filter(r => r.disposition === DISPOSITION.RESPONDENT)
  // gewichtete Distrikt-Summen == wahre Rahmen-Zellbesetzung
  const wByDistrict = {}
  for (const r of respondents) {
    if (cal.weights[r.blobId] == null) continue
    const cell = truth.perUnitCells[r.blobId].district
    wByDistrict[cell] = (wByDistrict[cell] || 0) + cal.weights[r.blobId]
  }
  const frameByDistrict = {}
  for (const c of truth.frameCellList) frameByDistrict[c.district] = (frameByDistrict[c.district] || 0) + 1
  const exact = Object.keys(frameByDistrict).every(k => Math.abs((wByDistrict[k] || 0) - frameByDistrict[k]) < 1e-6)
  ok(exact, 'kalibrierte Gewichte reproduzieren die Rahmen-Randverteilung exakt')
  // und der NR-Bias auf dem (distrikt-korrelierten!) Vertrauensitem schrumpft
  const d = decompose(result, [trustItem])[0]
  const est = d.estimate
  const estCal = calibratedEstimate(result.rows, 'q1', cal.weights)
  ok(Math.abs(estCal - d.popMean) < Math.abs(est - d.popMean), 'kalibrierter Schätzer näher an der Wahrheit (' + estCal.toFixed(2) + ' vs. ' + est.toFixed(2) + ', wahr ' + d.popMean.toFixed(2) + ')')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
