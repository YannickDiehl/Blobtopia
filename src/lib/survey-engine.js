/**
 * src/lib/survey-engine.js
 *
 * Fieldwork runner for the Befragungsinstitut: administers a questionnaire to
 * a sample of blobs via an INJECTED chat transport. Pure orchestration — no
 * direct network or Vuex dependency — so the whole flow (session mode,
 * concurrency, retry, error handling, coding) is unit-testable with a mock
 * sendFn. The real network call is a thin adapter (makeChatSender).
 *
 * runSurvey(units, opts) -> { rows, meta }
 *   units: [{ blob, weight, stratum }]  (from survey-sampling.drawSample)
 *   rows:  one record per respondent, answers coded via src/lib/survey.js
 */
import { formatQuestion, parseAnswer, isErrorReply } from './survey.js'

export const SESSION_MODE = Object.freeze({
  FRESH_PER_ITEM: 'fresh'  // each item is an independent interview (no order effects)
  , SHARED: 'shared'       // one conversation per blob (order/anchoring effects possible)
})

// Bounded-concurrency pool: at most `concurrency` workers active at once.
async function runPool(items, concurrency, worker) {
  let i = 0
  async function next() {
    while (i < items.length) {
      const idx = i++
      await worker(items[idx], idx)
    }
  }
  const runners = []
  const lanes = Math.min(Math.max(1, concurrency), items.length || 1)
  for (let c = 0; c < lanes; c++) runners.push(next())
  await Promise.all(runners)
}

// One chat turn with retry/backoff. Never throws; on persistent failure it
// returns the last error string so parseAnswer codes it as ANSWER_STATUS.ERROR.
async function askWithRetry(sendFn, payload, maxRetries) {
  let last = 'Keine Antwort.'
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await sendFn(payload)
      const reply = res && res.reply
      if (res && res.error) { last = reply || ('API-Fehler: ' + res.error); continue }
      if (isErrorReply(reply)) { last = reply || 'Keine Antwort.'; continue }
      return reply
    } catch (e) {
      last = 'Proxy-Fehler: ' + (e && e.message ? e.message : String(e))
    }
  }
  return last
}

/**
 * Administer a questionnaire to every sampled unit.
 * @param {Array} units  [{ blob, weight, stratum }]
 * @param {Object} opts
 *   sendFn       async ({ blob_id, tick, system_prompt, messages }) -> { reply, usage?, error? }  (required)
 *   buildPrompt  (unit) -> persona system-prompt string                                          (required)
 *   items        questionnaire items (from src/lib/survey.js)
 *   mode         SESSION_MODE.FRESH_PER_ITEM (default) | SHARED
 *   tick         fieldwork tick (passed through to sendFn)
 *   concurrency  max parallel blobs (default 4)
 *   maxRetries   per failed call (default 1)
 *   demographics (blob) -> object of columns to copy into each row
 *   onProgress   (done, total) -> void
 * @returns {Promise<{ rows: Array, meta: Object }>}
 */
export async function runSurvey(units, opts) {
  opts = opts || {}
  const sendFn = opts.sendFn
  const buildPrompt = opts.buildPrompt
  if (typeof sendFn !== 'function') throw new Error('runSurvey: opts.sendFn (chat transport) is required')
  if (typeof buildPrompt !== 'function') throw new Error('runSurvey: opts.buildPrompt is required')

  const items = opts.items || []
  const mode = opts.mode || SESSION_MODE.FRESH_PER_ITEM
  const tick = opts.tick || 0
  const concurrency = opts.concurrency || 4
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 1
  const demographics = typeof opts.demographics === 'function' ? opts.demographics : () => ({})

  const total = units.length
  let done = 0
  const rows = new Array(total)

  async function interviewOne(unit, index) {
    const blob = unit.blob
    const systemPrompt = buildPrompt(unit)
    const answers = {}
    const convo = [] // accumulated only in SHARED mode

    for (let qi = 0; qi < items.length; qi++) {
      const item = items[qi]
      const question = formatQuestion(item)
      let messages
      if (mode === SESSION_MODE.SHARED) {
        convo.push({ role: 'user', content: question })
        messages = convo.slice()
      } else {
        messages = [{ role: 'user', content: question }]
      }

      const reply = await askWithRetry(
        sendFn
        , { blob_id: blob.id, tick: tick, system_prompt: systemPrompt, messages: messages }
        , maxRetries
      )
      const parsed = parseAnswer(reply, item)
      answers[item.id || ('item_' + qi)] = parsed
      if (mode === SESSION_MODE.SHARED) convo.push({ role: 'assistant', content: parsed.verbatim || '' })
    }

    rows[index] = Object.assign(
      { blobId: blob.id, stratum: unit.stratum, weight: unit.weight }
      , demographics(blob)
      , { answers: answers }
    )
    done++
    if (typeof opts.onProgress === 'function') opts.onProgress(done, total)
  }

  await runPool(units, concurrency, interviewOne)
  return {
    rows: rows
    , meta: { n: total, items: items.length, mode: mode, tick: tick }
  }
}

/**
 * Production chat transport: POSTs to the Vercel/Anthropic proxy (api/chat.js).
 * Returns a sendFn for runSurvey. `fetch` is global in browsers and Node 18+.
 */
export function makeChatSender(chatUrl, bearerToken) {
  return async function send(payload) {
    const headers = { 'Content-Type': 'application/json' }
    if (bearerToken) headers['Authorization'] = 'Bearer ' + bearerToken
    const res = await fetch(chatUrl, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { reply: 'API-Fehler ' + res.status + ': ' + body.slice(0, 200), error: 'http_' + res.status }
    }
    return res.json()
  }
}
