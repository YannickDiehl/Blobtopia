/**
 * Functional test for the opt-in Hintergrundmerkmale
 * (src/lib/survey-demographics.js): nothing is collected automatically —
 * only explicitly selected keys become dataset columns.
 * Run:  node scripts/test-survey-demographics.mjs
 */
import { DEMOGRAPHICS, DEMOGRAPHICS_BY_KEY, buildDemographics } from '../src/lib/survey-demographics.js'
import { runSyntheticSurvey } from '../src/lib/survey-synthetic.js'
import { toCSV, datasetColumns } from '../src/lib/survey-dataset.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

const blob = {
  id: 'b1', name: 'Blubsi', district: 2, district_name: 'Hafenviertel'
  , age: 34, education_level: 3, education_label: 'Akademisch'
  , party_name: 'Mitte', income: 2450.7
  , attitudes: { political_satisfaction: 6 }, latent_traits: {}, political_state: {}
}
const item = { id: 'q1', text: 'x', scale: { min: 1, max: 10, format: 'numeric' }, construct: 'political_satisfaction', wording: {} }
const units = [{ blob: blob, stratum: null, weight: 1 }]

console.log('catalog:')
ok(DEMOGRAPHICS.length === 6, 'six selectable Hintergrundmerkmale (' + DEMOGRAPHICS.map(d => d.key).join(', ') + ')')
ok(DEMOGRAPHICS_BY_KEY.name && DEMOGRAPHICS_BY_KEY.income, 'lookup map works')

console.log('buildDemographics (opt-in, nothing automatic):')
{
  ok(Object.keys(buildDemographics([])(blob)).length === 0, 'empty selection → no columns')
  ok(Object.keys(buildDemographics(null)(blob)).length === 0, 'null selection → no columns')
  const d = buildDemographics(['name', 'district', 'income', 'unbekannt'])(blob)
  ok(d.name === 'Blubsi', 'name is collected')
  ok(d.district === 'Hafenviertel', 'district uses the readable label')
  ok(d.income === 2451, 'income is rounded')
  ok(!('unbekannt' in d) && !('age' in d), 'unknown keys ignored, unselected keys absent')
  const fallback = buildDemographics(['district', 'education'])({ id: 'x', district: 1, education_level: 2 })
  ok(fallback.district === 1 && fallback.education === 2, 'raw codes as fallback without adapter labels')
}

console.log('flows into dataset + CSV:')
{
  const { rows } = runSyntheticSurvey(units, [item], { seed: 7, demographics: buildDemographics(['name', 'age']) })
  ok(rows[0].name === 'Blubsi' && rows[0].age === 34, 'selected demographics land on the rows')
  ok(JSON.stringify(datasetColumns(rows)) === JSON.stringify(['name', 'age']), 'datasetColumns reflects exactly the selection')
  const csv = toCSV(rows, [item])
  const header = csv.split('\r\n')[0]
  ok(header.indexOf('name') >= 0 && header.indexOf('age') >= 0, 'CSV header carries the selection')
  ok(header.indexOf('party') < 0 && header.indexOf('district') < 0, 'unselected demographics stay out of the CSV')

  const bare = runSyntheticSurvey(units, [item], { seed: 7, demographics: buildDemographics([]) })
  ok(datasetColumns(bare.rows).length === 0, 'no selection → dataset has only id/stratum/weight + items')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
