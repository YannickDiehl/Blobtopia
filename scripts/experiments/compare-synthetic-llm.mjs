/**
 * B3 — Synthetik-vs-LLM-Vergleich: validiert die Kalibrier-Konstanten der
 * synthetischen Antwort-Engine (NOISE_SD, ACQUIESCENCE, FRAMING, SD) gegen
 * die echte LLM-Engine auf DENSELBEN Blobs und Items.
 *
 * BEWUSST NICHT in npm test: braucht laufenden Dev-Server (:8080) mit
 * ANTHROPIC_API_KEY und kostet ~150 Haiku-Calls (~0,50 €).
 * Run:  node scripts/experiments/compare-synthetic-llm.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { buildSystemPrompt } from '../../src/lib/build-system-prompt.js'
import { expandTickSnapshot } from '../../src/lib/timeline-decode.js'
import { runSurvey, makeChatSender } from '../../src/lib/survey-engine.js'
import { runSyntheticSurvey } from '../../src/lib/survey-synthetic.js'
import { trueValueOnItemScale } from '../../src/lib/survey-truth.js'

const API = process.env.CHAT_API || 'http://localhost:8080/api/chat'
const TICK = 4015
const PER_DISTRICT = 5 // 25 Blobs × 6 Items = 150 Calls

const dataUrl = p => new URL('../../public/data/timeline/' + p, import.meta.url)
if (!existsSync(dataUrl('blobs-static.json'))) {
  console.error('Lokale Timeline-Daten fehlen — Abbruch.')
  process.exit(1)
}

// ── Echte Population am Tick laden ──
const statics = JSON.parse(readFileSync(dataUrl('blobs-static.json'), 'utf8'))
const staticMap = Object.fromEntries(statics.map(g => [g.id, g]))
const blobIndex = JSON.parse(readFileSync(dataUrl('blob-index.json'), 'utf8'))
const summaries = JSON.parse(readFileSync(dataUrl('change-summaries.json'), 'utf8'))
const block = JSON.parse(readFileSync(dataUrl('ticks/4000-4099.json'), 'utf8'))
// Latente Traits werden nur ~alle 7 Ticks geschrieben — ab Blockanfang
// forward-fillen, sonst fehlen sie am Ziel-Tick.
const traits = {}
let gen = null
for (let t = 4000; t <= TICK; t++) {
  if (block[String(t)]) gen = expandTickSnapshot(block[String(t)], { blobIndex, staticMap, lastKnownTraits: traits })
}

// Geschichtete Mini-Stichprobe: PER_DISTRICT Erwachsene pro Distrikt.
const byDistrict = {}
for (const b of gen.blobs) {
  if (b.age != null && b.age < 18) continue
  ;(byDistrict[b.district] = byDistrict[b.district] || []).push(b)
}
const sample = []
for (const d of Object.keys(byDistrict).sort()) sample.push(...byDistrict[d].slice(0, PER_DISTRICT))
const units = sample.map(b => ({ blob: b, weight: 1, stratum: b.district }))
console.log('Stichprobe: ' + units.length + ' Blobs (geschichtet), Tick ' + TICK)

// ── Item-Batterie: neutral vs. Wording-Manipulationen ──
const items = [
  { id: 'sat_neutral', type: 'scale', text: 'Wie zufrieden sind Sie mit der politischen Lage? Skala von 1 bis 10, wobei 1 = gar nicht zufrieden und 10 = völlig zufrieden.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'political_satisfaction', wording: {}, validity: { lambda: 1 } }
  , { id: 'trust_neutral', type: 'scale', text: 'Wie groß ist Ihr Vertrauen in die Institutionen? Skala von 1 bis 10, wobei 1 = gar kein Vertrauen und 10 = volles Vertrauen.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'institutional_trust', wording: {}, validity: { lambda: 1 } }
  , { id: 'eff_neutral', type: 'scale', text: 'Inwieweit können Sie politische Entscheidungen beeinflussen? Skala von 1 bis 10, wobei 1 = gar nicht und 10 = sehr stark.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'self_efficacy', wording: {}, validity: { lambda: 1 } }
  , { id: 'sat_agree', type: 'scale', text: 'Stimmen Sie der Aussage zu: „Mit der politischen Lage kann man insgesamt zufrieden sein." Skala von 1 bis 10, wobei 1 = stimme gar nicht zu und 10 = stimme voll zu.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'political_satisfaction', wording: { agreeScale: true }, validity: { lambda: 1 } }
  , { id: 'trust_negativ', type: 'scale', text: 'Nach all den Skandalen und dem Versagen der Politik: Wie groß ist Ihr Vertrauen in die Institutionen noch? Skala von 1 bis 10, wobei 1 = gar kein Vertrauen und 10 = volles Vertrauen.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'institutional_trust', wording: { loadedNegative: true }, validity: { lambda: 1 } }
  , { id: 'eff_sd', type: 'scale', text: 'Als verantwortungsvolle Bürgerin/verantwortungsvoller Bürger sollte man politisch etwas bewirken können. Inwieweit gelingt Ihnen das? Skala von 1 bis 10, wobei 1 = gar nicht und 10 = sehr stark.', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'self_efficacy', wording: { socialDesirability: true }, validity: { lambda: 1 } }
]

// ── Persona-Prompts (wie der Chat sie baut) ──
function summaryFor(blobId, tick) {
  const entries = summaries[blobId]
  if (!entries || !entries.length) return null
  let best = null
  for (const e of entries) { if (e.tick <= tick) best = e; else break }
  return best ? best.summary : null
}
const promptByBlob = {}
for (const u of units) {
  const sg = staticMap[u.blob.id] || {}
  if (u.blob.job == null && sg.job != null) u.blob.job = sg.job
  promptByBlob[u.blob.id] = buildSystemPrompt(u.blob, sg, TICK, 365, summaryFor(u.blob.id, TICK), 'working', 10)
}

// ── Beide Engines auf denselben Einheiten ──
console.log('LLM-Feldlauf läuft (' + units.length * items.length + ' Calls, Concurrency 4) …')
const t0 = Date.now()
const llm = await runSurvey(units, {
  sendFn: makeChatSender(API)
  , buildPrompt: u => promptByBlob[u.blob.id]
  , items, tick: TICK, concurrency: 4, maxRetries: 1
  , onProgress: (done, total) => { if (done % 25 === 0) console.log('  …' + done + '/' + total) }
})
console.log('LLM fertig in ' + Math.round((Date.now() - t0) / 1000) + 's')
const syn = runSyntheticSurvey(units, items, { seed: 42 })

// ── Auswertung ──
function answered(rows, id) {
  return rows.map(r => r.answers[id]).filter(a => a && a.status === 'answered' && a.value != null)
}
function statusCounts(rows, id) {
  const c = {}
  for (const r of rows) { const a = r.answers[id]; if (a) c[a.status] = (c[a.status] || 0) + 1 }
  return c
}
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null }
function madVsTruth(rows, item) {
  const devs = []
  for (const r of rows) {
    const a = r.answers[item.id]
    if (!a || a.status !== 'answered' || a.value == null) continue
    const u = units.find(x => x.blob.id === r.blobId)
    const t = trueValueOnItemScale(u.blob, item)
    if (t != null) devs.push(Math.abs(a.value - t))
  }
  return mean(devs)
}

console.log('\n══ Vergleich (n=' + units.length + ', Tick ' + TICK + ') ══')
console.log('Item            | MAD LLM | MAD Syn | Mittel LLM | Mittel Syn | NR LLM | NR Syn')
for (const it of items) {
  const mL = madVsTruth(llm.rows, it)
  const mS = madVsTruth(syn.rows, it)
  const aL = mean(answered(llm.rows, it.id).map(a => a.value))
  const aS = mean(answered(syn.rows, it.id).map(a => a.value))
  const nrL = units.length - answered(llm.rows, it.id).length
  const nrS = units.length - answered(syn.rows, it.id).length
  console.log(it.id.padEnd(15) + ' | ' + (mL != null ? mL.toFixed(2) : ' —  ') + '    | ' + (mS != null ? mS.toFixed(2) : ' —  ')
    + '    | ' + (aL != null ? aL.toFixed(2) : '—') + '       | ' + (aS != null ? aS.toFixed(2) : '—') + '       | ' + nrL + '      | ' + nrS)
}

const effect = (rows, a, b) => {
  const ma = mean(answered(rows, a).map(x => x.value))
  const mb = mean(answered(rows, b).map(x => x.value))
  return ma != null && mb != null ? ma - mb : null
}
console.log('\nWording-Effekte (manipuliert − neutral):')
console.log('  Akquieszenz (sat):  LLM ' + (effect(llm.rows, 'sat_agree', 'sat_neutral') || 0).toFixed(2)
  + '  vs. Syn ' + (effect(syn.rows, 'sat_agree', 'sat_neutral') || 0).toFixed(2))
console.log('  Neg. Framing (trust): LLM ' + (effect(llm.rows, 'trust_negativ', 'trust_neutral') || 0).toFixed(2)
  + '  vs. Syn ' + (effect(syn.rows, 'trust_negativ', 'trust_neutral') || 0).toFixed(2))
console.log('  Erwünschtheit (eff): LLM ' + (effect(llm.rows, 'eff_sd', 'eff_neutral') || 0).toFixed(2)
  + '  vs. Syn ' + (effect(syn.rows, 'eff_sd', 'eff_neutral') || 0).toFixed(2))

console.log('\nStatus-Verteilung LLM (alle Items):')
const agg = {}
for (const it of items) {
  const c = statusCounts(llm.rows, it.id)
  for (const k in c) agg[k] = (agg[k] || 0) + c[k]
}
console.log('  ' + JSON.stringify(agg))
console.log('\nKalibrier-Konstanten (survey-synthetic.js): NOISE_SD=0.9 (empirisch, 2026-06-12), ACQ=0.8, FRAMING=1.0, SD=0.7')
console.log('Befund 2026-06-12 (n=25): MAD passt; Haiku widersteht Framing (LLM ~0,0 vs. Syn −0,7),')
console.log('zeigt aber STÄRKERE Erwünschtheit (LLM +1,4 vs. Syn +0,4). Wording-Konstanten sind')
console.log('bewusst didaktisch gesetzt — Anpassung an LLM-Verhalten wäre eine Lehr-Entscheidung.')
