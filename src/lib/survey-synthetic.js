/**
 * src/lib/survey-synthetic.js
 *
 * Free, instant, reproducible answer engine — the cost workaround for large
 * surveys. For an item BOUND to a construct, it draws an answer from the blob's
 * stored 0–10 value plus calibrated measurement noise, maps it onto the item's
 * response scale, and models item-nonresponse (predicted from blob traits).
 * It never returns the raw stored value, and the same (blob, item, seed) always
 * yields the same answer.
 *
 * Produces the SAME row shape as survey-engine.runSurvey, so survey-dataset.js
 * (toCSV/toCodebook/responseSummary) works unchanged.
 *
 * Default noise SD (1.3 on the 0–10 scale) reflects the ±1–2 measurement slack
 * the LLM prompt teaches; it can later be calibrated to the validation suite's
 * measured LLM deviation (scripts/validation/layer4).
 */
import { makeRng } from './survey-sampling.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'
import { detectWording } from './survey-parse.js'

// Modeled questionnaire-effect magnitudes (on the 0–10 latent scale). These are
// deterministic systematic biases (not noise), so the SAME construct asked two
// ways yields a visibly different mean — the teachable point.
const ACQUIESCENCE = 0.8   // agree/disagree scales pull toward agreement
const FRAMING = 1.0        // loaded positive/negative wording
const SOCIAL_DESIRABILITY = 0.7

// Empirisch nachkalibriert (scripts/experiments/compare-synthetic-llm.mjs,
// 2026-06-12, n=25×6 Items, Tick 4015): Haiku weicht im Mittel nur ~0,4–0,75
// Skalenpunkte von der Wahrheit ab — die alten 1,3 rauschten doppelt so
// stark wie das echte LLM. Ehrlicher Befund daneben: das LLM widersteht
// negativem Framing weitgehend (+0,04 vs. modelliert −0,83) — die
// Wording-Effekte hier sind bewusst DIDAKTISCH gesetzt, nicht LLM-getreu.
const DEFAULT_NOISE_SD = 0.9

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

// Stable 32-bit hash of the (blob, item, run) triple -> RNG seed.
function hashSeed(parts) {
  const s = parts.join('|')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Standard normal via Box-Muller, driven by the seeded RNG.
function gaussian(rng) {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// Map a latent 0–10 construct value CONTINUOUSLY onto the item's response scale.
// Zwei Item-Eigenschaften gehen ein:
//  • difficulty (IRT-Schwelle, 0–10 auf der Konstruktskala): der Merkmalswert, der
//    auf die MITTE der Antwortskala fällt. 5 = ausgewogen → lineare Abbildung
//    (Normalfall, rückwärtskompatibel). Eine extreme Schwierigkeit verschiebt die
//    Rampe und erzeugt mit der Klemmung Boden-/Decken-Effekte: krasse Items (z. B.
//    „Atommüll frei entsorgen?", difficulty≈9) liefern dann realistisch eine starke
//    Mehrheitsablehnung mit kollabierter Varianz statt mittlerer Antworten.
//  • reversed (Polung): bei invers gepolten Skalen/Stämmen liegt der HOHE Wahrwert
//    an der NIEDRIGEN Zahl, der Bruch wird gespiegelt.
// Gerundet/geklemmt wird erst NACH der richtungstreuen Akquieszenz (siehe syntheticAnswer).
export function latentToItemScale(value, item) {
  const s = item.scale || { min: 1, max: 10 }
  const diff = (s.difficulty != null && !isNaN(s.difficulty)) ? clamp(s.difficulty, 0, 10) : 5
  let frac = clamp(0.5 + (clamp(value, 0, 10) - diff) / 10, 0, 1)
  if (s.reversed) frac = 1 - frac
  return s.min + frac * (s.max - s.min)
}

function trait(blob, key) {
  const c = CONSTRUCTS_BY_KEY[key]
  const v = c ? c.get(blob) : null
  return (v == null || isNaN(v)) ? null : v
}

function syntheticAnswer(blob, item, itemId, runSeed, noiseSd, wording, sdFactor) {
  // Synthetic answers need a construct binding (which stored value to draw from).
  const ck = item.construct
  if (!ck) return { status: 'unsupported', value: null, verbatim: '' }
  const stored = trait(blob, ck)
  if (stored == null) return { status: 'unsupported', value: null, verbatim: '' }
  const construct = CONSTRUCTS_BY_KEY[ck]

  const rng = makeRng(hashSeed([blob.id, itemId, runSeed]))

  // Modeled item nonresponse: rises with party-indifference (don't-know) and
  // distrust (refusal) — so nonresponse is non-random, the teachable point.
  // Sensitive Fragen (z. B. Einkommen) werden deutlich öfter verweigert; sozial
  // heikle/moralisierende Fragen ebenfalls (item-seitiger Teil von „Beides":
  // wer teilnimmt, lässt die heikle Einzelfrage trotzdem öfter aus — parallel
  // zur Fragebogen-Last, die schon die Teilnahme selbst senkt).
  const partyIndiff = trait(blob, 'party_indifference')
  const instTrust = trait(blob, 'institutional_trust')
  let pRefuse = 0.02 + 0.03 * ((instTrust == null ? 5 : (10 - instTrust)) / 10)
  if (construct && construct.sensitive) pRefuse += 0.12
  if (wording && wording.socialDesirability) pRefuse += 0.05
  const pDontKnow = 0.02 + 0.04 * ((partyIndiff == null ? 5 : partyIndiff) / 10)
  const roll = rng()
  if (roll < pRefuse) return { status: 'refused', value: null, verbatim: '' }
  if (roll < pRefuse + pDontKnow) return { status: 'dontknow', value: null, verbatim: '' }

  // Demografische Selbstauskunft (raw): echte Größe statt 0–10-Rescaling.
  // Modelliert: Underreporting (Einkommen), Berichts-Ungenauigkeit, Heaping
  // (Rundung auf glatte Werte), Klemmung in einen ggf. vorgegebenen Bereich.
  if (construct && construct.raw) {
    let v = stored
    if (construct.underreport) v *= (1 - construct.underreport)
    if (construct.relNoise) v += gaussian(rng) * construct.relNoise * Math.abs(stored)
    const heap = construct.heap || 1
    v = Math.round(v / heap) * heap
    const s = item.scale || {}
    if (s.min != null) v = Math.max(s.min, v)
    if (s.max != null) v = Math.min(s.max, v)
    return {
      status: 'answered', value: v, verbatim: ''
      , fx: { acq: 0, fra: 0, sd: 0, val: 0, und: construct.underreport ? -construct.underreport * stored : 0 }
    }
  }

  // Mischmodell-Validität: unscharfe Items (λ < 1, aus analyzeValidity) ziehen
  // zu (1−λ) aus dem Nachbarkonstrukt und rauschen stärker — eine schlecht
  // formulierte Frage ist ein UNREINES Instrument, nicht einfach „falsch".
  const val = item.validity
  let vShift = 0
  let effNoiseSd = noiseSd
  if (val && val.lambda < 1 && val.crossKey) {
    const crossC = CONSTRUCTS_BY_KEY[val.crossKey]
    const cross = crossC && !crossC.raw ? trait(blob, val.crossKey) : null
    if (cross != null) {
      vShift = (1 - val.lambda) * (cross - stored)
      effNoiseSd = noiseSd * (2 - val.lambda)
    }
  }

  // Modeled questionnaire effects from the wording (deterministic shifts) —
  // einzeln protokolliert für die Messfehler-Aufschlüsselung im Wahrheit-Tab.
  let acqShift = 0, fraShift = 0, sdShift = 0
  if (wording) {
    const edu = blob.education_level != null ? blob.education_level : 1.5
    const eduNorm = Math.max(0, Math.min(1, edu / 3))
    if (wording.agreeScale) acqShift = ACQUIESCENCE * (1 - eduNorm) // acquiescence, stronger at low education
    if (wording.loadedPositive) fraShift += FRAMING
    if (wording.loadedNegative) fraShift -= FRAMING
    // Soziale Erwünschtheit hängt am Erhebungsmodus (sdFactor: persönlich 1.0,
    // Telefon 0.7, online 0.2 — siehe survey-fieldwork.js FIELD_MODES).
    if (wording.socialDesirability) sdShift = SOCIAL_DESIRABILITY * (sdFactor != null ? sdFactor : 1)
  }
  // Konstrukt-bezogene Verzerrungen (Validität, Framing, soziale Erwünschtheit)
  // verschieben den LATENTEN Wert — sie spiegeln also mit der Skalenrichtung.
  // Akquieszenz NICHT: die Ja-Sage-Tendenz wird unten richtungstreu addiert.
  const cShift = vShift + fraShift + sdShift
  const noise = gaussian(rng) * effNoiseSd
  const s = item.scale || { min: 1, max: 10 }
  const format = s.format || 'numeric'

  if (format === 'binary') {
    // Binäritems werden nicht in ④ zerlegt (fx=null); Akquieszenz wirkt hier
    // über den Konstruktraum auf die Schwelle. latentToItemScale trägt Polung
    // UND Item-Schwierigkeit (Schwelle), gibt einen 0–1-Anteil → Ja/Nein.
    const latentB = clamp(stored + acqShift + cShift, 0, 10) + noise
    return { status: 'answered', value: latentToItemScale(latentB, item) >= 0.5 ? 1 : 0, verbatim: '', fx: null }
  }

  // Richtungstreue Akquieszenz: die Ja-Sage-Tendenz drückt IMMER zum HOHEN Ende
  // der Antwortskala (Zustimmung), unabhängig von der Polung des Item-Stamms.
  // Deshalb in Antwortskaleneinheiten und NICHT über f gespiegelt — so senkt sie
  // bei gemischt gepolten Batterien die Inter-Item-Korrelation und Cronbachs α.
  // fx: systematische Anteile in Einheiten der ANTWORTSKALA; was die
  // Aufschlüsselung nicht erklärt, ist Rauschen/Rundung/Klemmung (residual).
  // f trägt die Steigung INKL. Vorzeichen für die konstrukt-bezogenen Effekte;
  // die Akquieszenz steht bewusst außerhalb von f, damit Summe ≡ Messfehler hält.
  const f = (s.max - s.min) / 10 * (s.reversed ? -1 : 1)
  const acqAnswer = acqShift * (s.max - s.min) / 10
  const latent = clamp(stored + cShift, 0, 10) + noise
  const baseAnswer = latentToItemScale(latent, item)
  const value = clamp(Math.round(baseAnswer + acqAnswer), s.min, s.max)
  return {
    status: 'answered', value: value, verbatim: ''
    , fx: { acq: acqAnswer, fra: fraShift * f, sd: sdShift * f, val: vShift * f, und: 0 }
  }
}

/**
 * Administer a questionnaire to a sample synthetically (no LLM).
 * @param {Array} units  [{ blob, weight, stratum }]
 * @param {Array} items  questionnaire items (those with a `construct` binding get answered)
 * @param {Object} [opts] { seed=12345, noiseSd=1.3, demographics, sdFactor=1 }
 * @returns {{ rows: Array, meta: Object }}
 */
export function runSyntheticSurvey(units, items, opts) {
  opts = opts || {}
  const runSeed = opts.seed != null ? opts.seed : 12345
  const noiseSd = opts.noiseSd != null ? opts.noiseSd : DEFAULT_NOISE_SD
  const sdFactor = opts.sdFactor != null ? opts.sdFactor : 1
  const demographics = typeof opts.demographics === 'function' ? opts.demographics : () => ({})

  // Wording features per item drive the modeled questionnaire effects.
  const wordingByItem = items.map(it => it.wording || detectWording(it.text || ''))
  const rows = units.map(u => {
    const b = u.blob
    const answers = {}
    for (let qi = 0; qi < items.length; qi++) {
      const item = items[qi]
      const id = item.id || ('item_' + qi)
      answers[id] = syntheticAnswer(b, item, id, runSeed, noiseSd, wordingByItem[qi], sdFactor)
    }
    return Object.assign(
      { blobId: b.id, stratum: u.stratum, weight: u.weight }
      , demographics(b)
      , { answers: answers }
    )
  })

  return { rows: rows, meta: { n: units.length, items: items.length, mode: 'synthetic', seed: runSeed } }
}

/** Population ground truth for a construct (for the measurement-error view). */
export function groundTruthValue(blob, constructKey) {
  return trait(blob, constructKey)
}
