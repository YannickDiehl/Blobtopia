/**
 * src/lib/survey-demographics.js
 *
 * Catalog of the background variables (Soziodemographie) a survey CAN collect.
 * Like in a real questionnaire, nothing is recorded automatically — students
 * pick the Hintergrundmerkmale explicitly in the Fragebogen step, and only
 * those become columns in the dataset/CSV.
 *
 * `key` is the stable variable name (CSV/R), `label` the UI text, `get` reads
 * from the adapted blob object (src/lib/blob-adapter.js shapes — the labeled
 * fields like district_name/education_label are preferred over raw codes so
 * the dataset is readable without a lookup table).
 */

export const DEMOGRAPHICS = [
  { key: 'name', label: 'Name', get: b => b.name || null }
  , { key: 'district', label: 'Distrikt', get: b => b.district_name != null ? b.district_name : b.district }
  , { key: 'age', label: 'Alter', get: b => b.age != null ? b.age : null }
  , { key: 'education', label: 'Bildung', get: b => b.education_label != null ? b.education_label : b.education_level }
  , { key: 'party', label: 'Partei', get: b => b.party_name || null }
  , { key: 'income', label: 'Einkommen', get: b => b.income != null ? Math.round(b.income) : null }
]

export const DEMOGRAPHICS_BY_KEY = DEMOGRAPHICS.reduce((m, d) => { m[d.key] = d; return m }, {})

/**
 * Build the per-blob demographics extractor for the fieldwork engines from the
 * selected keys. Unknown keys are ignored; empty selection → empty columns.
 * @param {Array<string>} keys  selected demographic keys (design.demographics)
 * @returns {(blob: Object) => Object}
 */
export function buildDemographics(keys) {
  const selected = (keys || []).map(k => DEMOGRAPHICS_BY_KEY[k]).filter(Boolean)
  return blob => {
    const out = {}
    for (const d of selected) out[d.key] = d.get(blob)
    return out
  }
}
