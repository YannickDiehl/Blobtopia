/**
 * Functional smoke test for src/lib/survey-engine.js (mock transport, no network).
 * Run:  node scripts/test-survey-engine.mjs
 */
import { runSurvey, SESSION_MODE } from '../src/lib/survey-engine.js'
import { makeScaleItem, ANSWER_STATUS } from '../src/lib/survey.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

const items = [
  makeScaleItem('Wie zufrieden sind Sie?', { id: 'sat', min: 1, max: 10 })
  , makeScaleItem('Wie viel Vertrauen?', { id: 'trust', min: 1, max: 10 })
]
function units(n) {
  const u = []
  for (let i = 0; i < n; i++) u.push({ blob: { id: 'b' + i, district: i % 5, age: 40 }, stratum: null, weight: 1 })
  return u
}
const buildPrompt = () => 'SYSTEM_PROMPT_STUB'

console.log('basic run (fresh per item):')
{
  const send = async () => ({ reply: 'Ich wuerde sagen 7.' })
  const { rows, meta } = await runSurvey(units(5), { sendFn: send, buildPrompt, items, concurrency: 3 })
  ok(rows.length === 5, 'one row per respondent')
  ok(rows.every(r => r.answers.sat.value === 7 && r.answers.trust.value === 7), 'all answers coded to 7')
  ok(rows.every(r => r.answers.sat.status === ANSWER_STATUS.ANSWERED), 'status answered')
  ok(rows.every(r => r.blobId && 'weight' in r), 'rows carry id + weight')
  ok(meta.n === 5 && meta.items === 2 && meta.mode === SESSION_MODE.FRESH_PER_ITEM, 'meta correct')
}

console.log('fresh-per-item sends one question per request:')
{
  const seen = []
  const send = async (p) => { seen.push(p.messages.length); return { reply: '5' } }
  await runSurvey(units(1), { sendFn: send, buildPrompt, items, mode: SESSION_MODE.FRESH_PER_ITEM })
  ok(seen.every(len => len === 1), 'each request has exactly 1 message (no carryover)')
}

console.log('shared session accumulates conversation:')
{
  const seen = []
  const send = async (p) => { seen.push(p.messages.length); return { reply: '6' } }
  await runSurvey(units(1), { sendFn: send, buildPrompt, items, mode: SESSION_MODE.SHARED })
  ok(seen[0] === 1 && seen[1] === 3, 'shared mode grows messages 1 -> 3 (user, assistant, user)')
}

console.log('errors do NOT become answers:')
{
  const send = async () => ({ reply: 'API-Fehler 529: overloaded', error: 'api_error' })
  const { rows } = await runSurvey(units(2), { sendFn: send, buildPrompt, items, maxRetries: 1 })
  ok(rows.every(r => r.answers.sat.status === ANSWER_STATUS.ERROR), 'error replies coded as ERROR, value null')
  ok(rows.every(r => r.answers.sat.value === null), 'no fake value recorded for errors')
}

console.log('retry recovers a transient failure:')
{
  let calls = 0
  const send = async () => { calls++; return calls === 1 ? { reply: 'Proxy-Fehler: timeout', error: 'x' } : { reply: '8' } }
  const { rows } = await runSurvey(units(1), { sendFn: send, buildPrompt, items: [items[0]], maxRetries: 2 })
  ok(rows[0].answers.sat.status === ANSWER_STATUS.ANSWERED && rows[0].answers.sat.value === 8, 'transient error retried then answered (8)')
}

console.log('progress + demographics:')
{
  let lastDone = 0, ticks = 0
  const send = async () => ({ reply: '4' })
  const { rows } = await runSurvey(units(6), {
    sendFn: send, buildPrompt, items: [items[0]], concurrency: 2
    , demographics: b => ({ district: b.district, age: b.age })
    , onProgress: (d, t) => { lastDone = d; ticks++; if (d > t) fail++ }
  })
  ok(lastDone === 6 && ticks === 6, 'onProgress called once per respondent up to total')
  ok(rows.every(r => r.district != null && r.age === 40), 'demographic columns copied into rows')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
