/**
 * src/lib/survey-parse.js
 *
 * Parses a free-text survey item (the student writes the whole question AND the
 * answer scale in their own words, like a codebook). From that text it derives:
 *   - the response SCALE (numeric range / binary / Likert) for coding answers
 *   - the measured CONSTRUCT (keyword inference; shown transparently, correctable)
 *   - WORDING FEATURES that drive the modeled questionnaire effects in the
 *     synthetic engine (acquiescence, framing, social desirability)
 *
 * All heuristic + deterministic — no LLM. The point is precisely that wording
 * matters: two phrasings of the same construct yield different detected
 * features and therefore different (synthetic) answers.
 */
import { suggestConstruct, CONSTRUCTS_BY_KEY } from './survey-constructs.js'

function endpointLabel(text, num) {
  const re = new RegExp(num + '\\s*(?:=|steht f(?:ü|ue)r|bedeutet)\\s*[„"„]?([^,;.")\\n]+)', 'i')
  const m = text.match(re)
  return m ? m[1].trim().replace(/["“”„]/g, '') : ''
}

/**
 * Detect the answer scale from the wording.
 * @returns {{ min, max, minLabel, maxLabel, format }}
 */
export function parseScale(text) {
  const t = text || ''
  // Explicit numeric range: "1 bis 10", "0-10", "1–7", "von 1 bis 5", "1 to 10"
  const m = t.match(/(\d{1,2})\s*(?:bis|[-–—]|to)\s*(\d{1,2})/i)
  if (m) {
    let min = parseInt(m[1], 10)
    let max = parseInt(m[2], 10)
    if (max < min) { const tmp = min; min = max; max = tmp }
    return { min, max, minLabel: endpointLabel(t, min), maxLabel: endpointLabel(t, max), format: 'numeric' }
  }
  // Binary: "ja oder nein", "ja/nein"
  if (/\bja\b\s*(?:oder|\/)\s*\bnein\b|\bnein\b\s*(?:oder|\/)\s*\bja\b/i.test(t)) {
    return { min: 0, max: 1, minLabel: 'nein', maxLabel: 'ja', format: 'binary' }
  }
  // Agreement Likert without explicit numbers → default 1–5
  if (/(stimme|trifft|zustimm)/i.test(t) && /(zu|nicht)/i.test(t)) {
    return { min: 1, max: 5, minLabel: 'stimme gar nicht zu', maxLabel: 'stimme voll zu', format: 'likert' }
  }
  // Fallback: a generic 1–10 scale
  return { min: 1, max: 10, minLabel: '', maxLabel: '', format: 'numeric' }
}

/**
 * Detect wording features that bias the (synthetic) answer.
 * @returns {{ agreeScale, loadedPositive, loadedNegative, socialDesirability }}
 */
export function detectWording(text) {
  const t = (text || '').toLowerCase()
  return {
    agreeScale: /(stimme|trifft|zustimm)/.test(t) && /(zu|nicht)/.test(t)
    , loadedPositive: /(gro(ß|ss)artig|wichtig|verantwortungsvoll|sch(ü|ue)tz|fair|gerecht|notwendig|sinnvoll|gut f(ü|ue)r|chance|fortschritt)/.test(t)
    , loadedNegative: /(versag|gescheitert|gef(ä|ae)hrlich|schlecht|korrupt|chaos|bedrohung|skandal|verschwend|naiv|zerst)/.test(t)
    , socialDesirability: /(geben sie (ehrlich )?zu|ehrlich gesagt|sollte man|moralisch|gewissen|verantwortung|pflicht|anst(ä|ae)ndig)/.test(t)
  }
}

/** One-call parse used by the UI: scale + construct + wording from free text. */
export function parseItem(text) {
  const construct = suggestConstruct(text)
  const wording = detectWording(text)
  const c = construct ? CONSTRUCTS_BY_KEY[construct] : null

  // Demografische Selbstauskünfte (raw) sind offene Zahlenfragen — es sei
  // denn, die Studierenden geben selbst einen Bereich vor („von 18 bis 99",
  // auch >2-stellig, z. B. Einkommen „500 bis 5000").
  if (c && c.raw) {
    const m = (text || '').match(/(\d{1,6})\s*(?:bis|[-–—]|to)\s*(\d{1,6})/i)
    if (m) {
      let min = parseInt(m[1], 10)
      let max = parseInt(m[2], 10)
      if (max < min) { const tmp = min; min = max; max = tmp }
      return { scale: { min, max, minLabel: '', maxLabel: '', format: 'numeric' }, construct, wording }
    }
    return { scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'open' }, construct, wording }
  }

  return { scale: parseScale(text), construct, wording }
}
