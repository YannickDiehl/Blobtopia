/**
 * Functional smoke test for src/lib/survey.js (no test framework needed).
 * Run:  node scripts/test-survey-lib.mjs
 * Exits non-zero if any assertion fails.
 */
import {
  ITEM_TYPES, ANSWER_STATUS, makeScaleItem, makeLikertItem
  , formatQuestion, parseAnswer, isErrorReply
} from '../src/lib/survey.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}
function eq(actual, expected, label) {
  ok(actual === expected, label + '  (got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected) + ')')
}

console.log('formatQuestion:')
const scale = makeScaleItem('Wie zufrieden sind Sie mit der Politik?', { min: 1, max: 10, minLabel: 'gar nicht', maxLabel: 'voll und ganz' })
ok(formatQuestion(scale).includes('Skala von 1 bis 10'), 'scale prompt names the range')
ok(formatQuestion(scale).includes('nur die Zahl'), 'scale prompt asks for a bare number')
ok(formatQuestion({ type: ITEM_TYPES.BINARY, text: 'Waehlen Sie?' }).includes('Ja'), 'binary prompt offers Ja/Nein')
ok(formatQuestion({ type: ITEM_TYPES.CHOICE, text: 'Welche Partei?', choices: ['Fortschritt', 'Mitte'] }).includes('1) Fortschritt'), 'choice prompt enumerates options')

console.log('parseAnswer — scale 1..10:')
eq(parseAnswer('Ich wuerde sagen so eine 7.', scale).value, 7, 'reads "7"')
eq(parseAnswer('Eine glatte zehn!', scale).value, 10, 'reads word "zehn"')
eq(parseAnswer('Hmm, schwer zu sagen.', scale).status, ANSWER_STATUS.DONTKNOW, 'detects dont-know')
eq(parseAnswer('Das moechte ich nicht sagen.', scale).status, ANSWER_STATUS.REFUSED, 'detects refusal')
eq(parseAnswer('API-Fehler 529: overloaded', scale).status, ANSWER_STATUS.ERROR, 'detects api error payload')
eq(parseAnswer('Kein Kommentar dazu.', scale).status, ANSWER_STATUS.UNPARSED, 'no number -> unparsed')

console.log('parseAnswer — likert 1..5:')
const lik = makeLikertItem('Politiker haben den Kontakt zum Volk verloren.')
eq(parseAnswer('Dem stimme ich voll zu, also 5.', lik).value, 5, 'reads "5" on likert')
ok(parseAnswer('Ich gebe Ihnen eine 8', lik).value === null || parseAnswer('Ich gebe Ihnen eine 8', lik).value <= 5, '8 is out of 1..5 range -> not accepted as-is')

console.log('parseAnswer — binary & choice:')
eq(parseAnswer('Ja, natuerlich gehe ich waehlen.', { type: ITEM_TYPES.BINARY }).value, 1, 'binary Ja -> 1')
eq(parseAnswer('Nein, eher nicht.', { type: ITEM_TYPES.BINARY }).value, 0, 'binary Nein -> 0')
eq(parseAnswer('Ich waehle die Mitte.', { type: ITEM_TYPES.CHOICE, choices: ['Fortschritt', 'Mitte', 'Tradition'] }).value, 'Mitte', 'choice substring match')

console.log('isErrorReply:')
ok(isErrorReply('Proxy-Fehler: timeout'), 'flags proxy error')
ok(!isErrorReply('Ich bin zufrieden, eine 7.'), 'does not flag a real answer')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
