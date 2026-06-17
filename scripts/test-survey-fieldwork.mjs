/**
 * Functional test für Etappe B: Unit-Nonresponse (Kontakt + Kooperation,
 * selektiv), Erhebungsmodus, Ausschöpfung, 6-Glieder-Zerlegung und
 * Post-Stratifizierung.
 * Run:  node scripts/test-survey-fieldwork.mjs
 */
import { simulateParticipation, fieldReport, questionnaireBurden, expectedResponseRate, DISPOSITION, FIELD_MODES } from '../src/lib/survey-fieldwork.js'
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
  // Diese Population spannt das Vertrauen extrem (0–10 gleichverteilt) → die
  // starke Selektivität drückt die Quote unter den 90-%-Regelfall (siehe den
  // Mittel-Merkmale-Block unten, der die 90-%-Kalibrierung selbst prüft).
  ok(rep.responseRate > 0.70 && rep.responseRate < 0.86, 'Ausschöpfung im Band (' + Math.round(rep.responseRate * 100) + ' %)')
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

// Mittel-Merkmale-Population (alle Teilnahmetreiber = 5 → kaum Selektivität):
// prüft die 90/80/70-Kalibrierung des REGELFALLS für einen neutralen Fragebogen.
function neutralBlob(i) {
  return {
    id: 'n' + i, district: i % 5, age: 22 + (i % 50), income: 2500, education_level: i % 4
    , attitudes: { political_satisfaction: 5, institutional_trust: 5 }
    , latent_traits: { party_indifference: 5, generalized_trust: 5, community_participation: 5, powerlessness: 5 }
    , political_state: {}
  }
}
const neutralUnits = Array.from({ length: 500 }, (_, i) => ({ blob: neutralBlob(i), weight: 1, stratum: null }))

console.log('90/80/70-Regelfall (neutrale Merkmale, neutraler Fragebogen, 2 Versuche):')
{
  const rate = mode => fieldReport(simulateParticipation(neutralUnits, { mode, attempts: 2, seed: 3, burden: 0 })).responseRate
  const p = rate('personal'), ph = rate('phone'), on = rate('online')
  ok(p > 0.87 && p < 0.94, 'persönlich ≈ 90 % (' + Math.round(p * 100) + ' %)')
  ok(ph > 0.77 && ph < 0.87, 'telefonisch ≈ 80 % (' + Math.round(ph * 100) + ' %)')
  ok(on > 0.66 && on < 0.78, 'online ≈ 70 % (' + Math.round(on * 100) + ' %)')
  ok(p > ph && ph > on, 'Modus-Gefälle bleibt: persönlich > Telefon > online')
}

console.log('Fragebogen-Last (questionnaireBurden):')
{
  const clean = [{ construct: 'political_satisfaction', wording: {}, scale: { difficulty: 5 } }]
  const typical = [
    { construct: 'political_satisfaction', wording: {}, scale: { difficulty: 5 } }
    , { construct: 'institutional_trust', wording: {}, scale: { difficulty: 5 } }
    , { construct: 'ideology', wording: {}, scale: { difficulty: 5 } }
  ]
  const nasty = [
    { construct: 'income', wording: {}, scale: { difficulty: 5 } }
    , { construct: 'self_efficacy', wording: { socialDesirability: true }, scale: { difficulty: 5 } }
    , { construct: 'policy_environment', wording: { loadedNegative: true }, scale: { difficulty: 9 } }
  ]
  const bc = questionnaireBurden(clean), bt = questionnaireBurden(typical), bn = questionnaireBurden(nasty)
  ok(questionnaireBurden([]) === 0, 'leerer Fragebogen → Last 0')
  ok(bc < 0 && bc <= bt && bt < bn, 'sauber < typisch < problematisch (' + bc.toFixed(2) + ' < ' + bt.toFixed(2) + ' < ' + bn.toFixed(2) + ')')
  ok(bn <= 2.6, 'Last gedeckelt (≤ 2.6)')

  const r0 = fieldReport(simulateParticipation(neutralUnits, { mode: 'personal', attempts: 2, seed: 3, burden: 0 })).responseRate
  const rClean = fieldReport(simulateParticipation(neutralUnits, { mode: 'personal', attempts: 2, seed: 3, burden: bc })).responseRate
  const rNasty = fieldReport(simulateParticipation(neutralUnits, { mode: 'personal', attempts: 2, seed: 3, burden: bn })).responseRate
  ok(rClean >= r0 && r0 > rNasty + 0.1, 'einfacher Fragebogen hebt, problematischer senkt die Quote (' + Math.round(rClean * 100) + ' % ≥ ' + Math.round(r0 * 100) + ' % > ' + Math.round(rNasty * 100) + ' %)')
}

console.log('Problematischer Fragebogen verstärkt ③ (selektiver Tail rückt in den steilen Logit-Bereich):')
{
  // Vertrauensspreizung wie oben — bei hoher Last fallen die Misstrauischen
  // deutlich häufiger aus, der Nonresponse-Bias auf einem Vertrauensitem wächst.
  const drawn = blobs.map(b => ({ blob: b, weight: 1, stratum: null }))
  const nettoTrust = burden => {
    const p = simulateParticipation(drawn, { mode: 'personal', attempts: 2, seed: 9, burden })
    const r = p.filter(x => x.disposition === DISPOSITION.RESPONDENT)
    return mean(r.map(x => trustOf(x.blob.id))) - mean(p.map(x => trustOf(x.blob.id)))
  }
  const dLow = nettoTrust(0), dHigh = nettoTrust(2.0)
  ok(dLow > 0, 'schon bei voller Quote ist die Teilnahme vertrauensselektiv (Δ' + dLow.toFixed(2) + ', systematisch)')
  ok(dHigh > dLow, 'höhere Last → stärkerer Nonresponse-Bias (Δ' + dLow.toFixed(2) + ' → Δ' + dHigh.toFixed(2) + ')')
}

console.log('Vorschau expectedResponseRate ≈ realisiert:')
{
  const frame = neutralUnits.map(u => u.blob)
  const exp = expectedResponseRate(frame, { mode: 'personal', attempts: 2, burden: 0 })
  const real = fieldReport(simulateParticipation(neutralUnits, { mode: 'personal', attempts: 2, seed: 3, burden: 0 })).responseRate
  ok(exp != null && Math.abs(exp - real) < 0.05, 'Vorschau ' + Math.round(exp * 100) + ' % ≈ realisiert ' + Math.round(real * 100) + ' %')
  ok(expectedResponseRate([], {}) === null, 'leerer Rahmen → keine Vorschau (null)')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
