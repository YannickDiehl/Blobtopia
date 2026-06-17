/**
 * Kalibrierung der Ausschöpfungsquote (Etappe B, Re-Kalibrierung 2026-06-17).
 *
 * Ziel (Yannick): neutraler Fragebogen ≈ 90 % persönlich / ~80 % Telefon /
 * ~70 % online; einfache Fragen höher, problematische niedriger; Ausfälle
 * weiter stark merkmalsselektiv. Misst die ERWARTETE Quote (mittlere
 * P(Kontakt)·P(Kooperation)) über den echten Erwachsenen-Rahmen sowie die
 * REALISIERTE Quote + Selektivität auf einer SRS-Stichprobe.
 *
 * Run:  /opt/homebrew/bin/node scripts/experiments/calibrate-fieldwork.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { expandTickSnapshot } from '../../src/lib/timeline-decode.js'
import { eligibleFrame, drawSample } from '../../src/lib/survey-sampling.js'
import {
  FIELD_MODES, expectedResponseRate, questionnaireBurden
  , simulateParticipation, fieldReport, DISPOSITION
} from '../../src/lib/survey-fieldwork.js'

const TICK = 4015
const dataUrl = p => new URL('../../public/data/timeline/' + p, import.meta.url)
if (!existsSync(dataUrl('blobs-static.json'))) {
  console.error('Lokale Timeline-Daten fehlen — Abbruch.')
  process.exit(1)
}

const statics = JSON.parse(readFileSync(dataUrl('blobs-static.json'), 'utf8'))
const staticMap = Object.fromEntries(statics.map(g => [g.id, g]))
const blobIndex = JSON.parse(readFileSync(dataUrl('blob-index.json'), 'utf8'))
const block = JSON.parse(readFileSync(dataUrl('ticks/4000-4099.json'), 'utf8'))
const traits = {}
let gen = null
for (let t = 4000; t <= TICK; t++) {
  if (block[String(t)]) gen = expandTickSnapshot(block[String(t)], { blobIndex, staticMap, lastKnownTraits: traits })
}
const frame = eligibleFrame(gen.blobs, { excludeMinors: true })
const pct = x => x == null ? '—' : (x * 100).toFixed(1) + ' %'
const mean = a => a.reduce((x, y) => x + y, 0) / a.length
const trustOf = b => (b.attitudes && b.attitudes.institutional_trust != null ? b.attitudes.institutional_trust : 5)

console.log('Tick ' + TICK + ' · Rahmen (Erwachsene): ' + frame.length + ' Blobs\n')

// ── Beispiel-Fragebögen für die Last ──
const cleanQ = [{ construct: 'political_satisfaction', wording: {}, scale: { difficulty: 5 } }]
const typicalQ = [
  { construct: 'political_satisfaction', wording: {}, scale: { difficulty: 5 } }
  , { construct: 'institutional_trust', wording: {}, scale: { difficulty: 5 } }
  , { construct: 'self_efficacy', wording: { loadedPositive: true }, scale: { difficulty: 5 } }
  , { construct: 'ideology', wording: {}, scale: { difficulty: 5 } }
]
const nastyQ = [
  { construct: 'income', wording: {}, scale: { difficulty: 5 } }                                  // sensibel
  , { construct: 'self_efficacy', wording: { socialDesirability: true }, scale: { difficulty: 5 } } // moralisierend
  , { construct: 'institutional_trust', wording: { socialDesirability: true }, scale: { difficulty: 5 } }
  , { construct: 'policy_environment', wording: { loadedNegative: true }, scale: { difficulty: 9 } } // krass + geladen
]
const scenarios = [
  ['leer (Default 0)', 0]
  , ['sauber/kurz (1 Item)', questionnaireBurden(cleanQ)]
  , ['typisch (4 Items)', questionnaireBurden(typicalQ)]
  , ['problematisch (4 Items)', questionnaireBurden(nastyQ)]
]

console.log('ERWARTETE Ausschöpfung über den Rahmen (2 Kontaktversuche):')
console.log('  Last je Szenario: ' + scenarios.map(s => s[0] + '=' + s[1].toFixed(2)).join(' · ') + '\n')
for (const modeKey of Object.keys(FIELD_MODES)) {
  const m = FIELD_MODES[modeKey]
  const cells = scenarios.map(([, burden]) => pct(expectedResponseRate(frame, { mode: modeKey, attempts: 2, burden })))
  console.log('  ' + m.label.padEnd(26) + ' ' + scenarios.map((s, i) => s[0].split(' ')[0] + ': ' + cells[i]).join('  |  '))
}

console.log('\nKontaktversuche (persönlich, neutraler Fragebogen):')
for (const att of [1, 2, 3, 4]) {
  console.log('  ' + att + ' Versuch(e): ' + pct(expectedResponseRate(frame, { mode: 'personal', attempts: att, burden: 0 })))
}

console.log('\nREALISIERTE Quote + ③-Selektivität (SRS n=400, persönlich, 2 Versuche, neutral):')
const lt = (b, k) => (b.latent_traits && b.latent_traits[k] != null ? b.latent_traits[k] : 5)
// Komposit der teilnahmetreibenden Merkmale (so misst man die echte Selektivität,
// nicht über institutional_trust allein — die 4 Treiber sind real nur teilkorreliert).
const composite = b => 0.28 * trustOf(b) + 0.22 * lt(b, 'generalized_trust')
  + 0.18 * lt(b, 'community_participation') - 0.18 * lt(b, 'powerlessness')
function realized(seed, burden) {
  const sample = drawSample(gen.blobs, { technique: 'srs', n: 400, seed, eligibility: { excludeMinors: true } })
  const part = simulateParticipation(sample.units, { mode: 'personal', attempts: 2, seed, burden })
  const rep = fieldReport(part)
  const resp = part.filter(p => p.disposition === DISPOSITION.RESPONDENT)
  return {
    rate: rep.responseRate, net: rep.net, gross: rep.gross
    , dTrust: mean(resp.map(p => trustOf(p.blob))) - mean(part.map(p => trustOf(p.blob)))
    , dComp: mean(resp.map(p => composite(p.blob))) - mean(part.map(p => composite(p.blob)))
  }
}
for (const seed of [11, 23, 42]) {
  const r = realized(seed, 0)
  console.log('  seed ' + seed + ': Quote ' + pct(r.rate) + ' (n=' + r.net + '/' + r.gross + ')'
    + ' · ③ Vertrauen Δ' + r.dTrust.toFixed(2) + ' · Komposit Δ' + r.dComp.toFixed(2) + ' (immer dasselbe Vorzeichen = systematisch)')
}
console.log('\n  Derselbe Lauf mit PROBLEMATISCHEM Fragebogen (Last ' + questionnaireBurden(nastyQ).toFixed(2) + ') → ③ wächst:')
for (const seed of [11, 23, 42]) {
  const r = realized(seed, questionnaireBurden(nastyQ))
  console.log('  seed ' + seed + ': Quote ' + pct(r.rate) + ' (n=' + r.net + '/' + r.gross + ')'
    + ' · ③ Vertrauen Δ' + r.dTrust.toFixed(2) + ' · Komposit Δ' + r.dComp.toFixed(2))
}
