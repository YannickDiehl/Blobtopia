/**
 * Coverage tripwire für die Konstrukt-Erkennung (suggestConstruct):
 * JEDES Konstrukt der Registry muss über mindestens eine realistische
 * deutsche Item-Formulierung erreichbar sein — sonst laufen Studierende in
 * „nicht beantwortbar", ohne dass die Heuristik je greifen könnte.
 * Run:  node scripts/test-survey-constructs.mjs
 */
import { CONSTRUCTS, suggestConstruct } from '../src/lib/survey-constructs.js'
import { parseItem } from '../src/lib/survey-parse.js'

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

// Eine klassische Formulierung pro Konstrukt (Reihenfolge-sensitiv getestet:
// die Phrase muss IHR Konstrukt treffen, nicht ein früheres Muster).
const PHRASES = {
  political_satisfaction: 'Wie zufrieden sind Sie mit der Politik?'
  , ideology: 'Wo ordnen Sie sich zwischen links und rechts ein?'
  , institutional_trust: 'Wie groß ist Ihr Vertrauen in die Regierung?'
  , policy_economy: 'Soll der Staat stärker in die Wirtschaft eingreifen?'
  , policy_environment: 'Wie bewerten Sie die Klimapolitik der Regierung? Skala 1 bis 10.'
  , policy_security: 'Brauchen wir mehr Polizei und Überwachung?'
  , policy_social: 'Sind Sie für mehr Umverteilung zwischen Arm und Reich?'
  , policy_migration: 'Sollte Zuwanderung stärker begrenzt werden?'
  , policy_democracy: 'Brauchen wir mehr direkte Demokratie?'
  , self_efficacy: 'Ich kann politische Entscheidungen beeinflussen.'
  , political_knowledge: 'Wie gut verstehen Sie politische Zusammenhänge?'
  , vote_importance: 'Meine Stimme zählt bei Wahlen.'
  , external_efficacy: 'Die Regierung kümmert sich um die Meinung normaler Leute.'
  , obedience_value: 'Gehorsam und Respekt vor Autorität sind wichtige Tugenden.'
  , strong_leader_preference: 'Ein starker Führer wäre besser als endlose Diskussionen.'
  , rule_conformity: 'Regeln müssen strikt befolgt werden.'
  , powerlessness: 'Die da oben machen ja doch, was sie wollen.'
  , political_complexity: 'Politik ist zu kompliziert für normale Leute.'
  , party_indifference: 'Die Parteien sind doch alle gleich.'
  , economic_security_priority: 'Ein sicherer Arbeitsplatz ist mir am wichtigsten.'
  , environment_over_economy: 'Umweltschutz ist wichtiger als Wirtschaftswachstum.'
  , freedom_over_order: 'Freiheit ist wichtiger als Ordnung.'
  , anti_elitism: 'Die Politiker haben den Kontakt zum Volk verloren.'
  , people_centrism: 'Das Volk sollte wichtige Fragen direkt entscheiden.'
  , manichean_outlook: 'Politik ist letztlich ein Kampf zwischen Gut und Böse.'
  , neighbor_trust: 'Wie sehr vertrauen Sie Ihren Nachbarn?'
  , generalized_trust: 'Den meisten Menschen kann man vertrauen.'
  , media_trust: 'Vertrauen Sie der Berichterstattung der Medien?'
  , community_participation: 'Engagieren Sie sich ehrenamtlich in Ihrer Gemeinde?'
  , protest_readiness: 'Würden Sie an einer Demonstration teilnehmen?'
  , age: 'Wie alt sind Sie?'
  , income: 'Wie hoch ist Ihr monatliches Nettoeinkommen?'
}

console.log('jedes Registry-Konstrukt ist über eine Formulierung erreichbar:')
for (const c of CONSTRUCTS) {
  const phrase = PHRASES[c.key]
  if (!phrase) { ok(false, c.key + ': keine Test-Phrase definiert'); continue }
  const hit = suggestConstruct(phrase)
  ok(hit === c.key, c.key + (hit === c.key ? '' : ' — erkannt als: ' + hit))
}

console.log('Nichttreffer bleiben ehrlich null (kein Falsch-Mapping):')
{
  ok(suggestConstruct('Was ist Ihr Lieblingsessen? Skala von 1 bis 10.') === null, 'Lieblingsessen → null')
  ok(suggestConstruct('') === null, 'leerer Text → null')
  ok(parseItem('Was ist Ihr Lieblingsessen? Skala von 1 bis 10.').construct === null, 'parseItem reicht null durch')
}

console.log('Generika fangen typische Kurzformen ab:')
{
  ok(suggestConstruct('Kann man Menschen generell vertrauen?') === 'generalized_trust', '„vertrauen" allein → allgemeines Vertrauen')
  ok(suggestConstruct('Gehen Sie wählen?') === 'vote_importance', '„wählen" → Wichtigkeit der Stimme')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
