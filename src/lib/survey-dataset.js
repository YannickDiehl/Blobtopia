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

function csvCell(v, delim, decimal) {
  if (v == null) return ''
  let s
  if (typeof v === 'number') {
    s = String(v)
    if (decimal && decimal !== '.') s = s.split('.').join(decimal)
  } else {
    s = String(v)
  }
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
 * @param {Object} [opts] { delimiter=';', decimal=',', includeStatus=true, bom=true, truth }
 *   Defaults are German-Excel-native (semicolon-separated, comma decimals) so
 *   cells split correctly on a German locale. For R use read.csv2(); for a
 *   point/comma format pass { delimiter: ',', decimal: '.' }.
 *   `truth` (the snapshot from survey-truth.js) adds a `<item>_wahr` column per
 *   item — the instructor-only export; the student CSV never passes it.
 * @returns {string} CSV text (UTF-8 BOM, CRLF line endings)
 */
export function toCSV(rows, items, opts) {
  opts = opts || {}
  const delim = opts.delimiter || ';'
  const decimal = opts.decimal || ','
  const includeStatus = opts.includeStatus !== false
  const truth = opts.truth || null
  const bom = opts.bom !== false ? '﻿' : ''
  const demoCols = datasetColumns(rows)

  const header = ['id', 'stratum', 'weight'].concat(demoCols)
  for (let qi = 0; qi < items.length; qi++) {
    const id = itemId(items[qi], qi)
    header.push(id)
    if (includeStatus) header.push(id + '_status')
    if (truth) header.push(id + '_wahr')
  }

  const lines = [header.map(h => csvCell(h, delim, decimal)).join(delim)]
  for (const r of rows) {
    const row = [r.blobId, r.stratum, r.weight].concat(demoCols.map(c => r[c]))
    for (let qi = 0; qi < items.length; qi++) {
      const id = itemId(items[qi], qi)
      const a = (r.answers && r.answers[id]) || {}
      row.push(a.value == null ? '' : a.value)
      if (includeStatus) row.push(a.status || '')
      if (truth) {
        const t = truth.perUnit && truth.perUnit[r.blobId] ? truth.perUnit[r.blobId][id] : null
        row.push(t == null ? '' : Math.round(t * 100) / 100)
      }
    }
    lines.push(row.map(c => csvCell(c, delim, decimal)).join(delim))
  }
  return bom + lines.join('\r\n')
}

/** A simple codebook describing each survey variable. */
export function toCodebook(items) {
  return items.map((it, qi) => ({
    variable: itemId(it, qi)
    , question: it.stem || it.text || ''
    , type: it.type || (it.scale ? it.scale.format : 'offen')
    , scale: it.scale && it.scale.min != null ? (it.scale.min + '-' + it.scale.max + (it.scale.reversed ? ' (invers gepolt)' : ''))
      : (it.choices ? it.choices.join(' / ') : 'offene Zahl')
  }))
}

/** Codebook als CSV (gleiche deutsche Excel-Konventionen wie toCSV). */
export function codebookToCSV(items, constructLabels, opts) {
  opts = opts || {}
  const delim = opts.delimiter || ';'
  const rows = toCodebook(items)
  const lines = [['variable', 'frage', 'format', 'skala', 'misst'].join(delim)]
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const label = constructLabels && items[i].construct ? (constructLabels[items[i].construct] || items[i].construct) : ''
    lines.push([r.variable, csvCell(r.question, delim), r.type, r.scale, csvCell(label, delim)].join(delim))
  }
  return '﻿' + lines.join('\r\n')
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
