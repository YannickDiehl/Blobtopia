/**
 * src/lib/survey.js
 *
 * Core logic for the Befragungsinstitut (survey institute) feature.
 *
 * Framework-agnostic, side-effect-free helpers shared by the survey UI and
 * both answer engines (LLM via api/chat.js, and the synthetic engine):
 *   - the survey item model (open / scale / binary / choice)
 *   - formatQuestion(): turn an item into a precise German interviewer message
 *   - parseAnswer():    robustly code a blob's free-text reply into a value
 *   - isErrorReply():   detect api/chat.js error payloads so they never enter
 *                       the dataset as if they were respondent answers
 *
 * The scale wording/coding mirrors the conventions already taught to blobs in
 * src/lib/build-system-prompt.js (1-10 -> round to nearest integer;
 * 1-5 -> band table 0-1->1, 2-3->2, 4-5->3, 6-7->4, 8-10->5). That builder is
 * the single canonical prompt source; do not re-copy its logic here.
 */

export const ITEM_TYPES = Object.freeze({
  OPEN: 'open'        // free text, no coding
  , SCALE: 'scale'    // numeric self-placement (default 1-10; Likert = 1-5)
  , BINARY: 'binary'  // ja / nein -> 1 / 0
  , CHOICE: 'choice'  // single choice from a fixed option list
})

export const ANSWER_STATUS = Object.freeze({
  ANSWERED: 'answered'
  , REFUSED: 'refused'      // respondent declined (unit/item nonresponse)
  , DONTKNOW: 'dontknow'    // "weiss nicht" / no opinion
  , UNPARSED: 'unparsed'    // a reply arrived but no codeable value could be read
  , ERROR: 'error'          // an API/proxy error string, NOT a real answer
})

// ── Item constructors ─────────────────────────────────────────────────────

/**
 * Build a numeric scale item.
 * @param {string} text      The question wording the student authored.
 * @param {Object} [opts]    { id, min=1, max=10, minLabel, maxLabel, construct }
 */
export function makeScaleItem(text, opts) {
  opts = opts || {}
  return {
    id: opts.id || null
    , type: ITEM_TYPES.SCALE
    , text: text
    , scale: {
      min: opts.min != null ? opts.min : 1
      , max: opts.max != null ? opts.max : 10
      , minLabel: opts.minLabel || ''
      , maxLabel: opts.maxLabel || ''
    }
    , construct: opts.construct || null
  }
}

/** Convenience: a 1-5 Likert agreement item (the calibrated short scale). */
export function makeLikertItem(text, opts) {
  opts = opts || {}
  return makeScaleItem(text, {
    id: opts.id
    , min: 1
    , max: 5
    , minLabel: opts.minLabel || 'stimme gar nicht zu'
    , maxLabel: opts.maxLabel || 'stimme voll zu'
    , construct: opts.construct
  })
}

// ── Question formatting (item -> interviewer message) ───────────────────────

/**
 * Render one survey item as a precise German interviewer prompt.
 * Designed so the blob can answer with a single codeable token.
 * @returns {string}
 */
export function formatQuestion(item) {
  const text = (item.text || '').trim()
  switch (item.type) {
    case ITEM_TYPES.OPEN:
      return text + '\n(Bitte antworten Sie in eigenen Worten.)'

    case ITEM_TYPES.BINARY:
      return text + '\nBitte antworten Sie nur mit "Ja" oder "Nein".'

    case ITEM_TYPES.CHOICE: {
      const opts = (item.choices || []).map((c, i) => (i + 1) + ') ' + c).join('  ')
      return text + '\nBitte waehlen Sie genau eine Option: ' + opts
    }

    case ITEM_TYPES.SCALE:
    default: {
      const s = item.scale || { min: 1, max: 10 }
      let line = text + '\nBitte ordnen Sie sich auf einer Skala von '
        + s.min + ' bis ' + s.max + ' ein'
      if (s.minLabel || s.maxLabel) {
        line += ', wobei ' + s.min + ' = "' + (s.minLabel || '') + '" und '
          + s.max + ' = "' + (s.maxLabel || '') + '" bedeutet'
      }
      line += '. Nennen Sie bitte nur die Zahl.'
      return line
    }
  }
}

// ── Answer parsing (reply -> coded value) ───────────────────────────────────

// Error payloads produced by api/chat.js (which returns HTTP 200 on failure).
const ERROR_PREFIXES = ['API-Fehler', 'Proxy-Fehler', 'Keine Antwort.']

/** True if the reply text is actually an api/chat.js error payload. */
export function isErrorReply(reply) {
  if (!reply) return true
  const r = String(reply).trim()
  return ERROR_PREFIXES.some(p => r.startsWith(p))
}

const REFUSAL_PATTERNS = [
  /\bnicht sagen\b/i, /sage ich (lieber )?nicht/i
  , /m(oe|ö)chte( ich)?( da)?( lieber)? nicht/i
  , /will ich( da)?( lieber)? nicht/i
  , /keine lust/i, /nicht (mehr )?reden/i, /nicht dar(ü|ue)ber reden/i
  , /geht sie nichts an/i, /lieber nicht/i, /kein interesse/i
]

const DONTKNOW_PATTERNS = [
  /wei(ss|ß) (ich )?nicht/i, /keine ahnung/i, /kann ich nicht sagen/i
  , /schwer zu sagen/i, /weiss nich/i, /keine meinung/i, /unentschieden/i
]

// Note: deliberately omit "eine" (indefinite article) to avoid coding any
// reply containing it as a 1. Spelled-out numbers are a fallback only; the
// formatter asks blobs for a bare digit.
const WORD_NUMS = {
  null: 0, eins: 1, zwei: 2, drei: 3, vier: 4
  , fuenf: 5, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

/** Extract the first integer that falls within [min, max] (digits or words). */
function extractScaleNumber(text, min, max) {
  const digitMatches = text.match(/-?\d{1,2}/g)
  if (digitMatches) {
    for (const d of digitMatches) {
      const n = parseInt(d, 10)
      if (n >= min && n <= max) return n
    }
  }
  const lower = text.toLowerCase()
  for (const word in WORD_NUMS) {
    const n = WORD_NUMS[word]
    if (n >= min && n <= max && new RegExp('\\b' + word + '\\b').test(lower)) return n
  }
  return null
}

/** True if the reply declines to answer (unit/item nonresponse). */
function isRefusal(t) { return REFUSAL_PATTERNS.some(p => p.test(t)) }

/** True if the reply expresses "weiss nicht" / no opinion. */
function isDontKnow(t) { return DONTKNOW_PATTERNS.some(p => p.test(t)) }

/** Extract a coded value for a CLOSED item, or null if none is stated. */
function extractClosedValue(verbatim, item, itemType) {
  switch (itemType) {
    case ITEM_TYPES.BINARY:
      if (/\bja\b/i.test(verbatim)) return 1
      if (/\bnein\b/i.test(verbatim)) return 0
      return null

    case ITEM_TYPES.CHOICE: {
      const choices = item.choices || []
      // Prefer an explicit "1)"/"2)" index, then a substring match.
      const idx = extractScaleNumber(verbatim, 1, choices.length)
      if (idx != null) return choices[idx - 1]
      const lower = verbatim.toLowerCase()
      for (const c of choices) {
        if (c && lower.includes(c.toLowerCase())) return c
      }
      return null
    }

    case ITEM_TYPES.SCALE:
    default: {
      const s = (item && item.scale) || { min: 1, max: 10 }
      const n = extractScaleNumber(verbatim, s.min, s.max)
      return n == null ? null : clamp(n, s.min, s.max)
    }
  }
}

/**
 * Code a blob's free-text reply into a value for the given item.
 * Order: API errors first; for closed items a clearly stated value wins even
 * amid hedging, otherwise the reply is classified as dont-know / refusal /
 * unparsed. Open items only distinguish nonresponse from substantive text.
 * @returns {{ status: string, value: (number|string|null), verbatim: string }}
 */
export function parseAnswer(reply, item) {
  const verbatim = (reply == null ? '' : String(reply)).trim()
  const itemType = (item && item.type) || ITEM_TYPES.SCALE

  if (isErrorReply(verbatim)) {
    return { status: ANSWER_STATUS.ERROR, value: null, verbatim }
  }

  if (itemType === ITEM_TYPES.OPEN) {
    if (isRefusal(verbatim)) return { status: ANSWER_STATUS.REFUSED, value: null, verbatim }
    if (isDontKnow(verbatim)) return { status: ANSWER_STATUS.DONTKNOW, value: null, verbatim }
    return { status: ANSWER_STATUS.ANSWERED, value: verbatim, verbatim }
  }

  const value = extractClosedValue(verbatim, item, itemType)
  if (value != null) return { status: ANSWER_STATUS.ANSWERED, value, verbatim }

  if (isDontKnow(verbatim)) return { status: ANSWER_STATUS.DONTKNOW, value: null, verbatim }
  if (isRefusal(verbatim)) return { status: ANSWER_STATUS.REFUSED, value: null, verbatim }
  return { status: ANSWER_STATUS.UNPARSED, value: null, verbatim }
}
