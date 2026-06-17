/**
 * src/lib/survey-llm-analyze.js
 *
 * Client-Seite der LLM-Frageanalyse (Rolle A). Schickt EINEN Fragetext an den
 * /api/analyze-Proxy, der den API-Key server-seitig hält, und bildet die Antwort
 * auf den Engine-Item-Vertrag ab (mapAnalysisToItem).
 *
 * Es gibt bewusst KEINEN Heuristik-Fallback: der LLM ist der einzige Analysepfad
 * (Yannicks Vorgabe). Damit das im Lehrwerkzeug nicht still scheitert, werfen
 * Fehler einen sprechenden, anzeigbaren Error — die UI macht ihn sichtbar und
 * bietet „erneut prüfen". Der Feldstart bleibt blockiert, solange ein Item nicht
 * an ein Konstrukt gebunden ist (Wächter im Store).
 */
import { mapAnalysisToItem } from './survey-analyze.js'
import { ANALYZE_API } from '@/config/api'

export class AnalyzeError extends Error {
  constructor(message) { super(message); this.name = 'AnalyzeError' }
}

/**
 * Analysiert einen Fragetext und liefert die gemappten Item-Felder.
 * @param {string} text
 * @param {Object} [opts] { endpoint, fetchImpl, signal }
 * @returns {Promise<{ construct, measurable, scale, wording, validity, suggestion, rationale, raw, language }>}
 */
export async function analyzeItem(text, opts) {
  opts = opts || {}
  const t = String(text || '').trim()
  if (!t) throw new AnalyzeError('Kein Fragetext.')

  const doFetch = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null)
  if (!doFetch) throw new AnalyzeError('Keine Netzwerkverbindung verfügbar.')

  let res
  try {
    res = await doFetch(opts.endpoint || ANALYZE_API, {
      method: 'POST'
      , headers: { 'Content-Type': 'application/json' }
      , body: JSON.stringify({ text: t })
      , signal: opts.signal
    })
  } catch (e) {
    if (e && e.name === 'AbortError') throw e
    throw new AnalyzeError('Analyse nicht erreichbar (Netzwerk). Bitte erneut prüfen.')
  }

  let data = null
  try { data = await res.json() } catch (_e) { /* fällt unten in den Fehlerzweig */ }

  if (!res.ok || !data || !data.analysis) {
    const msg = data && data.error ? data.error : ('Analyse fehlgeschlagen (HTTP ' + res.status + ').')
    throw new AnalyzeError(msg)
  }

  return mapAnalysisToItem(data.analysis)
}
