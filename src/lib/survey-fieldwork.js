/**
 * src/lib/survey-fieldwork.js
 *
 * Unit-Nonresponse + Erhebungsmodus: Aus der Brutto-Stichprobe wird über ein
 * zweistufiges Teilnahmemodell (Kontakt → Kooperation) die Netto-Stichprobe.
 * Beides ist SELEKTIV — der lehrbare Punkt:
 *   - Kontakt hängt am Alter (Jüngere sind schwerer erreichbar); mehr
 *     Kontaktversuche heben die Ausschöpfung, neutralisieren die Selektivität
 *     aber nicht.
 *   - Kooperation hängt an Vertrauen, Sozialkapital und (negativ) Entfremdung
 *     — genau die Merkmale, die viele Fragen messen sollen. Nonresponse-Bias
 *     ist deshalb kein Zufall, sondern Systematik.
 *   - Der Modus verschiebt alles: online erreicht gut, kooperiert schlecht
 *     und dämpft soziale Erwünschtheit (sdFactor fließt in die Antwort-Engine).
 *
 * Deterministisch: gleiche (Stichprobe, Modus, Versuche, Seed) ⇒ gleiche
 * Dispositionen. Konstanten sind Modellentscheidungen und hier dokumentiert.
 */
import { makeRng } from './survey-sampling.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'

export const FIELD_MODES = Object.freeze({
  personal: { key: 'personal', label: 'Persönlich-mündlich', contact1: 0.70, coopLogit: 0.9, sdFactor: 1.0 }
  , phone: { key: 'phone', label: 'Telefonisch', contact1: 0.60, coopLogit: 0.45, sdFactor: 0.7 }
  , online: { key: 'online', label: 'Online (selbstadministriert)', contact1: 0.85, coopLogit: 0.1, sdFactor: 0.2 }
})

export const DISPOSITION = Object.freeze({
  RESPONDENT: 'teilgenommen'
  , REFUSED: 'verweigert'
  , NONCONTACT: 'nicht erreicht'
  , ATTRITION: 'panel-ausfall'       // (Etappe C: Panel)
  , GONE: 'nicht mehr in population' // (Etappe C: Panel)
})

function logistic(x) { return 1 / (1 + Math.exp(-x)) }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }
function trait(blob, key) {
  const c = CONSTRUCTS_BY_KEY[key]
  const v = c ? c.get(blob) : null
  return v == null || isNaN(v) ? 5 : v
}

function hashSeed(parts) {
  const s = parts.join('|')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** P(Kontakt) — altersselektiv, steigt mit der Zahl der Kontaktversuche. */
export function contactProbability(blob, mode, attempts) {
  const m = FIELD_MODES[mode] || FIELD_MODES.personal
  const age = blob.age != null ? blob.age : 40
  const single = clamp(m.contact1 + (age - 40) * 0.005, 0.15, 0.98)
  const tries = clamp(Math.round(attempts || 1), 1, 4)
  return 1 - Math.pow(1 - single, tries)
}

/** P(Kooperation | Kontakt) — vertrauens-/sozialkapitalgetrieben. */
export function cooperationProbability(blob, mode) {
  const m = FIELD_MODES[mode] || FIELD_MODES.personal
  const z = 0.12 * (trait(blob, 'institutional_trust') - 5)
    + 0.10 * (trait(blob, 'generalized_trust') - 5)
    + 0.08 * (trait(blob, 'community_participation') - 5)
    - 0.08 * (trait(blob, 'powerlessness') - 5)
  return logistic(m.coopLogit + z)
}

/**
 * Brutto → Disposition pro Einheit. Reihenfolge bleibt die der Brutto-Liste.
 * @param {Array} units [{ blob, weight, stratum }]
 * @param {Object} opts { mode='personal', attempts=2, seed=12345 }
 * @returns {Array} [{ ...unit, disposition }]
 */
export function simulateParticipation(units, opts) {
  opts = opts || {}
  const mode = opts.mode || 'personal'
  const attempts = opts.attempts != null ? opts.attempts : 2
  const seed = opts.seed != null ? opts.seed : 12345
  return units.map(u => {
    const rng = makeRng(hashSeed([u.blob.id, 'field', mode, attempts, seed]))
    if (rng() > contactProbability(u.blob, mode, attempts)) {
      return Object.assign({}, u, { disposition: DISPOSITION.NONCONTACT })
    }
    if (rng() > cooperationProbability(u.blob, mode)) {
      return Object.assign({}, u, { disposition: DISPOSITION.REFUSED })
    }
    return Object.assign({}, u, { disposition: DISPOSITION.RESPONDENT })
  })
}

/** Dispositions-Zählung + Ausschöpfungsquote (AAPOR-light). */
export function fieldReport(participation) {
  const counts = {}
  for (const p of participation) counts[p.disposition] = (counts[p.disposition] || 0) + 1
  const gross = participation.length
  const net = counts[DISPOSITION.RESPONDENT] || 0
  return { gross, net, responseRate: gross > 0 ? net / gross : 0, dispositions: counts }
}
