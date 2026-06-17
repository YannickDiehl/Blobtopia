/**
 * Serverless Frage-Analyse-Proxy für Blobtopia.
 *
 * Vercel-Function, die EINE frei formulierte Befragungsfrage an die Anthropic-API
 * schickt und strukturiert zurückgibt (Skala, Konstrukt, Polung, Frageeffekte,
 * Validität). Hält den API-Key server-seitig, ratenbegrenzt. Pendant zu
 * api/chat.js; die eigentliche Schema-/Prompt-Logik liegt in src/lib/survey-analyze.js
 * (eine Quelle, die Dev-Middleware in vite.config.js teilt sie).
 *
 * Umgebungsvariablen:
 *   ANTHROPIC_API_KEY  — erforderlich
 *   ANALYZE_MODEL      — optional (Default claude-sonnet-4-6)
 */
import { analyzeFetch, ANALYZE_MODEL_DEFAULT } from '../src/lib/survey-analyze.js'

const rateLimits = new Map()
const RATE_LIMIT_PER_MIN = 30

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateLimits.get(ip)
  if (!entry || now - entry.windowStart > 60000) {
    rateLimits.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_PER_MIN
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Analyse ist nicht aktiviert (kein API-Key konfiguriert).' })

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Zu viele Anfragen. Maximal 30 pro Minute.' })
  }

  const { text } = req.body || {}
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text erforderlich (die Fragetext-Eingabe).' })
  }
  if (text.length > 1000) {
    return res.status(400).json({ error: 'Fragetext zu lang (max. 1000 Zeichen).' })
  }

  const model = (process.env.ANALYZE_MODEL || ANALYZE_MODEL_DEFAULT).trim()
  try {
    const out = await analyzeFetch({ apiKey, model, text })
    return res.status(200).json(out)
  } catch (e) {
    console.error('Analyze proxy error:', e)
    return res.status(502).json({ error: 'Analyse fehlgeschlagen: ' + (e.message || String(e)) })
  }
}
