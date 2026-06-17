/**
 * Erzeugt eine echte Beispiel-Befragung als .xlsx im mariposa-Format — für den
 * read_xlsx()-Abnahmetest in R. Spiegelt den synthetischen Feldlauf des Stores
 * (Ziehung → Feldarbeit → Antworten → Wahrheit) auf der realen Population.
 *
 * Run:  /opt/homebrew/bin/node scripts/experiments/make-sample-xlsx.mjs
 * Ergebnis: blobtopia-beispiel.xlsx (Studierende) + blobtopia-beispiel-dozent.xlsx (mit *_wahr).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { expandTickSnapshot } from '../../src/lib/timeline-decode.js'
import { drawSample } from '../../src/lib/survey-sampling.js'
import { simulateParticipation, questionnaireBurden, DISPOSITION } from '../../src/lib/survey-fieldwork.js'
import { runSyntheticSurvey } from '../../src/lib/survey-synthetic.js'
import { snapshotTruth } from '../../src/lib/survey-truth.js'
import { buildDemographics } from '../../src/lib/survey-demographics.js'
import { surveyToXlsx } from '../../src/lib/survey-xlsx.js'

const TICK = 4015
const dataUrl = p => new URL('../../public/data/timeline/' + p, import.meta.url)
if (!existsSync(dataUrl('blobs-static.json'))) { console.error('Timeline-Daten fehlen.'); process.exit(1) }

const statics = JSON.parse(readFileSync(dataUrl('blobs-static.json'), 'utf8'))
const staticMap = Object.fromEntries(statics.map(g => [g.id, g]))
const blobIndex = JSON.parse(readFileSync(dataUrl('blob-index.json'), 'utf8'))
const block = JSON.parse(readFileSync(dataUrl('ticks/4000-4099.json'), 'utf8'))
const traits = {}
let gen = null
for (let t = 4000; t <= TICK; t++) if (block[String(t)]) gen = expandTickSnapshot(block[String(t)], { blobIndex, staticMap, lastKnownTraits: traits })
const blobs = gen.blobs

// Kataloge (in Node ohne blob-adapter/JSON-Import nachgebaut: Distrikte aus der
// Datendatei, Bildung/Partei sind feste Listen wie in blob-adapter.js).
const districts = JSON.parse(readFileSync(new URL('../../data/districts.json', import.meta.url), 'utf8'))
const districtNames = (Array.isArray(districts) ? districts : districts.districts || []).map(d => d.name)
const educationLabels = ['Keine', 'Grundbildung', 'Höhere Bildung', 'Akademisch']
const partyNames = ['Fortschritt', 'Mitte', 'Tradition', 'Unabhängige']
const cat = { districtNames, educationLabels, partyNames }

const items = [
  { id: 'q1', text: 'Wie zufrieden sind Sie insgesamt mit der Politik?', construct: 'political_satisfaction'
    , scale: { min: 1, max: 10, minLabel: 'gar nicht zufrieden', maxLabel: 'völlig zufrieden', format: 'numeric', difficulty: 5 }, wording: {}, validity: { lambda: 1 } }
  , { id: 'q2', text: 'Wie alt sind Sie?', construct: 'age'
    , scale: { min: null, max: null, minLabel: '', maxLabel: '', format: 'open' }, wording: {}, validity: { lambda: 1 } }
  , { id: 'q3', text: 'Stimmen Sie zu: „Den staatlichen Institutionen kann man vertrauen."', construct: 'institutional_trust'
    , scale: { min: 1, max: 5, minLabel: 'stimme gar nicht zu', maxLabel: 'stimme voll zu', format: 'likert', difficulty: 5 }, wording: { agreeScale: true }, validity: { lambda: 1 } }
]
const design = {
  technique: 'srs', n: 60, seed: 12345, demographics: ['name', 'district', 'age'], eligibility: { excludeMinors: true }
  , fieldMode: 'personal', contactAttempts: 2
}

const sample = drawSample(blobs, design)
const burden = questionnaireBurden(items)
const part = simulateParticipation(sample.units, { mode: design.fieldMode, attempts: design.contactAttempts, seed: design.seed, burden })
const respondents = part.filter(p => p.disposition === DISPOSITION.RESPONDENT)
const demographics = buildDemographics(design.demographics)
const net = runSyntheticSurvey(respondents, items, { seed: design.seed, demographics })
const netById = {}
for (const r of net.rows) netById[r.blobId] = r
const rows = part.map(p => {
  const r = netById[p.blob.id]
  return r
    ? Object.assign({}, r, { disposition: p.disposition })
    : Object.assign({ blobId: p.blob.id, stratum: p.stratum, weight: p.weight }, demographics(p.blob), { disposition: p.disposition, answers: {} })
})
const truth = snapshotTruth({ blobs, design, units: sample.units, items })

writeFileSync('blobtopia-beispiel.xlsx', Buffer.from(surveyToXlsx(rows, items, design, cat)))
writeFileSync('blobtopia-beispiel-dozent.xlsx', Buffer.from(surveyToXlsx(rows, items, design, Object.assign({ truth }, cat))))
const net1 = rows.filter(r => r.disposition === DISPOSITION.RESPONDENT).length
console.log('Geschrieben: blobtopia-beispiel.xlsx + -dozent.xlsx')
console.log('  n(brutto) = ' + rows.length + ', n(netto) = ' + net1 + ', Items: q1 (1–10), q2 (Alter, offen), q3 (Likert 1–5)')
console.log('  Demografie: name, district (wertgelabelt), age · plus weight/stratum/disposition')
