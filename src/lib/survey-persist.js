/**
 * src/lib/survey-persist.js
 *
 * Studien-Persistenz für den Seminar-Workflow. Zwei Ebenen:
 *   1. AUTOSAVE (localStorage): ein Reload verliert nie den Arbeitsstand.
 *   2. STUDIEN-DATEI (JSON-Export/-Import): enthält NUR das Design — Items,
 *      Ziehungsdesign inkl. Seed und den Feld-Tick. Weil die gesamte Pipeline
 *      seeded-deterministisch ist, gilt: Import + „Befragung durchführen"
 *      reproduziert den Datensatz BYTE-IDENTISCH. Studierende geben also eine
 *      kleine Datei ab, und die Lehrperson kann jede Studie exakt replizieren.
 */

export const STUDY_VERSION = 1
const DRAFT_KEY = 'blobtopia-survey-draft'

function hasStorage() {
  try { return typeof localStorage !== 'undefined' && localStorage !== null } catch (_e) { return false }
}

/** Serialize a study (design only — replay regenerates the data). */
export function serializeStudy({ items, design, tick }) {
  return JSON.stringify({
    type: 'blobtopia-studie'
    , version: STUDY_VERSION
    , feldTick: tick != null ? tick : null
    , items: items || []
    , design: design || {}
  }, null, 2)
}

/** Parse + validate a study file. Throws German, actionable errors. */
export function parseStudy(text) {
  let obj
  try { obj = JSON.parse(text) }
  catch (cause) { throw new Error('Keine gültige Studien-Datei (kein JSON).', { cause }) }
  if (!obj || obj.type !== 'blobtopia-studie') {
    throw new Error('Keine Blobtopia-Studie (type-Feld fehlt).')
  }
  if (typeof obj.version !== 'number' || obj.version > STUDY_VERSION) {
    throw new Error('Studien-Version ' + obj.version + ' wird nicht unterstützt (max. ' + STUDY_VERSION + ').')
  }
  if (!Array.isArray(obj.items)) throw new Error('Studien-Datei ohne Fragebogen (items).')
  if (!obj.design || typeof obj.design !== 'object') throw new Error('Studien-Datei ohne Ziehungsdesign (design).')
  return { items: obj.items, design: obj.design, tick: obj.feldTick != null ? obj.feldTick : null }
}

/** Autosave the working state (survives reloads; one draft per browser). */
export function saveDraft(study) {
  if (!hasStorage()) return
  try { localStorage.setItem(DRAFT_KEY, serializeStudy(study)) } catch (_e) { /* quota etc. */ }
}

export function loadDraft() {
  if (!hasStorage()) return null
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return null
  try { return parseStudy(raw) } catch (_e) { return null }
}

export function clearDraft() {
  if (hasStorage()) localStorage.removeItem(DRAFT_KEY)
}
