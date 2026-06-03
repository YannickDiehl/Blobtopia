/**
 * src/lib/survey-dataset.js
 *
 * Turns the runSurvey() result into an analysis-ready dataset: a flat
 * respondent x item matrix plus CSV + codebook export for R/SPSS/Stata.
 *
 * Row shape coming in (from survey-engine.runSurvey):
 *   { blobId, stratum, weight, <demographic cols...>, answers: { itemId: { value, status, verbatim } } }
 */

const RESERVED = new Set(['blobId', 'stratum', 'weight', 'answers'])

/** Demographic column names present on the rows (everything that isn't reserved). */
export function datasetColumns(rows) {
  const cols = []
  const seen = new Set()
  for (const r of rows) {
    for (const k in r) {
      if (!RESERVED.has(k) && !seen.has(k)) { seen.add(k); cols.push(k) }
    }
  }
  return cols
}

function csvCell(v, delim) {
  if (v == null) return ''
  const s = String(v)
  if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function itemId(item, qi) {
  return item.id || ('item_' + qi)
}

/**
 * Render the dataset as CSV.
 * @param {Array} rows   runSurvey rows
 * @param {Array} items  questionnaire items
 * @param {Object} [opts] { delimiter=',', includeStatus=true, bom=true }
 * @returns {string} CSV text (UTF-8 BOM by default, CRLF line endings)
 */
export function toCSV(rows, items, opts) {
  opts = opts || {}
  const delim = opts.delimiter || ','
  const includeStatus = opts.includeStatus !== false
  const bom = opts.bom !== false ? '﻿' : ''
  const demoCols = datasetColumns(rows)

  const header = ['id', 'stratum', 'weight'].concat(demoCols)
  for (let qi = 0; qi < items.length; qi++) {
    const id = itemId(items[qi], qi)
    header.push(id)
    if (includeStatus) header.push(id + '_status')
  }

  const lines = [header.map(h => csvCell(h, delim)).join(delim)]
  for (const r of rows) {
    const row = [r.blobId, r.stratum, r.weight].concat(demoCols.map(c => r[c]))
    for (let qi = 0; qi < items.length; qi++) {
      const id = itemId(items[qi], qi)
      const a = (r.answers && r.answers[id]) || {}
      row.push(a.value == null ? '' : a.value)
      if (includeStatus) row.push(a.status || '')
    }
    lines.push(row.map(c => csvCell(c, delim)).join(delim))
  }
  return bom + lines.join('\r\n')
}

/** A simple codebook describing each survey variable. */
export function toCodebook(items) {
  return items.map((it, qi) => ({
    variable: itemId(it, qi)
    , question: it.text || ''
    , type: it.type
    , scale: it.scale ? (it.scale.min + '-' + it.scale.max)
      : (it.choices ? it.choices.join(' / ') : 'offen')
  }))
}

/** Response-rate summary per item (answered / dontknow / refused / unparsed / error). */
export function responseSummary(rows, items) {
  const summary = {}
  for (let qi = 0; qi < items.length; qi++) {
    const id = itemId(items[qi], qi)
    const counts = { answered: 0, dontknow: 0, refused: 0, unparsed: 0, error: 0 }
    for (const r of rows) {
      const a = r.answers && r.answers[id]
      if (a && counts[a.status] != null) counts[a.status]++
    }
    summary[id] = counts
  }
  return summary
}
