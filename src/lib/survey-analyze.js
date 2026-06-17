/**
 * src/lib/survey-analyze.js
 *
 * LLM-gestützte Analyse einer frei formulierten Befragungsfrage (Rolle A).
 *
 * Studierende schreiben Frage UND Antwortskala selbst — in eigener Wortwahl,
 * beliebiger Skalenform, Polung, sogar Sprache. Diese Datei bündelt ALLES, was
 * server- wie clientseitig gleich sein muss, an EINER Stelle (kein Drift):
 *
 *   1. ANALYZE_SCHEMA        — das json_schema, das die Claude-Antwort erzwingt
 *   2. buildAnalyzeSystem()  — der System-Prompt inkl. Konstrukt-Katalog
 *   3. analyzeFetch()        — der eigentliche Anthropic-Aufruf (server-seitig)
 *   4. mapAnalysisToItem()   — bildet die LLM-Antwort auf den ENGINE-VERTRAG ab
 *
 * Wichtig (die didaktisch harte Grenze): Die synthetische Antwort-Engine und der
 * Wahrheit-Tab können eine Frage nur beantworten/zerlegen, wenn sie an eines der
 * gespeicherten Konstrukte bindet — die Simulation kennt NUR diese Wahrwerte.
 * Der LLM darf flexibel auf die Registry mappen oder „nicht messbar" sagen, aber
 * kein Konstrukt erfinden. „Frei" heißt: freie Formulierung; das Gemessene muss
 * auf etwas auflösen, das die Blobs tatsächlich besitzen.
 *
 * Das LLM ersetzt NICHT die Engine, sondern füllt deren festen Item-Vertrag:
 *   { construct, scale{min,max,minLabel,maxLabel,format,reversed}, wording{…}, validity{…} }
 * Solange exakt diese Struktur herauskommt, bleibt die gesamte Pipeline dahinter
 * (survey-synthetic.js, survey-truth.js) unangetastet.
 */
import { CONSTRUCTS, CONSTRUCTS_BY_KEY } from './survey-constructs.js'

export const ANALYZE_MODEL_DEFAULT = 'claude-sonnet-4-6'

// Bedeutung des HOHEN gespeicherten Pols (0–10, hoch = mehr vom Konstrukt) —
// Semantik aus build-system-prompt.js. Der LLM braucht das, um `reversed`
// korrekt zu setzen (eine HOHE Zahl der Studierenden-Skala kann den NIEDRIGEN
// Pol meinen — bei invertierten Labels ODER negiertem Item-Stamm).
// ACHTUNG bei Neuzugängen: policy_environment hoch = WACHSTUM, aber
// environment_over_economy hoch = UMWELT (genau entgegengesetzt).
const HIGH_MEANS = {
  political_satisfaction: 'sehr zufrieden mit der Politik'
  , ideology: 'rechts / konservativ (niedrig = links / progressiv)'
  , institutional_trust: 'großes Vertrauen in staatliche Institutionen'
  , policy_economy: 'marktliberal, für Deregulierung (niedrig = staatliche Regulierung)'
  , policy_environment: 'Wirtschaft / Wachstum hat Vorrang (niedrig = Umweltschutz)'
  , policy_security: 'Sicherheit / Ordnung hat Vorrang (niedrig = Freiheit / Bürgerrechte)'
  , policy_social: 'Eigenverantwortung / Leistung (niedrig = Umverteilung / Solidarität)'
  , policy_migration: 'restriktive, geschlossene Migrationspolitik (niedrig = offen / liberal)'
  , policy_democracy: 'Demokratieform — Richtung bewusst unklar; nur bei eindeutigen Labels polen'
  , self_efficacy: 'fühlt sich politisch wirksam, kann etwas bewegen'
  , political_knowledge: 'großes politisches Wissen'
  , vote_importance: 'hält die eigene Stimme für wichtig'
  , external_efficacy: 'glaubt, Politiker reagieren auf normale Bürger (responsiv)'
  , obedience_value: 'schätzt Gehorsam und Respekt vor Autorität'
  , strong_leader_preference: 'präferiert eine starke Führungsperson / harte Hand'
  , rule_conformity: 'hohe Regelkonformität, hält sich strikt an Vorschriften'
  , powerlessness: 'fühlt sich politisch machtlos / ohnmächtig'
  , political_complexity: 'empfindet Politik als zu kompliziert / undurchschaubar'
  , party_indifference: 'die Parteien sind ihm/ihr gleichgültig (kein Unterschied)'
  , economic_security_priority: 'priorisiert wirtschaftliche Sicherheit'
  , environment_over_economy: 'Umwelt hat Vorrang vor Wirtschaft (niedrig = Wachstum)'
  , freedom_over_order: 'Freiheit hat Vorrang vor Ordnung (niedrig = Ordnung)'
  , anti_elitism: 'starke Anti-Eliten-Haltung'
  , people_centrism: 'das Volk soll direkt entscheiden (Volkszentrismus)'
  , manichean_outlook: 'Gut-Böse- / Schwarz-Weiß-Denken'
  , neighbor_trust: 'vertraut den Nachbarn'
  , generalized_trust: 'vertraut Menschen allgemein'
  , media_trust: 'vertraut den Medien'
  , community_participation: 'engagiert sich stark in der Gemeinschaft'
  , protest_readiness: 'hohe Protestbereitschaft'
  , age: 'echtes Alter in Jahren (offene Zahlenangabe, keine 0–10-Skala)'
  , income: 'echtes Nettoeinkommen in €/Monat (offene Zahlenangabe, keine 0–10-Skala)'
}

/** Kompakter Konstrukt-Katalog für den System-Prompt (Quelle: Registry). */
function constructCatalog() {
  const lines = []
  let group = null
  for (const c of CONSTRUCTS) {
    if (c.group !== group) { group = c.group; lines.push('## ' + group) }
    const hint = HIGH_MEANS[c.key] || c.label
    const raw = c.raw ? ' [raw: echte Größe]' : ''
    lines.push('- ' + c.key + ' — ' + c.label + raw + '; hoch = ' + hint)
  }
  return lines.join('\n')
}

/** Der vollständige System-Prompt (stabil → cachebar). */
export function buildAnalyzeSystem() {
  return [
    'Du bist das Analyse-Modul eines Lehr-Befragungsinstituts in der Simulation „Blobtopia".'
    , 'Studierende formulieren Befragungsfragen und Antwortskalen frei (eigene Wortwahl, beliebige'
    , 'Skalenform, Polung, auch andere Sprachen). Deine Aufgabe: jede Frage strukturiert auswerten,'
    , 'damit die (synthetische, deterministische) Antwort-Engine sie beantworten kann.'
    , ''
    , 'HARTE GRENZE: Die Simulation kennt nur die folgenden gespeicherten Konstrukte. Eine Frage ist'
    , 'NUR messbar (measurable=true), wenn sie auf GENAU EINES davon auflöst. Du darfst flexibel und'
    , 'semantisch mappen (Synonyme, Umschreibungen, andere Sprachen), aber KEIN Konstrukt erfinden.'
    , 'Misst die Frage etwas, das es im Modell nicht gibt (z. B. Geschlecht, Beruf, ein konkretes'
    , 'Tagesereignis), dann measurable=false und construct=null.'
    , ''
    , '### Konstrukt-Katalog (key — Bedeutung; „hoch" = hoher gespeicherter Wert)'
    , constructCatalog()
    , ''
    , '### Felder, die du bestimmst'
    , '- construct: der passende key aus dem Katalog, sonst null.'
    , '- measurable: true nur, wenn construct gesetzt ist.'
    , '- suggestion: wenn nicht messbar, der NÄCHSTLIEGENDE key als freundlicher Vorschlag (sonst null).'
    , '- stem: NUR die Frageformulierung, OHNE die Antwortskala/Kategorien — der saubere Variablen-Text fürs'
    , '  Codebuch. Z. B. „Sollte Atommüll frei in der Natur entsorgt werden dürfen?" (ohne „1 = …, 2 = …").'
    , '- scale.min / scale.max: die Skalen-Endpunkte als ganze Zahlen. Ohne Vorgabe: Zustimmungsskala'
    , '  → 1 und 5; sonstige Skala → 1 und 10; ja/nein → 0 und 1. raw (Alter/Einkommen): nur, wenn die'
    , '  Studierenden selbst einen Bereich nennen, sonst min=max=null.'
    , '- scale.minLabel / scale.maxLabel: die Endpunkt-Beschriftungen (was die niedrige bzw. hohe Zahl meint).'
    , '- scale.valueLabels: ALLE vom Studierenden ausformulierten Antwortkategorien als Liste {value, label}'
    , '  (z. B. 1=„Stimme voll zu", 2=„Stimme eher zu", … 5=„Stimme voll dagegen"). value ist die Zahl der'
    , '  STUDIERENDEN-Skala (nicht spiegeln). Sind nur die Endpunkte beschriftet, liste nur diese zwei; eine'
    , '  reine Zahlenskala ohne Wortlaute → leere Liste []. Bei offenen Zahlenfragen (Alter/Einkommen) → [].'
    , '- scale.missingLabels: vom Studierenden selbst angelegte FEHLENDE-WERTE-Kategorien als Liste'
    , '  {value, label, kind} — also nicht-substanzielle Antworten wie „weiß nicht", „keine Angabe",'
    , '  „verweigert", „möchte nicht antworten", „trifft nicht zu", „ungültig" (sprachunabhängig). value ist'
    , '  die vom Studierenden vergebene Zahl, label sein Wortlaut, kind ∈ {refused (Verweigerung/keine Angabe),'
    , '  dontknow (weiß nicht/unentschieden), notapplicable (trifft nicht zu), invalid (ungültig)}. WICHTIG:'
    , '  Diese Kategorien gehören NICHT in valueLabels und liegen AUSSERHALB von min/max — der Gültig-Bereich'
    , '  bleibt rein substanziell. Vergibt der Studierende keine fehlenden Werte → leere Liste [].'
    , '  Worked Example: „… 1 = sehr zufrieden … 5 = sehr unzufrieden, 8 = weiß nicht, 9 = keine Angabe" ⇒'
    , '  min=1, max=5, valueLabels 1..5; missingLabels=[{8,„weiß nicht",dontknow},{9,„keine Angabe",refused}].'
    , '- scale.format: "numeric" (allgemeine Zahlenskala inkl. semantischem Differenzial und Häufigkeit'
    , '  „nie…immer"), "likert" (Zustimmung 1–5), "binary" (ja/nein), "open" (offene Zahlenangabe Alter/Einkommen).'
    , '- scale.reversed: true, wenn eine HOHE Zahl der Studierenden-Skala den NIEDRIGEN Konstruktpol meint.'
    , '  Das gilt für invertierte Labels (z. B. „1 = sehr zufrieden, 5 = gar nicht zufrieden") UND für'
    , '  negierte Item-Stämme (z. B. „Ich bin unzufrieden" mit einer Zustimmungsskala → reversed=true,'
    , '  weil hohe Zustimmung = niedrige Zufriedenheit). Siehe die Polungs-Regel unten.'
    , '- scale.difficulty: die Item-Schwierigkeit (0–10 auf der KONSTRUKTSKALA, „hoch" laut Katalog) —'
    , '  der Merkmalswert, bei dem ein Befragter GENAU in der Mitte der Antwortskala läge. Siehe unten.'
    , '- wording.agreeScale: true bei einer Zustimmungs-/Ablehnungsskala (stimme zu … stimme nicht zu),'
    , '  unabhängig von der Polung des Stamms (steuert die Akquieszenz-Modellierung).'
    , '- wording.loadedPositive / loadedNegative: true, wenn die Frage suggestiv positiv bzw. negativ'
    , '  aufgeladen ist (z. B. „wichtig, verantwortungsvoll" vs. „gefährlich, gescheitert").'
    , '- wording.socialDesirability: true, wenn die Frage zu einer sozial erwünschten Antwort drängt'
    , '  („geben Sie ehrlich zu …", „sollte man nicht …", moralisierend).'
    , '- validity.lambda: 1,0 wenn die Frage SAUBER ein Konstrukt misst; 0,7–0,9, wenn sie zugleich ein'
    , '  zweites Konstrukt mit anspricht (unreines Instrument). validity.crossKey: dieses zweite key, sonst null.'
    , '- raw: true nur für age/income.'
    , '- language: erkannte Sprache (z. B. "de", "en") — nur informativ.'
    , '- rationale: EIN kurzer Satz, warum du so zugeordnet hast (Transparenz).'
    , ''
    , '### Polung sorgfältig bestimmen (häufige Fehlerquelle — denke das in zwei Schritten durch)'
    , '1. Welcher Konstruktpol entspricht der ZUSTIMMUNG zur Aussage? Lies den Item-Stamm zusammen mit dem'
    , '   Katalog-Eintrag „hoch = …". Aussagen können selbst eine Richtung tragen (Zustimmung zu einer'
    , '   umweltschädlichen Aussage = HOHER Wert auf einem Konstrukt, dessen hoher Pol „Wachstum vor Umwelt" ist).'
    , '2. An welcher ZAHL der Studierenden-Skala steht dieser (Zustimmungs-)Pol? Steht der HOHE Konstruktpol'
    , '   an der NIEDRIGEN Zahl, ist reversed=true.'
    , 'Worked Example: „Sollte Atommüll frei in der Natur entsorgt werden dürfen? 1 = stimme voll zu … 5 = dagegen."'
    , 'Zustimmung (dürfen) = umweltschädlich = HOHER policy_environment (hoch = Wachstum vor Umwelt). Diese Zustimmung'
    , 'steht an der Zahl 1 (niedrig). Hoher Konstruktpol an niedriger Zahl ⇒ reversed=true.'
    , ''
    , '### Item-Schwierigkeit (difficulty) — damit krasse Items realistische Antworten erzeugen'
    , 'difficulty ist der Merkmalswert (0–10, „hoch" laut Katalog), bei dem ein Befragter in der MITTE der'
    , 'Antwortskala läge. Für ein typisches, ausgewogenes Item ≈ 5 — dann verhält sich die Skala linear; das ist'
    , 'der NORMALFALL, wähle ihn im Zweifel. Verlangt die im Item genannte (Zustimmungs-)Position aber einen'
    , 'EXTREMEN Merkmalswert (eine Randposition, die kaum jemand hält), setze difficulty nahe an diesen Pol:'
    , 'z. B. 9, wenn man fast maximal [hoher Pol] sein muss, um zuzustimmen; 1, wenn fast minimal. Worked Example:'
    , 'Beim Atommüll-Item verlangt Zustimmung einen fast maximalen policy_environment-Wert (extrem umweltschädlich)'
    , '⇒ difficulty ≈ 9. Dadurch lehnt die große Mehrheit stark ab (Decken-Effekt), während ein lineares Modell'
    , 'fälschlich mittlere Antworten lieferte. Setze difficulty NICHT extrem bei normalen Meinungsfragen.'
    , ''
    , 'Antworte ausschließlich über das vorgegebene JSON-Schema. Keine Erklärungen außerhalb des JSON.'
  ].join('\n')
}

// json_schema für output_config.format. Strukturierte Ausgaben erlauben keine
// numerischen/String-Längen-Constraints → Wertebereiche prüfen wir clientseitig
// in mapAnalysisToItem.
export const ANALYZE_SCHEMA = {
  type: 'object'
  , additionalProperties: false
  , properties: {
    construct: { type: ['string', 'null'] }
    , measurable: { type: 'boolean' }
    , suggestion: { type: ['string', 'null'] }
    , scale: {
      type: 'object'
      , additionalProperties: false
      , properties: {
        min: { type: ['integer', 'null'] }
        , max: { type: ['integer', 'null'] }
        , minLabel: { type: 'string' }
        , maxLabel: { type: 'string' }
        , valueLabels: {
          type: 'array'
          , items: {
            type: 'object'
            , additionalProperties: false
            , properties: { value: { type: 'integer' }, label: { type: 'string' } }
            , required: ['value', 'label']
          }
        }
        , missingLabels: {
          type: 'array'
          , items: {
            type: 'object'
            , additionalProperties: false
            , properties: {
              value: { type: 'integer' }
              , label: { type: 'string' }
              , kind: { type: 'string', enum: ['refused', 'dontknow', 'notapplicable', 'invalid'] }
            }
            , required: ['value', 'label', 'kind']
          }
        }
        , format: { type: 'string', enum: ['numeric', 'likert', 'binary', 'open'] }
        , reversed: { type: 'boolean' }
        , difficulty: { type: 'number' }
      }
      , required: ['min', 'max', 'minLabel', 'maxLabel', 'valueLabels', 'missingLabels', 'format', 'reversed', 'difficulty']
    }
    , wording: {
      type: 'object'
      , additionalProperties: false
      , properties: {
        agreeScale: { type: 'boolean' }
        , loadedPositive: { type: 'boolean' }
        , loadedNegative: { type: 'boolean' }
        , socialDesirability: { type: 'boolean' }
      }
      , required: ['agreeScale', 'loadedPositive', 'loadedNegative', 'socialDesirability']
    }
    , validity: {
      type: 'object'
      , additionalProperties: false
      , properties: {
        lambda: { type: 'number' }
        , crossKey: { type: ['string', 'null'] }
      }
      , required: ['lambda', 'crossKey']
    }
    , stem: { type: 'string' }
    , raw: { type: 'boolean' }
    , language: { type: 'string' }
    , rationale: { type: 'string' }
  }
  , required: ['construct', 'measurable', 'suggestion', 'scale', 'wording', 'validity', 'stem', 'raw', 'language', 'rationale']
}

function numOrNull(v) {
  if (v == null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
function str(v) { return v == null ? '' : String(v) }

/** Validierte Kategorie-Labels {value:int, label}: leere Labels raus, je Wert nur einmal. */
function mapValueLabels(arr) {
  if (!Array.isArray(arr)) return []
  const out = []
  const seen = new Set()
  for (const e of arr) {
    if (!e || e.value == null) continue
    const value = Math.round(Number(e.value))
    if (isNaN(value) || seen.has(value)) continue
    const label = str(e.label).trim()
    if (!label) continue
    seen.add(value)
    out.push({ value, label })
  }
  return out
}

/**
 * Studierenden-definierte FEHLENDE-WERTE-Kategorien {value:int, label, kind}.
 * Leere Labels/Duplikate raus; ein Code, der in den Gültig-Bereich [min,max]
 * fällt oder einen valueLabels-Wert trifft, wird NICHT als Missing geführt,
 * sondern als Kollision gemeldet — der Wächter dagegen, dass ein fehlender Wert
 * still als gültiger Wert in Mittelwerte/Zerlegung rutscht.
 * @returns {{ missing: Array, conflicts: number[] }}
 */
function mapMissingLabels(arr, scale, validValues) {
  if (!Array.isArray(arr)) return { missing: [], conflicts: [] }
  const missing = []
  const conflicts = []
  const seen = new Set()
  for (const e of arr) {
    if (!e || e.value == null) continue
    const value = Math.round(Number(e.value))
    if (isNaN(value) || seen.has(value)) continue
    const label = str(e.label).trim()
    if (!label) continue
    const inRange = scale.min != null && scale.max != null && value >= scale.min && value <= scale.max
    if (inRange || validValues.has(value)) { conflicts.push(value); continue }
    const kind = ['refused', 'dontknow', 'notapplicable', 'invalid'].includes(e.kind) ? e.kind : 'invalid'
    seen.add(value)
    missing.push({ value, label, kind })
  }
  return { missing, conflicts }
}
function clampNum(v, lo, hi, dflt) {
  const n = Number(v)
  if (isNaN(n)) return dflt
  return Math.max(lo, Math.min(hi, n))
}

/**
 * Bildet die (schema-validierte) LLM-Antwort auf den Item-Vertrag der Engine ab.
 * Robust gegen unbekannte Konstrukt-Keys: was nicht in der Registry steht, gilt
 * als nicht messbar (die Engine würde es sonst still als „unsupported" kodieren).
 *
 * @returns {{ construct, measurable, scale, wording, validity, suggestion, rationale, raw, language, missingConflicts }}
 */
export function mapAnalysisToItem(a) {
  a = a || {}
  const known = a.construct && CONSTRUCTS_BY_KEY[a.construct] ? a.construct : null
  const c = known ? CONSTRUCTS_BY_KEY[known] : null
  const measurable = !!known
  const isRaw = !!(c && c.raw)

  const sc = a.scale || {}
  let min = numOrNull(sc.min)
  let max = numOrNull(sc.max)
  if (min != null && max != null && max < min) { const t = min; min = max; max = t }
  let format = ['numeric', 'likert', 'binary', 'open'].includes(sc.format) ? sc.format : 'numeric'
  // raw (Alter/Einkommen): echte Größe — offen, außer es wurde ein Bereich genannt.
  if (isRaw) format = (min != null && max != null) ? 'numeric' : 'open'

  // Item-Schwierigkeit (IRT-Schwelle auf der Konstruktskala): 5 = ausgewogen
  // (lineare Abbildung); Abweichung erzeugt Boden-/Decken-Effekte. Für raw
  // (Alter/Einkommen) bedeutungslos → neutral 5.
  const difficulty = isRaw ? 5 : clampNum(sc.difficulty, 0, 10, 5)

  const scale = {
    min: min
    , max: max
    , minLabel: str(sc.minLabel)
    , maxLabel: str(sc.maxLabel)
    // Alle ausformulierten Antwortkategorien fürs Codebuch (leer bei offenen/raw
    // Fragen). Die Antwort-Engine nutzt sie nicht — nur min/max/difficulty.
    , valueLabels: isRaw ? [] : mapValueLabels(sc.valueLabels)
    // Studierenden-definierte fehlende Werte (gleich befüllt) — getrennt vom
    // Gültig-Bereich gehalten; offene/raw Fragen tragen keine.
    , missingLabels: []
    , format: format
    , reversed: !!sc.reversed
    , difficulty: difficulty
  }

  const validVals = new Set(scale.valueLabels.map(v => v.value))
  const mm = isRaw ? { missing: [], conflicts: [] } : mapMissingLabels(sc.missingLabels, scale, validVals)
  scale.missingLabels = mm.missing

  const w = a.wording || {}
  const wording = {
    agreeScale: !!w.agreeScale
    , loadedPositive: !!w.loadedPositive
    , loadedNegative: !!w.loadedNegative
    , socialDesirability: !!w.socialDesirability
  }

  // Validität (Kreuzladung) nur für messbare, nicht-raw Items. Der crossKey muss
  // ein anderes, real existierendes Konstrukt sein, sonst λ = 1 (sauber).
  let validity = { lambda: 1, crossKey: null }
  if (measurable && !isRaw && a.validity) {
    const ck = a.validity.crossKey && CONSTRUCTS_BY_KEY[a.validity.crossKey] && a.validity.crossKey !== known
      ? a.validity.crossKey
      : null
    validity = ck ? { lambda: clampNum(a.validity.lambda, 0.7, 1, 1), crossKey: ck } : { lambda: 1, crossKey: null }
  }

  const suggestion = (!measurable && a.suggestion && CONSTRUCTS_BY_KEY[a.suggestion]) ? a.suggestion : null

  return {
    construct: known
    , measurable: measurable
    , scale: scale
    , wording: wording
    , validity: validity
    , suggestion: suggestion
    , rationale: str(a.rationale)
    // stem = reine Frage ohne Skala (Codebuch-Variablenlabel); Fallback: leer.
    , stem: str(a.stem).trim()
    , raw: isRaw
    , language: str(a.language)
    // Codes, die als fehlend gemeint waren, aber den Gültig-Bereich treffen —
    // für eine sichtbare Warnung in der UI (keine stille Degradation).
    , missingConflicts: mm.conflicts
  }
}

/**
 * Ruft die Anthropic Messages-API auf und gibt die schema-validierte Analyse
 * zurück. Nur SERVER-seitig benutzt (api/analyze.js + Vite-Dev-Middleware);
 * der API-Key verlässt nie den Client.
 *
 * @param {Object} p { apiKey, model, text, fetchImpl? }
 * @returns {Promise<{ analysis: Object, usage: Object|null }>}
 */
export async function analyzeFetch({ apiKey, model, text, fetchImpl }) {
  const doFetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!doFetch) throw new Error('No fetch implementation available')

  const res = await doFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST'
    , headers: {
      'Content-Type': 'application/json'
      , 'x-api-key': apiKey
      , 'anthropic-version': '2023-06-01'
    }
    , body: JSON.stringify({
      model: model || ANALYZE_MODEL_DEFAULT
      // Adaptives Thinking verbraucht Output-Tokens → großzügiges Budget, sonst
      // bricht das JSON nach dem Denken ab. effort 'medium' bündelt das Denken
      // (Polung/Schwierigkeit durchdenken) bei moderaten Kosten.
      , max_tokens: 4000
      , thinking: { type: 'adaptive' }
      , system: [{ type: 'text', text: buildAnalyzeSystem(), cache_control: { type: 'ephemeral' } }]
      , messages: [{ role: 'user', content: 'Analysiere diese Befragungsfrage:\n\n' + String(text || '').slice(0, 1000) }]
      , output_config: { effort: 'medium', format: { type: 'json_schema', schema: ANALYZE_SCHEMA } }
    })
  })

  if (!res.ok) {
    const body = await res.text()
    const err = new Error('Anthropic API ' + res.status + ': ' + body.slice(0, 200))
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const block = data.content && data.content.find(b => b.type === 'text')
  if (!block || !block.text) throw new Error('Leere Analyse-Antwort')
  let analysis
  try { analysis = JSON.parse(block.text) }
  catch (cause) { throw new Error('Analyse-Antwort war kein gültiges JSON', { cause }) }
  return {
    analysis
    , usage: data.usage ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } : null
  }
}
