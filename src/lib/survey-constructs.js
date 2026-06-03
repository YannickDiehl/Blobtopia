/**
 * src/lib/survey-constructs.js
 *
 * Registry of the measurable constructs a blob carries (all on a stored 0–10
 * scale). A survey item can optionally be BOUND to one of these so that:
 *   (a) the synthetic answer engine can draw a noisy answer for free (no LLM),
 *   (b) the ground-truth / measurement-error comparison becomes possible.
 *
 * Each construct exposes get(blob) reading from the adapted blob object
 * (blob.attitudes.* / blob.latent_traits.* / blob.political_state.*), the same
 * shape produced by src/lib/blob-adapter.js.
 */

function att(k) { return b => (b && b.attitudes ? b.attitudes[k] : null) }
function lt(k) { return b => (b && b.latent_traits ? b.latent_traits[k] : null) }
function ps(k) { return b => (b && b.political_state ? b.political_state[k] : null) }

export const CONSTRUCTS = [
  // ── Einstellungen ──
  { key: 'political_satisfaction', group: 'Einstellungen', label: 'Politische Zufriedenheit', get: att('political_satisfaction') }
  , { key: 'ideology', group: 'Einstellungen', label: 'Links–Rechts-Selbsteinordnung', get: att('ideology') }
  , { key: 'institutional_trust', group: 'Einstellungen', label: 'Institutionenvertrauen', get: att('institutional_trust') }
  // ── Policy-Positionen ──
  , { key: 'policy_economy', group: 'Policy', label: 'Wirtschaft (Regulierung ↔ Markt)', get: att('policy_economy') }
  , { key: 'policy_environment', group: 'Policy', label: 'Umwelt vs. Wirtschaft', get: att('policy_environment') }
  , { key: 'policy_security', group: 'Policy', label: 'Sicherheit vs. Freiheit', get: att('policy_security') }
  , { key: 'policy_social', group: 'Policy', label: 'Soziale Gerechtigkeit', get: att('policy_social') }
  , { key: 'policy_migration', group: 'Policy', label: 'Migrationspolitik', get: att('policy_migration') }
  , { key: 'policy_democracy', group: 'Policy', label: 'Demokratieform', get: att('policy_democracy') }
  // ── Latente Traits: Efficacy ──
  , { key: 'self_efficacy', group: 'Wirksamkeit', label: 'Politische Selbstwirksamkeit', get: lt('self_efficacy') }
  , { key: 'political_knowledge', group: 'Wirksamkeit', label: 'Politisches Wissen', get: lt('political_knowledge') }
  , { key: 'vote_importance', group: 'Wirksamkeit', label: 'Wichtigkeit der eigenen Stimme', get: lt('vote_importance') }
  , { key: 'external_efficacy', group: 'Wirksamkeit', label: 'Externe Wirksamkeit', get: lt('external_efficacy') }
  // ── Autoritarismus ──
  , { key: 'obedience_value', group: 'Autoritarismus', label: 'Gehorsam / Autoritätsrespekt', get: lt('obedience_value') }
  , { key: 'strong_leader_preference', group: 'Autoritarismus', label: 'Präferenz für starke Führung', get: lt('strong_leader_preference') }
  , { key: 'rule_conformity', group: 'Autoritarismus', label: 'Regelkonformität', get: lt('rule_conformity') }
  // ── Alienation ──
  , { key: 'powerlessness', group: 'Alienation', label: 'Machtlosigkeit', get: lt('powerlessness') }
  , { key: 'political_complexity', group: 'Alienation', label: 'Empfundene politische Komplexität', get: lt('political_complexity') }
  , { key: 'party_indifference', group: 'Alienation', label: 'Parteigleichgültigkeit', get: lt('party_indifference') }
  // ── Materialismus ──
  , { key: 'economic_security_priority', group: 'Materialismus', label: 'Wirtschaftliche Sicherheit', get: lt('economic_security_priority') }
  , { key: 'environment_over_economy', group: 'Materialismus', label: 'Umwelt vor Wirtschaft', get: lt('environment_over_economy') }
  , { key: 'freedom_over_order', group: 'Materialismus', label: 'Freiheit vor Ordnung', get: lt('freedom_over_order') }
  // ── Populismus ──
  , { key: 'anti_elitism', group: 'Populismus', label: 'Anti-Elitismus', get: lt('anti_elitism') }
  , { key: 'people_centrism', group: 'Populismus', label: 'Volkszentrismus', get: lt('people_centrism') }
  , { key: 'manichean_outlook', group: 'Populismus', label: 'Gut-Böse-Denken', get: lt('manichean_outlook') }
  // ── Sozialkapital ──
  , { key: 'neighbor_trust', group: 'Sozialkapital', label: 'Nachbarschaftsvertrauen', get: lt('neighbor_trust') }
  , { key: 'generalized_trust', group: 'Sozialkapital', label: 'Allgemeines Vertrauen', get: lt('generalized_trust') }
  , { key: 'media_trust', group: 'Sozialkapital', label: 'Medienvertrauen', get: lt('media_trust') }
  , { key: 'community_participation', group: 'Sozialkapital', label: 'Gemeinschaftsbeteiligung', get: lt('community_participation') }
  // ── Verhalten ──
  , { key: 'protest_readiness', group: 'Verhalten', label: 'Protestbereitschaft', get: ps('protest_readiness') }
]

export const CONSTRUCTS_BY_KEY = CONSTRUCTS.reduce((m, c) => { m[c.key] = c; return m }, {})

// Lightweight keyword hints for the "this question measures …" auto-suggestion.
const SUGGEST_KEYWORDS = [
  { re: /zufrieden|zufriedenheit/i, key: 'political_satisfaction' }
  , { re: /links|rechts|ideolog/i, key: 'ideology' }
  , { re: /vertrauen.*(institution|politiker|regierung|staat)|institutionen/i, key: 'institutional_trust' }
  , { re: /\bw(ä|ae)hl|stimme z(ä|ae)hl|meine stimme/i, key: 'vote_importance' }
  , { re: /beeinflussen|etwas bewirken|selbstwirksam/i, key: 'self_efficacy' }
  , { re: /machtlos|die da oben/i, key: 'powerlessness' }
  , { re: /politiker.*(kontakt|volk)|abgehoben|elite/i, key: 'anti_elitism' }
  , { re: /volk.*entscheid|direkt.*abstimm/i, key: 'people_centrism' }
  , { re: /parteien.*(gleich|egal)/i, key: 'party_indifference' }
  , { re: /umwelt.*wirtschaft|umweltschutz/i, key: 'environment_over_economy' }
  , { re: /migration|zuwanderung|grenzen/i, key: 'policy_migration' }
  , { re: /gehorsam|autorit(ä|ae)t/i, key: 'obedience_value' }
  , { re: /starke[rn]? f(ü|ue)hr/i, key: 'strong_leader_preference' }
  , { re: /nachbar/i, key: 'neighbor_trust' }
  , { re: /medien/i, key: 'media_trust' }
  , { re: /protest|demonstr/i, key: 'protest_readiness' }
]

/** Suggest the nearest construct key for a free-text question, or null. */
export function suggestConstruct(text) {
  if (!text) return null
  for (const s of SUGGEST_KEYWORDS) {
    if (s.re.test(text)) return s.key
  }
  return null
}
