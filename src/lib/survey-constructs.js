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
  // ── Demografie: erfragbare Selbstauskünfte (raw = echte Größe, kein 0–10) ──
  // Antwortverhalten modelliert klassische Survey-Befunde: Alter wird exakt
  // berichtet, Einkommen unterberichtet (~8 %), auf 100er gerundet (Heaping)
  // und als sensible Frage deutlich öfter verweigert. Die Registerwahrheit
  // gibt es parallel über die „Hintergrundmerkmale" — Selbstauskunft vs.
  // Register wird damit vergleichbar.
  , { key: 'age', group: 'Demografie', label: 'Alter (Jahre)', raw: true, heap: 1, get: b => (b && b.age != null ? b.age : null) }
  , { key: 'income', group: 'Demografie', label: 'Einkommen (€/Monat)', raw: true, heap: 100, underreport: 0.08, relNoise: 0.05, sensitive: true, get: b => (b && b.income != null ? b.income : null) }
]

export const CONSTRUCTS_BY_KEY = CONSTRUCTS.reduce((m, c) => { m[c.key] = c; return m }, {})

// Keyword hints for the "misst …"-auto-suggestion. Every construct in the
// registry must be reachable here (tripwire: scripts/test-survey-constructs.mjs).
// FIRST match wins — specific multi-word patterns before broad single words.
// The picker in the Fragebogen-UI stays the safety net for misses.
const SUGGEST_KEYWORDS = [
  // ── Demografie (sehr spezifisch, daher ganz vorn) ──
  { re: /wie alt|geburtsjahr|lebensjahr|\balter\b/i, key: 'age' }
  , { re: /einkommen|verdienst|verdienen|gehalt|\blohn\b|netto|brutto/i, key: 'income' }
  // ── Vertrauen (spezifische Ziele vor dem generellen) ──
  , { re: /nachbar/i, key: 'neighbor_trust' }
  , { re: /medien|presse|nachrichten|journalist|berichterstattung/i, key: 'media_trust' }
  , { re: /vertrau\w*.*(institution|politiker|regierung|staat|parlament|beh(ö|oe)rd|justiz|gericht)|(institution|regierung|staat|parlament|beh(ö|oe)rd|justiz|gericht)\w*.*vertrau|institutionen/i, key: 'institutional_trust' }
  , { re: /(meisten|anderen|fremden|allen)\s+menschen.*(vertrau|trauen)|menschen\s+(kann|k(ö|oe)nnen).*vertrau|im allgemeinen.*vertrau|vorsichtig.*umgang.*menschen/i, key: 'generalized_trust' }
  // ── Sozialkapital / Beteiligung ──
  , { re: /ehrenamt|verein|gemeinschaft\w*.*(aktiv|beteilig|engagier|teil)|engagier.*gemein|nachbarschaftshilfe/i, key: 'community_participation' }
  // ── Wirksamkeit ──
  , { re: /stimme z(ä|ae)hlt?|meine stimme|wahlen.*(wichtig|etwas (ä|ae)ndern)|wichtig.*w(ä|ae)hlen|zur wahl zu gehen/i, key: 'vote_importance' }
  , { re: /regierung.*(k(ü|ue)mmert|interessiert|h(ö|oe)rt)|politiker.*(zuh(ö|oe)r|interessier|ernst)|meinung.*(normaler?|einfacher?)\s*(leute|b(ü|ue)rger)/i, key: 'external_efficacy' }
  , { re: /politik.*(verstehen|kenne|auskennen|informiert)|politisch\w*\s*(wissen|prozesse|zusammenh(ä|ae)nge)|wie gut.*politik/i, key: 'political_knowledge' }
  , { re: /beeinflussen|etwas bewirken|selbstwirksam|einfluss.*(politik|entscheidung)|politik.*mitgestalten/i, key: 'self_efficacy' }
  // ── Autoritarismus ──
  , { re: /starke[rn]?\s*f(ü|ue)hr|f(ü|ue)hrungsperson|harte hand|durchregieren/i, key: 'strong_leader_preference' }
  , { re: /gehorsam|respekt.*autorit|autorit(ä|ae)t/i, key: 'obedience_value' }
  , { re: /regeln.*(befolg|halten|einhalt|strikt)|vorschriften|regelkonform/i, key: 'rule_conformity' }
  // ── Alienation / Populismus ──
  , { re: /machtlos|die da oben|ohnm(ä|ae)chtig|sowieso nichts (ä|ae)ndern/i, key: 'powerlessness' }
  , { re: /politik.*(kompliziert|komplex|zu schwierig|nicht zu verstehen|undurchschaubar)/i, key: 'political_complexity' }
  , { re: /parteien.*(gleich|egal|kein\w* unterschied|im grunde dasselbe)/i, key: 'party_indifference' }
  , { re: /politiker.*(kontakt|volk|abgehoben)|abgehoben|elite|establishment/i, key: 'anti_elitism' }
  , { re: /volk.*entscheid|direkt.*abstimm|volksentscheid|volksabstimmung|b(ü|ue)rger.*(selbst|direkt).*entscheid/i, key: 'people_centrism' }
  , { re: /gut.*b(ö|oe)se|schwarz.*wei(ß|ss)|kompromiss.*verrat/i, key: 'manichean_outlook' }
  // ── Materialismus / Postmaterialismus ──
  , { re: /umwelt.*(wirtschaft|wachstum|arbeitspl(ä|ae)tz)|wirtschaft\w*.*umwelt|umweltschutz|klimaschutz/i, key: 'environment_over_economy' }
  , { re: /freiheit.*(ordnung|sicherheit)|ordnung.*freiheit|selbstverwirklichung/i, key: 'freedom_over_order' }
  , { re: /wirtschaftliche\w*\s*sicherheit|sicherer arbeitsplatz|materielle sicherheit|stabile preise|auskommen/i, key: 'economic_security_priority' }
  // ── Policy-Positionen ──
  , { re: /migration|zuwanderung|grenzen|fl(ü|ue)chtling|asyl|einwander/i, key: 'policy_migration' }
  , { re: /klimapolitik|umweltpolitik|klimaziele/i, key: 'policy_environment' }
  , { re: /(ü|ue)berwachung|polizei|kriminalit(ä|ae)t|innere sicherheit|sicherheitspolitik|b(ü|ue)rgerrechte/i, key: 'policy_security' }
  , { re: /umverteilung|sozialstaat|soziale gerechtigkeit|eigenverantwortung|sozialleistung|arm und reich/i, key: 'policy_social' }
  , { re: /direkte demokratie|repr(ä|ae)sentativ|parlament.*entscheid|demokratieform|expertenregierung/i, key: 'policy_democracy' }
  , { re: /markt|regulierung|staat.*wirtschaft|steuern|wirtschaftspolitik|unternehmen.*freiheit/i, key: 'policy_economy' }
  // ── Verhalten / Einstellungen (breite Muster zuletzt, geringeres Gewicht) ──
  , { re: /protest|demonstr|auf die stra(ß|ss)e/i, key: 'protest_readiness' }
  , { re: /links|rechts|ideolog|konservativ|progressiv/i, key: 'ideology', w: 1 }
  , { re: /zufrieden/i, key: 'political_satisfaction', w: 1 }
  , { re: /\bw(ä|ae)hl/i, key: 'vote_importance', w: 1 }
  , { re: /vertrau/i, key: 'generalized_trust', w: 1 }
]

/** Score ALL constructs against the text (pattern weight; specific=2, generic=1). */
export function scoreConstructs(text) {
  if (!text) return []
  const scores = {}
  const firstIdx = {}
  for (let i = 0; i < SUGGEST_KEYWORDS.length; i++) {
    const s = SUGGEST_KEYWORDS[i]
    if (!s.re.test(text)) continue
    scores[s.key] = (scores[s.key] || 0) + (s.w != null ? s.w : 2)
    if (firstIdx[s.key] == null) firstIdx[s.key] = i
  }
  return Object.keys(scores)
    .map(key => ({ key, score: scores[key] }))
    .sort((a, b) => (b.score - a.score) || (firstIdx[a.key] - firstIdx[b.key]))
}

/** Suggest the nearest construct key for a free-text question, or null. */
export function suggestConstruct(text) {
  const scored = scoreConstructs(text)
  return scored.length ? scored[0].key : null
}

/**
 * Item-Validität als Mischmodell: Eine Frage, die mehrere Konstrukte ähnlich
 * stark anspricht, misst UNREIN — λ < 1 heißt, die Antwort zieht zu (1−λ)
 * aus dem Nachbarkonstrukt, mit erhöhtem Rauschen. λ ist eine ehrliche
 * MODELLENTSCHEIDUNG (keine Messung) und wird erst im Wahrheit-Tab gezeigt,
 * damit die Entdeckung nicht gespoilert wird.
 */
export function analyzeValidity(text) {
  const scored = scoreConstructs(text).filter(s => {
    const c = CONSTRUCTS_BY_KEY[s.key]
    return c && !c.raw // Demografie ist keine Einstellungs-Kreuzladung
  })
  if (scored.length < 2) return { lambda: 1, crossKey: null }
  const target = CONSTRUCTS_BY_KEY[scoreConstructs(text)[0].key]
  if (target && target.raw) return { lambda: 1, crossKey: null }
  const r = scored[1].score / scored[0].score
  if (r < 0.5) return { lambda: 1, crossKey: null }
  const lambda = Math.max(0.7, Math.min(1, 1 - 0.3 * r))
  return { lambda: Math.round(lambda * 100) / 100, crossKey: scored[1].key }
}
