/**
 * LLM-Frageanalyse (Rolle A) + richtungstreue Akquieszenz.
 *
 * Geprüft wird, OHNE einen echten API-Call zu brauchen:
 *   A) mapAnalysisToItem bildet die LLM-Antwort robust auf den Engine-Vertrag ab
 *      (unbekannte Keys, raw, Polung, Kreuzladung, λ-Klemmung, vertauschte Endpunkte).
 *   B) Schema + System-Prompt enthalten die nötigen Felder/Konstrukte.
 *   C) analyzeFetch parst die Anthropic-Antwort (gemockter fetch) und meldet Fehler.
 *   D) Die synthetische Engine modelliert Akquieszenz RICHTUNGSTREU: die
 *      Ja-Sage-Tendenz hebt die Zahl IMMER Richtung Zustimmung — auch bei
 *      reverse-keyed Items —, und die Teleskop-Bilanz hält weiter.
 *
 * Optionaler Live-Check (Prompt-Qualität) nur mit ANALYZE_LIVE=1 + ANTHROPIC_API_KEY.
 *
 * Run:  node scripts/test-survey-analyze.mjs
 */
import { mapAnalysisToItem, analyzeFetch, ANALYZE_SCHEMA, buildAnalyzeSystem, ANALYZE_MODEL_DEFAULT } from '../src/lib/survey-analyze.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { snapshotTruth, decompose } from '../src/lib/survey-truth.js'
import { drawSample } from '../src/lib/survey-sampling.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length }

// Vollständige (schema-konforme) LLM-Antwort bauen, Felder gezielt überschreiben.
function raw(over) {
  return Object.assign({
    construct: null, measurable: false, suggestion: null
    , scale: { min: 1, max: 5, minLabel: '', maxLabel: '', valueLabels: [], format: 'numeric', reversed: false }
    , wording: { agreeScale: false, loadedPositive: false, loadedNegative: false, socialDesirability: false }
    , validity: { lambda: 1, crossKey: null }
    , stem: '', raw: false, language: 'de', rationale: ''
  }, over)
}

console.log('\nA) mapAnalysisToItem bildet auf den Engine-Vertrag ab:')
{
  const m1 = mapAnalysisToItem(raw({ construct: 'institutional_trust', measurable: true, scale: { min: 1, max: 5, minLabel: 'gar nicht', maxLabel: 'voll', format: 'likert', reversed: false }, wording: { agreeScale: true, loadedPositive: false, loadedNegative: false, socialDesirability: false } }))
  ok(m1.construct === 'institutional_trust' && m1.measurable, 'messbar → Konstrukt gebunden')
  ok(m1.scale.format === 'likert' && m1.scale.reversed === false, 'Skala übernommen')
  ok(m1.wording.agreeScale === true, 'agreeScale übernommen')
  ok(m1.validity.lambda === 1 && m1.validity.crossKey === null, 'saubere Validität')

  const m2 = mapAnalysisToItem(raw({ construct: 'political_satisfaction', measurable: true, scale: { min: 1, max: 5, minLabel: 'stimme nicht zu', maxLabel: 'stimme voll zu', format: 'likert', reversed: true } }))
  ok(m2.scale.reversed === true, 'reverse-keyed → scale.reversed = true')

  const m3 = mapAnalysisToItem(raw({ construct: 'age', measurable: true, scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'numeric', reversed: false }, raw: true }))
  ok(m3.raw === true && m3.scale.format === 'open', 'Alter ohne Bereich → offene Zahlenangabe')

  const m4 = mapAnalysisToItem(raw({ construct: 'income', measurable: true, scale: { min: 0, max: 5000, minLabel: '', maxLabel: '', format: 'open', reversed: false }, raw: true }))
  ok(m4.scale.format === 'numeric' && m4.scale.min === 0 && m4.scale.max === 5000, 'Einkommen mit Bereich → numerisch')

  const m5 = mapAnalysisToItem(raw({ construct: null, measurable: false, suggestion: 'institutional_trust' }))
  ok(!m5.measurable && m5.construct === null && m5.suggestion === 'institutional_trust', 'nicht messbar → gültiger Vorschlag bleibt')

  const m5b = mapAnalysisToItem(raw({ construct: null, measurable: false, suggestion: 'gender' }))
  ok(m5b.suggestion === null, 'unbekannter Vorschlag verworfen')

  const m6 = mapAnalysisToItem(raw({ construct: 'happiness', measurable: true }))
  ok(!m6.measurable && m6.construct === null, 'unbekannter Konstrukt-Key → nicht messbar (kein stilles unsupported)')

  const m7 = mapAnalysisToItem(raw({ construct: 'anti_elitism', measurable: true, validity: { lambda: 0.8, crossKey: 'powerlessness' } }))
  ok(m7.validity.lambda === 0.8 && m7.validity.crossKey === 'powerlessness', 'Kreuzladung übernommen')

  const m7b = mapAnalysisToItem(raw({ construct: 'anti_elitism', measurable: true, validity: { lambda: 0.8, crossKey: 'anti_elitism' } }))
  ok(m7b.validity.lambda === 1 && m7b.validity.crossKey === null, 'Selbst-Kreuzladung verworfen')

  const m7c = mapAnalysisToItem(raw({ construct: 'anti_elitism', measurable: true, validity: { lambda: 0.4, crossKey: 'powerlessness' } }))
  ok(m7c.validity.lambda === 0.7, 'λ unter 0,7 wird geklemmt')

  const m8 = mapAnalysisToItem(raw({ construct: 'ideology', measurable: true, scale: { min: 10, max: 1, minLabel: 'links', maxLabel: 'rechts', format: 'numeric', reversed: false } }))
  ok(m8.scale.min === 1 && m8.scale.max === 10, 'vertauschte Endpunkte korrigiert')

  const m9 = mapAnalysisToItem(raw({ construct: 'policy_environment', measurable: true, scale: { min: 1, max: 5, minLabel: 'stimme zu', maxLabel: 'dagegen', format: 'likert', reversed: true, difficulty: 9 } }))
  ok(m9.scale.difficulty === 9, 'Item-Schwierigkeit übernommen')
  const m9b = mapAnalysisToItem(raw({ construct: 'institutional_trust', measurable: true, scale: { min: 1, max: 5, minLabel: '', maxLabel: '', format: 'likert', reversed: false, difficulty: 99 } }))
  ok(m9b.scale.difficulty === 10, 'difficulty auf 0–10 geklemmt')
  const m9c = mapAnalysisToItem(raw({ construct: 'institutional_trust', measurable: true }))
  ok(m9c.scale.difficulty === 5, 'fehlende difficulty → ausgewogen (5)')
  const m9d = mapAnalysisToItem(raw({ construct: 'age', measurable: true, raw: true, scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'numeric', reversed: false, difficulty: 9 } }))
  ok(m9d.scale.difficulty === 5, 'raw → difficulty neutral (5)')

  // stem (reine Frage) + alle Kategorie-Labels fürs Codebuch
  const mv = mapAnalysisToItem(raw({ construct: 'political_satisfaction', measurable: true, stem: 'Wie zufrieden sind Sie?'
    , scale: { min: 1, max: 5, minLabel: 'gar nicht', maxLabel: 'voll', format: 'likert', reversed: false
      , valueLabels: [{ value: 1, label: 'gar nicht' }, { value: 2, label: 'eher nicht' }, { value: 3, label: 'teils' }, { value: 4, label: 'eher' }, { value: 5, label: 'voll' }] } }))
  ok(mv.stem === 'Wie zufrieden sind Sie?', 'stem (reine Frage) übernommen')
  ok(mv.scale.valueLabels.length === 5 && mv.scale.valueLabels[2].value === 3 && mv.scale.valueLabels[2].label === 'teils', 'alle 5 Kategorie-Labels übernommen')

  const mvd = mapAnalysisToItem(raw({ construct: 'institutional_trust', measurable: true
    , scale: { min: 1, max: 5, minLabel: '', maxLabel: '', format: 'likert', reversed: false
      , valueLabels: [{ value: 1, label: 'a' }, { value: 1, label: 'dup' }, { value: 2, label: '' }, { value: 3, label: 'c' }] } }))
  ok(mvd.scale.valueLabels.length === 2 && mvd.scale.valueLabels[0].value === 1 && mvd.scale.valueLabels[1].value === 3, 'valueLabels: Duplikate + leere Labels gefiltert')

  const mvr = mapAnalysisToItem(raw({ construct: 'age', measurable: true, raw: true, stem: 'Wie alt sind Sie?'
    , scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'numeric', reversed: false, valueLabels: [{ value: 1, label: 'x' }] } }))
  ok(mvr.scale.valueLabels.length === 0, 'raw/offen → keine Kategorie-Labels')
}

console.log('\nA2) Studierenden-definierte fehlende Werte (Codes + Labels):')
{
  const mm = mapAnalysisToItem(raw({ construct: 'political_satisfaction', measurable: true
    , scale: { min: 1, max: 5, minLabel: 'zufrieden', maxLabel: 'unzufrieden', format: 'likert', reversed: false
      , valueLabels: [{ value: 1, label: 'sehr zufrieden' }, { value: 5, label: 'sehr unzufrieden' }]
      , missingLabels: [{ value: 8, label: 'weiß nicht', kind: 'dontknow' }, { value: 9, label: 'keine Angabe', kind: 'refused' }] } }))
  ok(mm.scale.missingLabels.length === 2, 'beide fehlenden Werte übernommen')
  ok(mm.scale.missingLabels.find(m => m.value === 8).kind === 'dontknow', 'kind klassifiziert: 8 = weiß nicht → dontknow')
  ok(mm.scale.missingLabels.find(m => m.value === 9).kind === 'refused', 'kind klassifiziert: 9 = keine Angabe → refused')
  ok(mm.missingConflicts.length === 0, 'keine Kollision (8/9 außerhalb 1–5)')

  // Kollisionswächter: ein „fehlender" Code im Gültigbereich wird NICHT als Missing
  // geführt, sondern gemeldet — sonst rutschte er als gültiger Wert in die Mittelwerte.
  const mc = mapAnalysisToItem(raw({ construct: 'political_satisfaction', measurable: true
    , scale: { min: 1, max: 5, minLabel: '', maxLabel: '', format: 'likert', reversed: false, valueLabels: []
      , missingLabels: [{ value: 3, label: 'unentschieden', kind: 'dontknow' }, { value: 9, label: 'keine Angabe', kind: 'refused' }] } }))
  ok(mc.scale.missingLabels.length === 1 && mc.scale.missingLabels[0].value === 9, 'Code 3 (im Gültigbereich) NICHT als Missing geführt')
  ok(mc.missingConflicts.includes(3), 'Code 3 als Kollision gemeldet (sichtbare Warnung)')

  // raw/offen trägt keine fehlenden Werte; Duplikat-Codes werden gefiltert.
  const mr = mapAnalysisToItem(raw({ construct: 'income', measurable: true, raw: true
    , scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'open', reversed: false, valueLabels: []
      , missingLabels: [{ value: -9, label: 'keine Angabe', kind: 'refused' }] } }))
  ok(mr.scale.missingLabels.length === 0, 'raw/offen → keine fehlenden Werte (offene Zahl)')
  const md = mapAnalysisToItem(raw({ construct: 'institutional_trust', measurable: true
    , scale: { min: 1, max: 5, minLabel: '', maxLabel: '', format: 'likert', reversed: false, valueLabels: []
      , missingLabels: [{ value: -9, label: 'keine Angabe', kind: 'refused' }, { value: -9, label: 'dup', kind: 'invalid' }, { value: -8, label: '', kind: 'dontknow' }] } }))
  ok(md.scale.missingLabels.length === 1, 'Duplikat-Code + leeres Label gefiltert')

  const m0 = mapAnalysisToItem(raw({ construct: 'institutional_trust', measurable: true }))
  ok(Array.isArray(m0.scale.missingLabels) && m0.scale.missingLabels.length === 0 && m0.missingConflicts.length === 0, 'keine Angabe → leere Liste, keine Kollision')
}

console.log('\nB) Schema + System-Prompt sind vollständig:')
{
  ok(ANALYZE_SCHEMA.properties.scale.properties.reversed.type === 'boolean', 'Schema hat scale.reversed')
  ok(ANALYZE_SCHEMA.properties.scale.properties.valueLabels.type === 'array', 'Schema hat scale.valueLabels')
  ok(ANALYZE_SCHEMA.properties.scale.properties.missingLabels.type === 'array', 'Schema hat scale.missingLabels')
  ok(ANALYZE_SCHEMA.properties.scale.required.includes('missingLabels'), 'missingLabels ist Pflichtfeld der Skala')
  ok(ANALYZE_SCHEMA.required.includes('construct') && ANALYZE_SCHEMA.required.includes('measurable') && ANALYZE_SCHEMA.required.includes('stem'), 'Pflichtfelder gesetzt (inkl. stem)')
  const sys = buildAnalyzeSystem()
  ok(sys.includes('institutional_trust') && sys.includes('environment_over_economy'), 'System-Prompt listet die Konstrukte')
  ok(/reversed/.test(sys) && /unzufrieden/.test(sys), 'System-Prompt erklärt reverse-keyed Stämme')
  ok(/stem/.test(sys) && /valueLabels/.test(sys), 'System-Prompt erklärt stem + valueLabels')
  ok(/missingLabels/.test(sys) && /weiß nicht/.test(sys), 'System-Prompt erklärt fehlende Werte')
}

console.log('\nC) analyzeFetch parst die Antwort (gemockter fetch):')
{
  const analysisJson = raw({ construct: 'institutional_trust', measurable: true })
  const payload = { content: [{ type: 'text', text: JSON.stringify(analysisJson) }], usage: { input_tokens: 12, output_tokens: 7 } }
  const mockOk = async () => ({ ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload })
  const out = await analyzeFetch({ apiKey: 'x', model: 'm', text: 'Vertrauen?', fetchImpl: mockOk })
  ok(out.analysis.construct === 'institutional_trust', 'JSON-Antwort geparst')
  ok(out.usage.input_tokens === 12, 'usage durchgereicht')

  const mockErr = async () => ({ ok: false, status: 502, text: async () => '{"error":"boom"}', json: async () => ({ error: 'boom' }) })
  let threw = false
  try { await analyzeFetch({ apiKey: 'x', text: 'y', fetchImpl: mockErr }) } catch (e) { threw = /502/.test(e.message) }
  ok(threw, 'HTTP-Fehler wirft sprechenden Error')
}

console.log('\nD) Richtungstreue Akquieszenz (der Fix) + Bilanz:')
{
  function cohort(n, sat) {
    const u = []
    for (let i = 0; i < n; i++) {
      u.push({ blob: { id: 'b' + i, education_level: 0, attitudes: { political_satisfaction: sat, institutional_trust: 5 }, latent_traits: { party_indifference: 0 }, political_state: {} }, stratum: null, weight: 1 })
    }
    return u
  }
  function item(reversed, agree) {
    return { id: 'q', text: 'x', construct: 'political_satisfaction', scale: { min: 1, max: 5, minLabel: '', maxLabel: '', format: 'numeric', reversed }, wording: { agreeScale: agree, loadedPositive: false, loadedNegative: false, socialDesirability: false }, validity: { lambda: 1, crossKey: null } }
  }
  function meanAnswer(units, it) {
    const { rows } = runSyntheticSurvey(units, [it], { seed: 4242 })
    return mean(rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value))
  }
  const c = cohort(600, 5)
  const fwdNo = meanAnswer(c, item(false, false)), fwdAcq = meanAnswer(c, item(false, true))
  ok(fwdAcq > fwdNo + 0.1, 'vorwärts gepolt: Akquieszenz hebt die Zahl (Zustimmung)')
  const revNo = meanAnswer(c, item(true, false)), revAcq = meanAnswer(c, item(true, true))
  ok(revAcq > revNo + 0.1, 'reverse-keyed: Akquieszenz hebt die Zahl EBENFALLS (richtungstreu — der Fix)')

  // fx.acq trägt das Vorzeichen Richtung Zustimmung (positiv), auch invers gepolt.
  const { rows } = runSyntheticSurvey(cohort(50, 5), [item(true, true)], { seed: 7 })
  const withFx = rows.map(r => r.answers.q).find(a => a.status === 'answered' && a.fx)
  ok(withFx && withFx.fx.acq > 0, 'reverse-keyed: fx.acq ist positiv (Richtung Zustimmung)')

  // Teleskop-Identität hält weiter bei einem reverse-keyed Zustimmungs-Item.
  const blobs = []
  for (let i = 0; i < 400; i++) {
    blobs.push({ id: 'p' + i, district: i % 5, age: 25 + (i % 40), education_level: i % 4, income: 1500 + (i % 8) * 300, attitudes: { political_satisfaction: (i * 7) % 11, institutional_trust: 5 }, latent_traits: { party_indifference: (i * 3) % 11 }, political_state: {} })
  }
  const agreeRev = item(true, true)
  agreeRev.id = 'q1'
  const design = { technique: 'srs', n: 120, seed: 77, eligibility: { excludeMinors: true } }
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, [agreeRev], { seed: design.seed })
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items: [agreeRev] })
  result.meta.technique = design.technique
  result.meta.frameSize = sample.frameSize
  const d = decompose(result, [agreeRev])[0]
  const identity = d.coverage + d.sampling + d.nonresponse + d.measurement
  ok(Math.abs(identity - d.total) < 1e-9, 'Teleskop-Identität ①+②+③+④ ≡ Schätzer−Population hält weiter')
}

console.log('\nE) Item-Schwierigkeit erzeugt Boden-/Decken-Effekte (krasse Items):')
{
  // Population mit gestreutem policy_environment (~mittig), wie in echten Daten.
  function popCohort(n) {
    const u = []
    for (let i = 0; i < n; i++) {
      u.push({ blob: { id: 'e' + i, education_level: 2, attitudes: { policy_environment: (i * 7) % 11, political_satisfaction: 5, institutional_trust: 5 }, latent_traits: { party_indifference: 3 }, political_state: {} }, stratum: null, weight: 1 })
    }
    return u
  }
  // Atommüll-artiges Item: Zustimmung (= hoher policy_environment) ist extrem,
  // Skala 1 = stimme zu … 5 = dagegen → reversed=true. difficulty steuert die Lage.
  function item(difficulty) {
    return { id: 'q', text: 'x', construct: 'policy_environment', scale: { min: 1, max: 5, minLabel: 'stimme zu', maxLabel: 'dagegen', format: 'numeric', reversed: true, difficulty }, wording: { agreeScale: true, loadedPositive: false, loadedNegative: false, socialDesirability: false }, validity: { lambda: 1, crossKey: null } }
  }
  const c = popCohort(400)
  function answers(it) { return runSyntheticSurvey(c, [it], { seed: 999 }).rows.map(r => r.answers.q).filter(a => a.status === 'answered').map(a => a.value) }
  function sd(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length) }
  const balanced = answers(item(5)), extreme = answers(item(9))
  ok(mean(balanced) > 2.5 && mean(balanced) < 3.5, 'ausgewogen (difficulty 5): mittlere Antworten ~3 (got ' + mean(balanced).toFixed(2) + ')')
  ok(mean(extreme) > 4.0, 'extrem (difficulty 9): starke Mehrheitsablehnung ~5 (got ' + mean(extreme).toFixed(2) + ')')
  ok(sd(extreme) < sd(balanced), 'extrem: Varianz kollabiert — Decken-Effekt (' + sd(extreme).toFixed(2) + ' < ' + sd(balanced).toFixed(2) + ')')

  // Die Wahrheit liegt auf DERSELBEN Schwierigkeitsskala → Zerlegung bilanziert.
  const blobs = []
  for (let i = 0; i < 400; i++) blobs.push({ id: 'p' + i, district: i % 5, age: 25 + (i % 40), education_level: i % 4, income: 1500 + (i % 8) * 300, attitudes: { policy_environment: (i * 7) % 11, institutional_trust: 5 }, latent_traits: { party_indifference: (i * 3) % 11 }, political_state: {} })
  const it = item(9); it.id = 'q1'
  const design = { technique: 'srs', n: 150, seed: 55, eligibility: { excludeMinors: true } }
  const sample = drawSample(blobs, design)
  const result = runSyntheticSurvey(sample.units, [it], { seed: design.seed })
  result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items: [it] })
  result.meta.technique = design.technique
  result.meta.frameSize = sample.frameSize
  const d = decompose(result, [it])[0]
  ok(Math.abs((d.coverage + d.sampling + d.nonresponse + d.measurement) - d.total) < 1e-9, 'Teleskop-Identität hält mit Item-Schwierigkeit')
  ok(d.popMean > 4.0, 'Wahrheit des Extremitems liegt am Ablehnungs-Ende (got ' + d.popMean.toFixed(2) + ')')
}

// ── Optionaler Live-Check: Prompt-Qualität (skippt ohne Key/Flag) ──
if (process.env.ANALYZE_LIVE === '1' && process.env.ANTHROPIC_API_KEY) {
  console.log('\nF) LIVE: Sonnet 4.6 erkennt knifflige Formulierungen:')
  const cases = [
    { text: 'Ich bin mit der Politik unzufrieden. Bitte auf einer Skala 1–5: 1 = stimme gar nicht zu, 5 = stimme voll zu.', wantConstruct: 'political_satisfaction', wantReversed: true }
    , { text: 'Sollte Atommüll frei in der Natur entsorgt werden dürfen? 1 = Stimme voll und ganz zu, 2 = Stimme eher zu, 3 = weiß nicht genau, 4 = Stimme eher dagegen, 5 = Stimme voll und ganz dagegen.', wantConstruct: 'policy_environment', wantReversed: true, wantHighDifficulty: true, wantValueLabels: 5, wantCleanStem: true }
    , { text: 'Wie wirksam fühlen Sie sich politisch? 1 = völlig machtlos … 7 = sehr einflussreich.', wantMeasurableOnly: true }
    , { text: 'How much do you trust the government? Scale 0 to 10.', wantConstruct: 'institutional_trust' }
    , { text: 'Wie zufrieden sind Sie mit der Politik? 1 = sehr zufrieden, 5 = sehr unzufrieden, 8 = weiß nicht, 9 = keine Angabe.', wantConstruct: 'political_satisfaction', wantMissing: 2 }
    , { text: 'Welche Augenfarbe haben Sie?', wantUnmeasurable: true }
  ]
  for (const c of cases) {
    try {
      const { analysis } = await analyzeFetch({ apiKey: process.env.ANTHROPIC_API_KEY, model: ANALYZE_MODEL_DEFAULT, text: c.text })
      const m = mapAnalysisToItem(analysis)
      console.log('    · ' + c.text.slice(0, 44) + '… → ' + (m.construct || 'nicht messbar') + (m.scale.reversed ? ' [invers]' : '') + ' diff=' + m.scale.difficulty + ' vl=' + m.scale.valueLabels.length + ' miss=' + m.scale.missingLabels.length + ' stem="' + m.stem.slice(0, 40) + '"')
      if (c.wantConstruct) ok(m.construct === c.wantConstruct, 'erkennt ' + c.wantConstruct)
      if (c.wantMissing) ok(m.scale.missingLabels.length === c.wantMissing && m.scale.missingLabels.every(x => x.value > m.scale.max), 'erfasst ' + c.wantMissing + ' fehlende Werte außerhalb der Skala (got ' + m.scale.missingLabels.length + ')')
      if (c.wantReversed) ok(m.scale.reversed === true, 'erkennt inverse Polung')
      if (c.wantHighDifficulty) ok(m.scale.difficulty >= 7, 'erkennt extreme Item-Schwierigkeit (got ' + m.scale.difficulty + ')')
      if (c.wantValueLabels) ok(m.scale.valueLabels.length === c.wantValueLabels, 'erfasst alle ' + c.wantValueLabels + ' Kategorien (got ' + m.scale.valueLabels.length + ')')
      if (c.wantCleanStem) ok(m.stem.length > 0 && !/\d\s*=/.test(m.stem), 'stem ist die reine Frage ohne Skala („' + m.stem.slice(0, 50) + '")')
      if (c.wantUnmeasurable) ok(!m.measurable, 'erkennt „nicht messbar"')
      if (c.wantMeasurableOnly) ok(m.measurable, 'mappt das semantische Differenzial auf ein Konstrukt')
    } catch (e) {
      ok(false, 'Live-Call: ' + (e.message || e))
    }
  }
} else {
  console.log('\nF) LIVE übersprungen (setze ANALYZE_LIVE=1 + ANTHROPIC_API_KEY für den Prompt-Qualitätscheck).')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
