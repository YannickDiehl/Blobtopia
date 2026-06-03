/**
 * End-to-end integration test of the headless survey pipeline (no network):
 *   population -> drawSample -> runSurvey (mock transport) -> CSV + codebook.
 * Run:  node scripts/test-survey-pipeline.mjs
 */
import { drawSample, SAMPLING } from '../src/lib/survey-sampling.js'
import { runSurvey } from '../src/lib/survey-engine.js'
import { makeScaleItem, makeLikertItem } from '../src/lib/survey.js'
import { toCSV, toCodebook, responseSummary, datasetColumns } from '../src/lib/survey-dataset.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

// Population with a hidden "true" satisfaction the mock interviewer reveals noisily.
const POP = []
for (let i = 0; i < 200; i++) {
  const age = 18 + (i % 60)
  POP.push({
    id: 'b' + i, district: i % 5, education_level: i % 4, age: age
    , income: 1500 + (i % 40) * 90, is_child: false
    , _trueSat: 1 + (i % 10) // hidden ground truth (1..10)
  })
}

const items = [
  makeScaleItem('Wie zufrieden sind Sie mit der Politik?', { id: 'sat', min: 1, max: 10, minLabel: 'gar nicht', maxLabel: 'voll' })
  , makeLikertItem('Politiker haben den Kontakt zum Volk verloren.', { id: 'antielite' })
]

// Mock transport: a blob "answers" its hidden satisfaction (+/-1 noise) for sat,
// and a 4 for the likert item. blob_id lets us look up the truth.
const byId = {}
for (const b of POP) byId[b.id] = b
function mockSend(payload) {
  const lastQ = payload.messages[payload.messages.length - 1].content
  const b = byId[payload.blob_id]
  if (/zufrieden/i.test(lastQ)) {
    const noisy = Math.max(1, Math.min(10, b._trueSat + ((b.id.charCodeAt(1) % 3) - 1)))
    return Promise.resolve({ reply: 'Hmm, ich wuerde sagen ' + noisy + '.' })
  }
  return Promise.resolve({ reply: 'Dem stimme ich eher zu, so eine 4.' })
}

console.log('pipeline: sample -> survey -> dataset')
const sample = drawSample(POP, { technique: SAMPLING.STRATIFIED, n: 20, strataVars: ['district'], seed: 11 })
ok(sample.realizedN > 0 && sample.realizedN <= 20, 'stratified sample drawn (' + sample.realizedN + ')')

const { rows, meta } = await runSurvey(sample.units, {
  sendFn: mockSend
  , buildPrompt: () => 'SYSTEM_PROMPT_STUB'
  , items: items
  , tick: 1460
  , concurrency: 4
  , demographics: b => ({ district: b.district, education: b.education_level, age: b.age, weight_truth: b._trueSat })
})
ok(rows.length === sample.realizedN, 'one dataset row per respondent')
ok(rows.every(r => r.answers.sat.status === 'answered'), 'all sat answers coded')
ok(rows.every(r => Math.abs(r.answers.sat.value - r.weight_truth) <= 1), 'coded sat within +/-1 of hidden truth (measurement noise)')
ok(meta.tick === 1460, 'fieldwork tick carried in meta')

console.log('CSV export:')
const csv = toCSV(rows, items)
ok(csv.charCodeAt(0) === 0xFEFF, 'CSV begins with UTF-8 BOM')
const lines = csv.replace(/^﻿/, '').split('\r\n')
ok(lines.length === rows.length + 1, 'header + one line per respondent (' + lines.length + ')')
const header = lines[0].split(',')
ok(header.includes('id') && header.includes('weight') && header.includes('district'), 'header has id/weight/demographics')
ok(header.includes('sat') && header.includes('sat_status') && header.includes('antielite'), 'header has item + status columns')

console.log('codebook + response summary:')
const cb = toCodebook(items)
ok(cb.length === 2 && cb[0].variable === 'sat' && cb[0].scale === '1-10', 'codebook describes variables')
const rs = responseSummary(rows, items)
ok(rs.sat.answered === rows.length, 'response summary counts answered items')
ok(datasetColumns(rows).includes('district'), 'datasetColumns lists demographic cols')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
