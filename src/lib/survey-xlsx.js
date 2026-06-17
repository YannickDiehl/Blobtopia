/**
 * src/lib/survey-xlsx.js
 *
 * Exportiert einen Befragungs-Datensatz als labelgetreue `.xlsx` im Format des
 * R-Pakets **mariposa** (Yannick Diehl) — damit die in Blobtopia erhobenen Daten
 * in R per `read_xlsx()` mit voller Label-/Missing-Rekonstruktion zurückgelesen
 * werden können (Roundtrip: erheben hier → analysieren dort).
 *
 * mariposa erwartet eine Arbeitsmappe mit ZWEI Blättern:
 *   • „Data"   — die nackten Codes (Zahlen/Strings, KEINE Label-Texte). Kopfzeile
 *                = Variablennamen. Fehlende Werte als numerische Missing-Codes
 *                (-9/-8/-7), Nichtteilnahme = leere Zelle (System-NA).
 *   • „Labels" — Lookup im Long-Format mit GENAU diesen Spalten:
 *                Variable · Variable_Label · Value · Value_Label · Type · Column_Type
 *                Type ∈ {valid, missing}; Column_Type ∈ {haven_labelled, factor, ''}.
 *
 * read_xlsx rekonstruiert daraus haven_labelled-Variablen, Variable-/Value-Labels
 * und tagged NAs (die Missing-Codes werden zu echten SPSS-Missings).
 *
 * Spaltenreihenfolge im „Data"-Blatt (Vorgabe Yannick):
 *   id · [welle] · name · (gewählte Soziodemografie) · q1…qn · weight · stratum · disposition
 *
 * Der XLSX-Writer ist bewusst dependency-frei: minimales OOXML (inline strings)
 * in einem hand-gerollten, UNkomprimierten (STORED) Zip mit eigenem CRC32.
 */
import { DEMOGRAPHICS, DEMOGRAPHICS_BY_KEY } from './survey-demographics.js'
import { CONSTRUCTS_BY_KEY } from './survey-constructs.js'
import { DISPOSITION } from './survey-fieldwork.js'
// Die Code↔Label-Kataloge (DISTRICT_NAMES/EDUCATION_LABELS/PARTY_NAMES) liegen in
// blob-adapter.js, das eine JSON-Datei importiert (Browser/Vite ok, Node-Tests
// nicht). Deshalb werden sie NICHT hier importiert, sondern vom Store über opts
// hereingereicht — so bleibt dieses Modul ohne Seiteneffekte node-testbar.

// Missing-Schema (ALLBUS-/SPSS-Konvention, wie mariposa::set_na/read_spss).
// Default-Codes + Labels je Art, falls die Studierende keine eigenen vergibt:
// Verweigert → -9, Weiß nicht → -8, Ungültig → -7. Nichtbefragte (Unit-Nonresponse)
// bleiben System-NA (leere Zelle). Studierende können Codes + Labels in der Frage
// selbst anlegen (item.scale.missingLabels, kind-getrieben) — die überschreiben
// dann die Defaults gleicher Art. „Verweigert" deckt sich mit der Unit-Disposition.
const DEFAULT_MISSING = Object.freeze({
  refused: { code: -9, label: 'Verweigert' }
  , dontknow: { code: -8, label: 'Weiß nicht' }
  , invalid: { code: -7, label: 'Ungültig' }
})

/**
 * Missing-Schema eines Items: die vom Studierenden deklarierten Codes/Labels je
 * Art (item.scale.missingLabels) mit Default-Fallback. `declared` ist die volle
 * Liste (inkl. notapplicable) fürs Labels-Blatt.
 */
function missingSchemeFor(item) {
  const declared = (item && item.scale && Array.isArray(item.scale.missingLabels)) ? item.scale.missingLabels : []
  const byKind = {}
  for (const m of declared) if (m && m.value != null && byKind[m.kind] == null) byKind[m.kind] = { code: m.value, label: m.label }
  return {
    refused: byKind.refused || DEFAULT_MISSING.refused
    , dontknow: byKind.dontknow || DEFAULT_MISSING.dontknow
    , invalid: byKind.invalid || DEFAULT_MISSING.invalid
    , declared: declared
  }
}

/**
 * Missing-Label-Zeilen eines Items: ALLE deklarierten Studierenden-Kategorien
 * (auch mit 0 Vorkommen — Codebuch-Definition), plus die Default-Codes, die
 * tatsächlich vorkommen und nicht schon deklariert sind.
 */
function missingLabelRows(scheme, data) {
  const out = []
  const seen = new Set()
  for (const m of scheme.declared) {
    if (m == null || m.value == null || seen.has(m.value)) continue
    seen.add(m.value); out.push({ code: m.value, label: m.label })
  }
  for (const def of [scheme.refused, scheme.dontknow, scheme.invalid]) {
    if (seen.has(def.code)) continue
    if (data.includes(def.code)) { seen.add(def.code); out.push({ code: def.code, label: def.label }) }
  }
  return out
}

// Disposition → numerische Codes (Labels = die deutschen Strings aus DISPOSITION).
const DISPO_ORDER = [DISPOSITION.RESPONDENT, DISPOSITION.REFUSED, DISPOSITION.NONCONTACT, DISPOSITION.ATTRITION, DISPOSITION.GONE]
const DISPO_LABELS = DISPO_ORDER.map((d, i) => ({ code: i + 1, label: d }))
const DISPO_CODE = DISPO_ORDER.reduce((m, d, i) => { m[d] = i + 1; return m }, {})

const LABELS_HEADER = ['Variable', 'Variable_Label', 'Value', 'Value_Label', 'Type', 'Column_Type']

/** Code für eine Item-Antwort: Wert, Missing-Code (Schema des Items) oder null (System-NA). */
function answerCell(a, scheme) {
  if (!a) return null
  switch (a.status) {
    case 'answered': return a.value
    case 'refused': return scheme.refused.code
    case 'dontknow': return scheme.dontknow.code
    case 'unparsed':
    case 'error': return scheme.invalid.code
    default: return null // unsupported / unbekannt → System-NA
  }
}

function isRawItem(item) {
  const c = item.construct ? CONSTRUCTS_BY_KEY[item.construct] : null
  return !!(c && c.raw) || (item.scale && item.scale.format === 'open')
}

/**
 * R-/tibble-freundlicher Variablenname aus dem frei vergebenen Item-Kürzel
 * (it.name, z. B. „Atommüll"). Buchstaben (inkl. Umlaute), Ziffern, „_" und „."
 * bleiben; alles andere (Leerzeichen, Satzzeichen) wird zu „_"; führt der Name
 * mit einer Ziffer, wird ein „x" vorangestellt. Ohne Kürzel → Fallback q{n}.
 */
function sanitizeVarName(s) {
  let n = String(s == null ? '' : s).trim()
    .replace(/[^\p{L}\p{N}_.]+/gu, '_')
    .replace(/^[_.]+|_+$/g, '')
  if (!n) return ''
  if (/^[0-9]/.test(n)) n = 'x' + n
  return n
}
function itemVarName(item, qi) {
  return sanitizeVarName(item && item.name) || ('q' + (qi + 1))
}

/** Eindeutiger Spaltenname: bei Kollision _2, _3 … anhängen (Set wird ergänzt). */
function uniqueName(base, used) {
  let name = base, k = 2
  while (used.has(name)) { name = base + '_' + k; k++ }
  used.add(name)
  return name
}

/** Eine Variable: { name, label, columnType, valueLabels, missingLabels, data }. */
function v(name, label, columnType, valueLabels, missingLabels, data) {
  return { name, label, columnType, valueLabels: valueLabels || [], missingLabels: missingLabels || [], data }
}

/** Long-Format-Labels-Zeilen einer Variable (oder eine reine Variable-Label-Zeile). */
function labelRowsFor(variable) {
  const out = []
  for (const vl of variable.valueLabels) {
    out.push([variable.name, variable.label, String(vl.code), vl.label, 'valid', variable.columnType])
  }
  for (const ml of variable.missingLabels) {
    out.push([variable.name, variable.label, String(ml.code), ml.label, 'missing', variable.columnType])
  }
  if (!out.length && variable.label) {
    out.push([variable.name, variable.label, '', '', '', variable.columnType])
  }
  return out
}

/**
 * Baut die zwei Blätter (Data + Labels) aus den Befragungs-Zeilen.
 * @param {Array}  rows   Ergebniszeilen (Brutto inkl. Dispositionen) wie im Store
 * @param {Array}  items  Fragebogen-Items (mit scale/construct/wording)
 * @param {Object} design Stichproben-/Erhebungsdesign (für die gewählte Demografie)
 * @param {Object} [opts] { truth, districtNames, educationLabels, partyNames }
 *   truth = Snapshot aus survey-truth.js ⇒ zusätzliche `<id>_wahr`-Spalten (Dozentenversion)
 * @returns {{ data: {header, rows}, labels: {header, rows} }}
 */
export function buildWorkbook(rows, items, design, opts) {
  opts = opts || {}
  rows = rows || []
  items = items || []
  const truth = opts.truth || null
  const districtNames = opts.districtNames || []
  const educationLabels = opts.educationLabels || []
  const partyNames = opts.partyNames || []

  // Fall-ID: stabil je Blob (im Panel über Wellen hinweg dieselbe Nummer).
  const idMap = new Map()
  let nextId = 1
  for (const r of rows) if (!idMap.has(r.blobId)) idMap.set(r.blobId, nextId++)

  const present = new Set()
  for (const r of rows) for (const k in r) present.add(k)

  const vars = []

  // ── id [· welle] ──
  vars.push(v('id', 'Fall-ID', '', null, null, rows.map(r => idMap.get(r.blobId))))
  if (present.has('welle')) {
    vars.push(v('welle', 'Welle', '', null, null, rows.map(r => r.welle)))
  }

  // ── Soziodemografie (nur die erhobenen; Katalog-Reihenfolge ⇒ name zuerst) ──
  const demoCols = DEMOGRAPHICS.filter(d => present.has(d.key))
  for (const d of demoCols) {
    vars.push(demographicVariable(d.key, rows, { districtNames, educationLabels, partyNames }))
  }

  // ── Items (+ optionale Wahrheitsspalten für die Dozentenversion) ──
  // Spaltenname = frei vergebenes Item-Kürzel (it.name, z. B. „Atommüll"),
  // Fallback q{n}. Der Datenschlüssel bleibt die stabile it.id (answers[id]) —
  // nur der nach außen sichtbare Variablenname trägt das Kürzel. Kollisionen
  // (untereinander UND mit den bereits gesetzten id/welle/Demografie-Spalten
  // sowie weight/stratum/disposition) werden mit _2, _3 … eindeutig gemacht.
  const usedNames = new Set(vars.map(x => x.name).concat(['weight', 'stratum', 'disposition']))
  for (let qi = 0; qi < items.length; qi++) {
    const it = items[qi]
    const id = it.id || ('item_' + qi)
    const varName = uniqueName(itemVarName(it, qi), usedNames)
    const s = it.scale || {}
    const scheme = missingSchemeFor(it)
    const data = rows.map(r => answerCell(r.answers && r.answers[id], scheme))
    // Value-Labels: alle ausformulierten Kategorien (LLM-Analyse); sonst die
    // Endpunkte. Bei offenen/raw Fragen keine.
    let valueLabels = []
    if (!isRawItem(it)) {
      if (Array.isArray(s.valueLabels) && s.valueLabels.length) {
        valueLabels = s.valueLabels.map(vl => ({ code: vl.value, label: vl.label }))
      } else {
        if (s.minLabel && s.min != null) valueLabels.push({ code: s.min, label: s.minLabel })
        if (s.maxLabel && s.max != null) valueLabels.push({ code: s.max, label: s.maxLabel })
      }
    }
    // Missing-Labels: alle von der Studierenden deklarierten Kategorien (auch mit
    // 0 Vorkommen — Codebuch-Definition), plus Default-Codes, die vorkommen.
    // Variablen-Label = reine Frage.
    const missing = missingLabelRows(scheme, data)
    vars.push(v(varName, it.stem || it.text || varName, 'haven_labelled', valueLabels, missing, data))
    if (truth) {
      vars.push(v(varName + '_wahr', 'Wahrer Wert: ' + (it.stem || it.text || varName), '', null, null,
        rows.map(r => {
          const t = truth.perUnit && truth.perUnit[r.blobId] ? truth.perUnit[r.blobId][id] : null
          return t == null ? null : Math.round(t * 100) / 100
        })))
    }
  }

  // ── Technik / Prozess: weight · stratum · disposition ──
  vars.push(v('weight', 'Designgewicht', '', null, null, rows.map(r => r.weight)))
  vars.push(v('stratum', 'Schicht / Klumpen', '', null, null, rows.map(r => r.stratum)))
  if (present.has('disposition')) {
    const dispoData = rows.map(r => r.disposition ? (DISPO_CODE[r.disposition] || null) : 1)
    // Nur die im Datensatz vorkommenden Ausgänge labeln (kein „panel-ausfall" im Querschnitt).
    const dispoLabels = DISPO_LABELS.filter(d => dispoData.includes(d.code))
    vars.push(v('disposition', 'Ausgang der Feldarbeit', 'haven_labelled', dispoLabels, null, dispoData))
  }

  // Blätter zusammensetzen
  const dataHeader = vars.map(x => x.name)
  const dataRows = rows.map((_, i) => vars.map(x => x.data[i]))
  const labelsRows = []
  for (const variable of vars) for (const lr of labelRowsFor(variable)) labelsRows.push(lr)

  return {
    data: { header: dataHeader, rows: dataRows }
    , labels: { header: LABELS_HEADER, rows: labelsRows }
  }
}

/** Faktor-Variable (Column_Type factor): Value == Value_Label, Levels aus Katalog ∪ Beobachtung. */
function factorVariable(name, label, data, extraLevels) {
  const levels = []
  const seen = new Set()
  for (const lv of (extraLevels || []).concat(data)) {
    if (lv == null || lv === '' || seen.has(lv)) continue
    seen.add(lv); levels.push(lv)
  }
  return v(name, label, 'factor', levels.map(p => ({ code: p, label: p })), null, data)
}

/** Wertgelabelt-numerische Variable über einen Index-Katalog (Code = Index). */
function codedVariable(name, label, catalog, data) {
  const valueLabels = catalog.map((lab, i) => ({ code: i, label: lab }))
  return v(name, label, 'haven_labelled', valueLabels, null, data.map(x => {
    const i = catalog.indexOf(x)
    return i >= 0 ? i : (typeof x === 'number' ? x : null)
  }))
}

/** Baut eine einzelne Soziodemografie-Variable (wertgelabelt numerisch / Faktor / Klartext). */
function demographicVariable(key, rows, cat) {
  if (key === 'district') {
    const data = rows.map(r => r.district)
    return cat.districtNames.length
      ? codedVariable('district', 'Distrikt', cat.districtNames, data)
      : factorVariable('district', 'Distrikt', data)
  }
  if (key === 'education') {
    const data = rows.map(r => r.education)
    return cat.educationLabels.length
      ? codedVariable('education', 'Bildung', cat.educationLabels, data)
      : factorVariable('education', 'Bildung', data)
  }
  if (key === 'party') {
    return factorVariable('party', 'Partei', rows.map(r => r.party), cat.partyNames.concat('Keine'))
  }
  // name (String) · age · income (echte Zahlen) — nur Variable-Label, keine Codes
  const d = DEMOGRAPHICS_BY_KEY[key]
  return v(key, d ? d.label : key, '', null, null, rows.map(r => r[key]))
}

// ============================================================================
// OOXML-Writer (minimal, inline strings) + STORED-Zip (dependency-frei)
// ============================================================================

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 0 → A, 25 → Z, 26 → AA … (Excel-Spaltenbuchstabe). */
function colLetter(i) {
  let s = ''
  i += 1
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) }
  return s
}

function cellXml(colIdx, rowNum, value) {
  if (value === null || value === undefined || value === '') return ''
  const ref = colLetter(colIdx) + rowNum
  if (typeof value === 'number') {
    if (!isFinite(value)) return ''
    return '<c r="' + ref + '"><v>' + value + '</v></c>'
  }
  return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(value) + '</t></is></c>'
}

/** Ein Arbeitsblatt-XML aus Kopfzeile + Datenzeilen. */
function sheetXml(header, rows) {
  const all = [header].concat(rows)
  let body = ''
  for (let ri = 0; ri < all.length; ri++) {
    const r = ri + 1
    let cells = ''
    const row = all[ri]
    for (let ci = 0; ci < row.length; ci++) cells += cellXml(ci, r, row[ci])
    body += '<row r="' + r + '">' + cells + '</row>'
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetData>' + body + '</sheetData></worksheet>'
}

const XML = {
  contentTypes:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>'
  , rootRels:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>'
  , workbook:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Labels" sheetId="2" r:id="rId2"/></sheets>'
    + '</workbook>'
  , workbookRels:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
    + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    + '</Relationships>'
  , styles:
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<fonts count="1"><font/></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
    + '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
    + '<cellXfs count="1"><xf/></cellXfs></styleSheet>'
}

// CRC32 (Standardtabelle, lazy).
let CRC_TABLE = null
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      CRC_TABLE[n] = c >>> 0
    }
  }
  let c = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function concatBytes(parts) {
  let total = 0
  for (const p of parts) total += p.length
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

/** Packt benannte Byte-Dateien in ein UNkomprimiertes (STORED) Zip. */
function zipStored(files) {
  const enc = new TextEncoder()
  const entries = files.map(f => {
    const nameBytes = enc.encode(f.name)
    return { nameBytes, data: f.data, crc: crc32(f.data), offset: 0 }
  })
  const parts = []
  let offset = 0
  for (const e of entries) {
    const h = new Uint8Array(30 + e.nameBytes.length)
    const dv = new DataView(h.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true)        // version needed
    dv.setUint16(6, 0, true)         // flags
    dv.setUint16(8, 0, true)         // compression = STORED
    dv.setUint16(10, 0, true)        // mod time
    dv.setUint16(12, 0x21, true)     // mod date = 1980-01-01
    dv.setUint32(14, e.crc, true)
    dv.setUint32(18, e.data.length, true)
    dv.setUint32(22, e.data.length, true)
    dv.setUint16(26, e.nameBytes.length, true)
    dv.setUint16(28, 0, true)        // extra len
    h.set(e.nameBytes, 30)
    e.offset = offset
    parts.push(h, e.data)
    offset += h.length + e.data.length
  }
  const centralStart = offset
  let centralSize = 0
  for (const e of entries) {
    const c = new Uint8Array(46 + e.nameBytes.length)
    const dv = new DataView(c.buffer)
    dv.setUint32(0, 0x02014b50, true)
    dv.setUint16(4, 20, true)        // version made by
    dv.setUint16(6, 20, true)        // version needed
    dv.setUint16(8, 0, true)
    dv.setUint16(10, 0, true)        // compression = STORED
    dv.setUint16(12, 0, true)
    dv.setUint16(14, 0x21, true)
    dv.setUint32(16, e.crc, true)
    dv.setUint32(20, e.data.length, true)
    dv.setUint32(24, e.data.length, true)
    dv.setUint16(28, e.nameBytes.length, true)
    dv.setUint16(30, 0, true)        // extra
    dv.setUint16(32, 0, true)        // comment
    dv.setUint16(34, 0, true)        // disk #
    dv.setUint16(36, 0, true)        // internal attrs
    dv.setUint32(38, 0, true)        // external attrs
    dv.setUint32(42, e.offset, true)
    c.set(e.nameBytes, 46)
    parts.push(c)
    centralSize += c.length
    offset += c.length
  }
  const eocd = new Uint8Array(22)
  const dv = new DataView(eocd.buffer)
  dv.setUint32(0, 0x06054b50, true)
  dv.setUint16(8, entries.length, true)
  dv.setUint16(10, entries.length, true)
  dv.setUint32(12, centralSize, true)
  dv.setUint32(16, centralStart, true)
  parts.push(eocd)
  return concatBytes(parts)
}

/**
 * Serialisiert die zwei Blätter zu einer `.xlsx` (Uint8Array).
 * @param {{ data, labels }} sheets aus buildWorkbook()
 */
export function toXlsx(sheets) {
  const enc = new TextEncoder()
  const file = (name, text) => ({ name, data: enc.encode(text) })
  return zipStored([
    file('[Content_Types].xml', XML.contentTypes)
    , file('_rels/.rels', XML.rootRels)
    , file('xl/workbook.xml', XML.workbook)
    , file('xl/_rels/workbook.xml.rels', XML.workbookRels)
    , file('xl/styles.xml', XML.styles)
    , file('xl/worksheets/sheet1.xml', sheetXml(sheets.data.header, sheets.data.rows))
    , file('xl/worksheets/sheet2.xml', sheetXml(sheets.labels.header, sheets.labels.rows))
  ])
}

/** Bequemlichkeit: Befragungs-Zeilen → fertige `.xlsx` (Uint8Array). */
export function surveyToXlsx(rows, items, design, opts) {
  return toXlsx(buildWorkbook(rows, items, design, opts))
}
