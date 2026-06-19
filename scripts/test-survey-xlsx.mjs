/**
 * Test: labelgetreuer .xlsx-Export im mariposa-Format (Data + Labels).
 * Prüft (a) das Spalten-/Label-/Missing-Mapping und (b) dass die erzeugte Datei
 * eine wohlgeformte (STORED) Zip mit den erwarteten OOXML-Teilen + Inhalten ist.
 * Den echten read_xlsx()-Roundtrip beweist R+mariposa (Abnahme durch Yannick).
 * Run:  node scripts/test-survey-xlsx.mjs
 */
import { buildWorkbook, toXlsx, surveyToXlsx } from '../src/lib/survey-xlsx.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

const CAT = {
  districtNames: ['Zentrum', 'Nordviertel', 'Hafen', 'Anhöhe', 'Aue']
  , educationLabels: ['Keine', 'Grundbildung', 'Höhere Bildung', 'Akademisch']
  , partyNames: ['Fortschritt', 'Mitte', 'Tradition', 'Unabhängige']
}

const items = [
  // 5-Punkt-Likert, voll beschriftet → stem (reine Frage) + alle 5 Kategorie-Labels
  { id: 'q1', text: 'Wie zufrieden sind Sie mit der Politik? 1 = sehr unzufrieden … 5 = sehr zufrieden'
    , stem: 'Wie zufrieden sind Sie mit der Politik?', construct: 'political_satisfaction'
    , scale: { min: 1, max: 5, minLabel: 'sehr unzufrieden', maxLabel: 'sehr zufrieden', format: 'likert'
      , valueLabels: [{ value: 1, label: 'sehr unzufrieden' }, { value: 2, label: 'eher unzufrieden' }, { value: 3, label: 'teils/teils' }, { value: 4, label: 'eher zufrieden' }, { value: 5, label: 'sehr zufrieden' }] } }
  , { id: 'q2', text: 'Wie hoch ist Ihr Einkommen?', stem: 'Wie hoch ist Ihr Einkommen?', construct: 'income'
    , scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'open' } }
]
const rows = [
  { blobId: 'a', name: 'Bina', district: 'Hafen', weight: 11.3, stratum: null, disposition: 'teilgenommen'
    , answers: { q1: { status: 'answered', value: 4 }, q2: { status: 'answered', value: 2400 } } }
  , { blobId: 'b', name: 'Cor', district: 'Zentrum', weight: 11.3, stratum: null, disposition: 'teilgenommen'
    , answers: { q1: { status: 'dontknow', value: null }, q2: { status: 'refused', value: null } } }
  , { blobId: 'c', name: 'Dex', district: 'Aue', weight: 11.3, stratum: null, disposition: 'nicht erreicht', answers: {} }
]

console.log('Data-Blatt: Spaltenreihenfolge + Codes:')
const wb = buildWorkbook(rows, items, { demographics: ['name', 'district'] }, CAT)
ok(eq(wb.data.header, ['id', 'name', 'district', 'q1', 'q2', 'weight', 'stratum', 'disposition'])
  , 'Reihenfolge id · name · Soziodemo · q1..qn · weight · stratum · disposition')
ok(eq(wb.data.rows[0], [1, 'Bina', 2, 4, 2400, 11.3, null, 1]), 'Teilnehmerin: Codes inkl. Distrikt-Code 2 (Hafen)')
ok(eq(wb.data.rows[1], [2, 'Cor', 0, -8, -9, 11.3, null, 1]), 'weiß nicht → -8, verweigert → -9, Zentrum → 0')
ok(eq(wb.data.rows[2], [3, 'Dex', 4, -13, -13, 11.3, null, 3]), 'nicht erreicht (Unit-Nonresponse): Items = -13 (Nicht teilgenommen), Disposition-Code 3')

console.log('Labels-Blatt: Stamm + alle Kategorien + nur vorkommende Missings:')
const L = wb.labels.rows
const find = (v, val, type) => L.find(r => r[0] === v && r[2] === String(val) && r[4] === type)
ok(wb.labels.header.join(',') === 'Variable,Variable_Label,Value,Value_Label,Type,Column_Type', 'genau die 6 mariposa-Spalten')
ok(L.filter(r => r[0] === 'q1' && r[4] === 'valid').length === 5, 'q1: alle 5 Kategorien als eigene valid-Zeilen')
ok(find('q1', 1, 'valid')[3] === 'sehr unzufrieden' && find('q1', 3, 'valid')[3] === 'teils/teils' && find('q1', 5, 'valid')[3] === 'sehr zufrieden', 'q1: Kategorie-Labels 1/3/5 korrekt')
ok(find('q1', 1, 'valid')[1] === 'Wie zufrieden sind Sie mit der Politik?', 'q1: Variable_Label = reiner Fragestamm (ohne Skala)')
ok(find('q1', -8, 'missing') && find('q1', -8, 'missing')[3] === 'Weiß nicht', 'q1: -8 = „Weiß nicht" (Default, kommt vor → deklariert)')
ok(!find('q1', -9, 'missing') && !find('q1', -7, 'missing'), 'q1: -9/-7 NICHT deklariert (kommen nicht vor — kein Phantom)')
ok(find('q1', -13, 'missing') && find('q1', -13, 'missing')[3] === 'Nicht teilgenommen', 'q1: -13 = „Nicht teilgenommen" (Unit-Nonresponse, kommt durch Dex vor)')
ok(L.filter(r => r[0] === 'q1').every(r => r[5] === 'haven_labelled'), 'q1 durchgehend Column_Type haven_labelled')
ok(!L.some(r => r[0] === 'q2' && r[4] === 'valid') && find('q2', -9, 'missing') && !find('q2', -8, 'missing'), 'q2 (offen): keine Value-Labels, nur das vorkommende -9')
ok(find('q2', -9, 'missing')[3] === 'Verweigert', 'q2: Default -9 = „Verweigert" (kohärenter Fallback, deckt sich mit der Unit-Disposition)')
ok(find('district', 2, 'valid') && find('district', 2, 'valid')[3] === 'Hafen' && find('district', 2, 'valid')[5] === 'haven_labelled'
  , 'Distrikt: wertgelabelt numerisch (2 = Hafen), volle Kategorienliste')
ok(L.filter(r => r[0] === 'district' && r[4] === 'valid').length === 5, 'Distrikt: alle 5 Kategorien (nicht datengetrieben gekürzt)')
ok(find('disposition', 1, 'valid')[3] === 'teilgenommen' && find('disposition', 3, 'valid')[3] === 'nicht erreicht', 'Disposition: 1=teilgenommen, 3=nicht erreicht (kommen vor)')
ok(!find('disposition', 2, 'valid') && !find('disposition', 4, 'valid') && !find('disposition', 5, 'valid'), 'Disposition: 2/4/5 NICHT deklariert (kein Panel-Ballast im Querschnitt)')

console.log('Unit-Nonresponse: Studierenden-Code/Label (design.nonresponse) übersteuert -13:')
const wbN = buildWorkbook(rows, items, { demographics: ['name', 'district'], nonresponse: { code: 99, label: 'keine Teilnahme' } }, CAT)
const qN = wbN.data.header.indexOf('q1')
ok(wbN.data.rows[2][qN] === 99, 'Nichtteilnehmer-Item trägt den eigenen Code 99 (nicht -13)')
const LN = wbN.labels.rows
const findN = (v, val, type) => LN.find(r => r[0] === v && r[2] === String(val) && r[4] === type)
ok(findN('q1', 99, 'missing') && findN('q1', 99, 'missing')[3] === 'keine Teilnahme', 'Labels: 99 = „keine Teilnahme" (eigenes Label)')
ok(!findN('q1', -13, 'missing'), 'Default -13 NICHT mehr deklariert, wenn ein eigener Code gesetzt ist')
// Robustheit: ungültiger Code / leeres Label fallen auf den Default zurück.
const wbF = buildWorkbook(rows, items, { demographics: ['name'], nonresponse: { code: 1.5, label: '  ' } }, CAT)
ok(wbF.data.rows[2][wbF.data.header.indexOf('q1')] === -13, 'nicht-ganzzahliger Code → Fallback -13')
ok(wbF.labels.rows.find(r => r[0] === 'q1' && r[2] === '-13' && r[4] === 'missing')[3] === 'Nicht teilgenommen', 'leeres Label → Fallback „Nicht teilgenommen"')
const nameRows = L.filter(r => r[0] === 'name')
ok(nameRows.length === 1 && nameRows[0][1] === 'Name' && nameRows[0][4] === '' && nameRows[0][5] === ''
  , 'name: reine Variable-Label-Zeile (kein Code, Column_Type leer)')

console.log('Faktor (Partei) statt numerisch:')
const wbP = buildWorkbook(
  [{ blobId: 'a', party: 'Mitte', weight: 1, answers: {} }], [], {}, CAT)
const pv = wbP.labels.rows.filter(r => r[0] === 'party')
ok(pv.length && pv.every(r => r[5] === 'factor' && r[2] === r[3]), 'Partei: Column_Type factor, Value == Value_Label')
ok(pv.some(r => r[3] === 'Mitte') && pv.some(r => r[3] === 'Keine'), 'Partei-Levels inkl. „Keine"')

console.log('Dozentenversion (truth → <id>_wahr-Spalten):')
const wbT = buildWorkbook(rows, items, {}, Object.assign({ truth: { perUnit: { a: { q1: 6.7, q2: 2510 } } } }, CAT))
ok(wbT.data.header.includes('q1_wahr') && wbT.data.header.includes('q2_wahr'), '<id>_wahr-Spalten ergänzt')
ok(wbT.data.rows[0][wbT.data.header.indexOf('q1_wahr')] === 6.7, 'wahrer Wert eingetragen (6.7)')

console.log('Item-Kürzel (it.name) → Spaltenname:')
const kItems = [
  { id: 'q1', name: 'Atommüll', text: 'Atommüll frei entsorgen?', stem: 'Sollte Atommüll frei entsorgt werden dürfen?'
    , construct: 'policy_environment', scale: { min: 1, max: 5, format: 'likert' } }
  , { id: 'q2', name: 'Atommüll Entsorgung?', stem: 'Zweite Frage', construct: 'policy_environment', scale: { min: 1, max: 5, format: 'likert' } }
  , { id: 'q3', name: '', stem: 'Dritte ohne Kürzel', construct: 'institutional_trust', scale: { min: 1, max: 5, format: 'likert' } }
]
const kRows = [{ blobId: 'a', weight: 1, stratum: null, disposition: 'teilgenommen'
  , answers: { q1: { status: 'answered', value: 5 }, q2: { status: 'answered', value: 3 }, q3: { status: 'answered', value: 4 } } }]
const wbK = buildWorkbook(kRows, kItems, {}, CAT)
ok(wbK.data.header.includes('Atommüll') && !wbK.data.header.includes('q1'), 'Kürzel „Atommüll" ersetzt q1 als Spaltenname')
ok(wbK.data.rows[0][wbK.data.header.indexOf('Atommüll')] === 5, 'Daten landen unter dem Kürzel (Datenschlüssel bleibt it.id)')
ok(wbK.data.header.includes('Atommüll_Entsorgung'), 'Leerzeichen/Satzzeichen → _ (R-tauglich), Umlaut bleibt erhalten')
ok(wbK.data.header.includes('q3'), 'ohne Kürzel → Fallback q{n}')
ok(wbK.labels.rows.some(r => r[0] === 'Atommüll' && r[1] === 'Sollte Atommüll frei entsorgt werden dürfen?')
  , 'Labels-Blatt: Variable = Kürzel, Variable_Label = Fragestamm')
const wbDup = buildWorkbook(kRows, [
  { id: 'q1', name: 'Atommüll', construct: 'policy_environment', scale: { min: 1, max: 5, format: 'likert' } }
  , { id: 'q2', name: 'Atommüll', construct: 'policy_environment', scale: { min: 1, max: 5, format: 'likert' } }
], {}, CAT)
ok(wbDup.data.header.includes('Atommüll') && wbDup.data.header.includes('Atommüll_2'), 'doppeltes Kürzel → Atommüll, Atommüll_2 (eindeutig)')
const wbKT = buildWorkbook(kRows, kItems, {}, Object.assign({ truth: { perUnit: { a: { q1: 4.8 } } } }, CAT))
ok(wbKT.data.header.includes('Atommüll_wahr'), 'Dozentenversion: <Kürzel>_wahr-Spalte')

console.log('Studierenden-definierte fehlende Werte → eigene Codes + Type=missing:')
const mItems = [
  { id: 'q1', stem: 'Wie zufrieden?', construct: 'political_satisfaction'
    , scale: { min: 1, max: 5, minLabel: 'sehr zufrieden', maxLabel: 'sehr unzufrieden', format: 'likert'
      , valueLabels: [{ value: 1, label: 'sehr zufrieden' }, { value: 5, label: 'sehr unzufrieden' }]
      , missingLabels: [
        { value: 8, label: 'weiß nicht', kind: 'dontknow' }
        , { value: 9, label: 'keine Angabe', kind: 'refused' }
        , { value: 7, label: 'trifft nicht zu', kind: 'notapplicable' } ] } }
]
const mRows = [
  { blobId: 'a', weight: 1, stratum: null, disposition: 'teilgenommen', answers: { q1: { status: 'answered', value: 4 } } }
  , { blobId: 'b', weight: 1, stratum: null, disposition: 'teilgenommen', answers: { q1: { status: 'dontknow', value: null } } }
  , { blobId: 'c', weight: 1, stratum: null, disposition: 'teilgenommen', answers: { q1: { status: 'refused', value: null } } }
]
const wbM = buildWorkbook(mRows, mItems, {}, CAT)
const qIdx = wbM.data.header.indexOf('q1')
ok(wbM.data.rows[1][qIdx] === 8, 'weiß nicht → Studierenden-Code 8 (nicht Default -8)')
ok(wbM.data.rows[2][qIdx] === 9, 'keine Angabe → Studierenden-Code 9 (nicht Default -9)')
const LM = wbM.labels.rows
const findM = (v, val, type) => LM.find(r => r[0] === v && r[2] === String(val) && r[4] === type)
ok(findM('q1', 8, 'missing')[3] === 'weiß nicht' && findM('q1', 9, 'missing')[3] === 'keine Angabe', 'Labels: 8/9 als Type=missing mit den Wortlauten')
ok(findM('q1', 7, 'missing') && findM('q1', 7, 'missing')[3] === 'trifft nicht zu', 'Labels: deklariertes „trifft nicht zu" (7) auch mit 0 Vorkommen (Codebuch-Definition)')
ok(!findM('q1', -9, 'missing') && !findM('q1', -8, 'missing'), 'Default-Codes -9/-8 NICHT zusätzlich deklariert (Studierenden-Schema überschreibt)')
ok(findM('q1', 1, 'valid') && findM('q1', 5, 'valid') && !findM('q1', 8, 'valid') && !findM('q1', 9, 'valid'), 'gültige Labels rein substanziell (1/5) — Missing-Codes nicht als valid')

console.log('Erzeugte .xlsx ist eine wohlgeformte (STORED) Zip mit den OOXML-Teilen:')
const bytes = surveyToXlsx(rows, items, { demographics: ['name', 'district'] }, CAT)
ok(bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04, 'beginnt mit der Zip-Signatur PK\\x03\\x04')
const files = unzipStored(bytes)
const names = Object.keys(files)
for (const need of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels'
  , 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
  ok(names.includes(need), 'enthält ' + need)
}
const dec = new TextDecoder()
const sheet1 = dec.decode(files['xl/worksheets/sheet1.xml'])
const sheet2 = dec.decode(files['xl/worksheets/sheet2.xml'])
ok(sheet1.includes('<t xml:space="preserve">id</t>') && sheet1.includes('<v>4</v>') && sheet1.includes('<v>-8</v>')
  , 'Data-Blatt: Kopf „id", Zahl 4, Missing-Code -8')
ok(!sheet1.includes('<v>NaN</v>'), 'keine NaN-Zellen')
ok(sheet2.includes('haven_labelled') && sheet2.includes('sehr zufrieden') && sheet2.includes('Verweigert')
  , 'Labels-Blatt: Column_Type + Value-Label + Default-Missing-Label (Verweigert) vorhanden')
ok(dec.decode(files['xl/workbook.xml']).includes('name="Data"') && dec.decode(files['xl/workbook.xml']).includes('name="Labels"')
  , 'workbook.xml deklariert beide Blätter')

// Minimaler STORED-Zip-Leser (nur für den Test): liest die lokalen Header.
function unzipStored(buf) {
  const out = {}
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let p = 0
  const td = new TextDecoder()
  while (p + 4 <= buf.length && dv.getUint32(p, true) === 0x04034b50) {
    const nameLen = dv.getUint16(p + 26, true)
    const extraLen = dv.getUint16(p + 28, true)
    const size = dv.getUint32(p + 22, true)
    const name = td.decode(buf.subarray(p + 30, p + 30 + nameLen))
    const dataStart = p + 30 + nameLen + extraLen
    out[name] = buf.subarray(dataStart, dataStart + size)
    p = dataStart + size
  }
  return out
}

void toXlsx
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
