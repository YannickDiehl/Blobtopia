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
 *   - Der FRAGEBOGEN selbst kostet Kooperation (Befragungslast/Topic-Salienz):
 *     questionnaireBurden() verdichtet die Frageeffekte (sensible Themen, soziale
 *     Erwünschtheit, geladene Wortwahl, extreme Items, Länge) zu einem Logit-
 *     Abzug auf die Kooperation. Ein sauberer, kurzer Fragebogen erreicht im
 *     Regelfall ~90 % (persönlich) — gerne darüber bei einfachen, darunter bei
 *     problematischen Fragen. So wird die Ausschöpfung zum Design-Feedback.
 *
 * Trotz der hohen Ziel-Ausschöpfung bleiben die Ausfälle bewusst STARK
 * merkmalsselektiv (kräftige z-Koeffizienten), damit der Nonresponse-Bias (③ im
 * Wahrheit-Teleskop) sichtbar bleibt: wenige Ausfälle, aber klar verzerrend.
 *
 * Deterministisch: gleiche (Stichprobe, Modus, Versuche, Last, Seed) ⇒ gleiche
 * Dispositionen. Konstanten sind Modellentscheidungen und hier dokumentiert.
 */
import { makeRng } from './survey-sampling.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'

// contact1 = Kontaktwahrscheinlichkeit beim ersten Versuch (Alter justiert sie);
// coopLogit = Basis-Logit der Kooperation bei mittleren Merkmalen, BEVOR
// Selektivität (z) und Fragebogen-Last abgezogen werden. Auf ~90 % (persönlich)
// / ~80 % (Telefon) / ~70 % (online) für einen neutralen Fragebogen kalibriert
// (scripts/experiments/calibrate-fieldwork.mjs gegen die echte Population).
export const FIELD_MODES = Object.freeze({
  personal: { key: 'personal', label: 'Persönlich-mündlich', contact1: 0.80, coopLogit: 2.85, sdFactor: 1.0 }
  , phone: { key: 'phone', label: 'Telefonisch', contact1: 0.70, coopLogit: 1.95, sdFactor: 0.7 }
  , online: { key: 'online', label: 'Online (selbstadministriert)', contact1: 0.88, coopLogit: 0.82, sdFactor: 0.2 }
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

/**
 * P(Kooperation | Kontakt) — vertrauens-/sozialkapitalgetrieben, gedämpft durch
 * die Fragebogen-Last. Die z-Koeffizienten sind bewusst kräftig, damit die
 * Selektivität trotz der hohen Basis-Kooperation (flacher oberer Logit-Bereich)
 * eine sichtbare Spreizung erzeugt — die Lektion „hohe Quote ≠ kein Bias".
 * @param {number} [burden] Logit-Abzug aus questionnaireBurden(items); 0 = neutral.
 */
export function cooperationProbability(blob, mode, burden) {
  const m = FIELD_MODES[mode] || FIELD_MODES.personal
  const z = 0.28 * (trait(blob, 'institutional_trust') - 5)
    + 0.22 * (trait(blob, 'generalized_trust') - 5)
    + 0.18 * (trait(blob, 'community_participation') - 5)
    - 0.18 * (trait(blob, 'powerlessness') - 5)
  return logistic(m.coopLogit + z - (burden || 0))
}

// ── Fragebogen-Last (Befragungslast / Topic-Salienz) ────────────────────────
// Verdichtet die Frageeffekte zu EINEM Logit-Abzug auf die Kooperation. Die
// Signale liefert die Frage-Analyse pro Item (wording / construct.sensitive /
// scale.difficulty). Bewusst NICHT enthalten: validity.lambda — Kreuzladung ist
// für die/den Befragte:n unsichtbar (reine Messfehler-Frage, gehört nicht zur
// erlebten Last). Ein Basis-Guthaben (−0.4) hebt saubere, kurze Fragebögen über
// die Basisquote; der Deckel (2.6) hält selbst den schlimmsten Fragebogen über
// ~55 % statt ihn auf null zu drücken.
const BURDEN = Object.freeze({
  sensitive: 0.7          // sensible Themen (Einkommen) schrecken am stärksten ab
  , socialDesirability: 0.5 // heikle / moralisierende Fragen
  , loaded: 0.25          // suggestiv geladene Wortwahl (mild irritierend)
  , extremePerUnit: 0.05  // je |difficulty−5|: krasse Extrem-Items (max +0.25/Item)
  , lengthPerItem: 0.08   // Ermüdung je Item über die ersten zwei hinaus
  , credit: 0.4           // Guthaben: saubere kurze Fragebögen → über die Basisquote
})

/**
 * Logit-Abzug auf die Kooperation aus dem Fragebogen. 0 ≈ neutraler Fragebogen;
 * negativ (bis −0.4) = sauber/kurz (Quote steigt); positiv (bis +2.6) =
 * problematisch (Quote sinkt).
 * @param {Array} items Fragebogen-Items (mit wording/construct/scale aus der Analyse)
 */
export function questionnaireBurden(items) {
  if (!items || !items.length) return 0
  let penalty = 0
  for (const it of items) {
    const w = it.wording || {}
    const c = it.construct ? CONSTRUCTS_BY_KEY[it.construct] : null
    if (c && c.sensitive) penalty += BURDEN.sensitive
    if (w.socialDesirability) penalty += BURDEN.socialDesirability
    if (w.loadedPositive || w.loadedNegative) penalty += BURDEN.loaded
    const diff = it.scale && it.scale.difficulty != null ? it.scale.difficulty : 5
    penalty += BURDEN.extremePerUnit * Math.abs(diff - 5)
  }
  penalty += BURDEN.lengthPerItem * Math.max(0, items.length - 2)
  return clamp(penalty - BURDEN.credit, -BURDEN.credit, 2.6)
}

/**
 * Erwartete Ausschöpfung über einen Rahmen — der Prädiktor für die UI-Vorschau
 * (die tatsächliche Quote ergibt sich aus den seeded Bernoulli-Zügen je Einheit).
 * @param {Array} frame eligible Rahmen-Blobs
 * @param {Object} [opts] { mode='personal', attempts=2, burden=0 }
 * @returns {number|null} mittlere P(Kontakt)·P(Kooperation) über den Rahmen
 */
export function expectedResponseRate(frame, opts) {
  opts = opts || {}
  if (!frame || !frame.length) return null
  const mode = opts.mode || 'personal'
  const attempts = opts.attempts != null ? opts.attempts : 2
  const burden = opts.burden || 0
  let s = 0
  for (const b of frame) s += contactProbability(b, mode, attempts) * cooperationProbability(b, mode, burden)
  return s / frame.length
}

/**
 * Brutto → Disposition pro Einheit. Reihenfolge bleibt die der Brutto-Liste.
 * @param {Array} units [{ blob, weight, stratum }]
 * @param {Object} opts { mode='personal', attempts=2, seed=12345, burden=0 }
 *   burden = Logit-Abzug auf die Kooperation aus questionnaireBurden(items).
 * @returns {Array} [{ ...unit, disposition }]
 */
export function simulateParticipation(units, opts) {
  opts = opts || {}
  const mode = opts.mode || 'personal'
  const attempts = opts.attempts != null ? opts.attempts : 2
  const seed = opts.seed != null ? opts.seed : 12345
  const burden = opts.burden || 0
  return units.map(u => {
    const rng = makeRng(hashSeed([u.blob.id, 'field', mode, attempts, seed]))
    if (rng() > contactProbability(u.blob, mode, attempts)) {
      return Object.assign({}, u, { disposition: DISPOSITION.NONCONTACT })
    }
    if (rng() > cooperationProbability(u.blob, mode, burden)) {
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
