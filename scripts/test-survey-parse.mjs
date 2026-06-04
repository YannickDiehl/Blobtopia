/**
 * Functional test for free-text item parsing (scale + wording + construct).
 * Run:  node scripts/test-survey-parse.mjs
 */
import { parseScale, detectWording, parseItem } from '../src/lib/survey-parse.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

console.log('parseScale:')
{
  const a = parseScale('Wie zufrieden sind Sie? Skala von 1 bis 10, 1 = gar nicht, 10 = völlig.')
  ok(a.min === 1 && a.max === 10, 'reads "1 bis 10"')
  ok(a.minLabel === 'gar nicht' && a.maxLabel === 'völlig', 'reads endpoint labels (' + a.minLabel + ' / ' + a.maxLabel + ')')

  const b = parseScale('Bewerten Sie von 0-10.')
  ok(b.min === 0 && b.max === 10, 'reads "0-10" dash range')

  const c = parseScale('Würden Sie wählen gehen? Bitte mit Ja oder Nein antworten.')
  ok(c.format === 'binary' && c.min === 0 && c.max === 1, 'detects Ja/Nein → binary')

  const d = parseScale('Politiker sind korrupt. Stimmen Sie zu oder nicht zu?')
  ok(d.format === 'likert' && d.min === 1 && d.max === 5, 'agreement wording → Likert 1–5')

  const e = parseScale('Erzählen Sie von Ihrem Tag.')
  ok(e.min === 1 && e.max === 10, 'fallback → 1–10')
}

console.log('detectWording:')
{
  ok(detectWording('Stimmen Sie zu?').agreeScale === true, 'agreement scale flagged')
  ok(detectWording('Ist es wichtig, die Umwelt zu schützen?').loadedPositive === true, 'positive loading flagged')
  ok(detectWording('Sind Politiker korrupt und gefährlich?').loadedNegative === true, 'negative loading flagged')
  ok(detectWording('Geben Sie ehrlich zu: gehen Sie wählen?').socialDesirability === true, 'social-desirability cue flagged')
  ok(detectWording('Wie groß ist Ihre Stadt?').loadedPositive === false, 'neutral text → no loading')
}

console.log('parseItem (one-call):')
{
  const p = parseItem('Wie sehr vertrauen Sie den Politikern? Skala 1 bis 10.')
  ok(p.scale.max === 10, 'scale parsed')
  ok(p.construct === 'institutional_trust' || p.construct === 'anti_elitism', 'construct inferred (' + p.construct + ')')
  ok(typeof p.wording === 'object', 'wording object present')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
