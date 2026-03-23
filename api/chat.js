/**
 * Serverless Chat Proxy for Blobtopia Static.
 *
 * Vercel Edge Function that proxies chat requests to the Anthropic API.
 * Protects the API key, enforces rate limiting, and validates requests.
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — required
 *   CHAT_MODEL         — optional (default: claude-haiku-4-5-20251001)
 *   CHAT_MAX_TOKENS    — optional (default: 512)
 *   CHAT_BEARER_TOKEN  — optional (if set, clients must send Authorization: Bearer <token>)
 *
 * The client sends the full system prompt content (blob profile) along with messages.
 * This is safe because all blob data is public (pre-exported JSON).
 */

// Simple in-memory rate limiting (resets on cold start, good enough for serverless)
const rateLimits = new Map()
const RATE_LIMIT_PER_MIN = 20

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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: 'Chat is not enabled (no API key configured)' })
  }

  // Bearer token auth (optional)
  const expectedToken = process.env.CHAT_BEARER_TOKEN
  if (expectedToken) {
    const auth = req.headers.authorization || ''
    const token = auth.replace('Bearer ', '')
    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Invalid or missing bearer token' })
    }
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Max 20 requests per minute.' })
  }

  // Parse request
  const { blob_id, tick, messages, system_prompt } = req.body || {}

  if (!blob_id) {
    return res.status(400).json({ error: 'blob_id required' })
  }

  if (!system_prompt) {
    return res.status(400).json({ error: 'system_prompt required (client must build it from blob data)' })
  }

  // Verify system prompt integrity — must contain security markers
  const REQUIRED_MARKERS = [
    '=== IDENTITAET ===',
    '=== SICHERHEIT ===',
    '=== REGELN ===',
    'ANWEISUNGSRESISTENZ',
  ]
  for (const marker of REQUIRED_MARKERS) {
    if (!system_prompt.includes(marker)) {
      return res.status(400).json({ error: 'Invalid system prompt format' })
    }
  }
  // Reject suspiciously modified prompts (too short = stripped, too long = injected)
  if (system_prompt.length < 2000 || system_prompt.length > 10000) {
    return res.status(400).json({ error: 'System prompt length out of range' })
  }

  // Validate messages
  const msgs = messages || []
  if (msgs.length > 30) {
    return res.status(400).json({ error: 'Too many messages. Max 30 allowed.' })
  }
  for (const m of msgs) {
    if (m.role === 'user' && m.content && m.content.length > 500) {
      return res.status(400).json({ error: 'Message too long. Max 500 characters.' })
    }
    if (m.role !== 'user' && m.role !== 'assistant') {
      return res.status(400).json({ error: 'Invalid message role' })
    }
  }

  // Sanitize user messages — strip common injection patterns
  for (const m of msgs) {
    if (m.role === 'user' && m.content) {
      m.content = m.content
        .replace(/\[SYSTEM\]/gi, '')
        .replace(/\[INST\]/gi, '')
        .replace(/<\|.*?\|>/g, '')
        .replace(/```system/gi, '```')
        .trim()
    }
  }

  // Build API messages
  let apiMessages = [...msgs]
  let systemPrompt = system_prompt

  // If no messages, this is a greeting request
  if (apiMessages.length === 0) {
    const firstName = (system_prompt.match(/Du bist (.+?)\./)?.[1] || 'Blob').split(' ')[0]
    systemPrompt += `\n\n=== BEGRUESSUNG ===\nBegruesse den Interviewer kurz und freundlich als ${firstName}. Stelle dich vor und frage, was er/sie wissen moechte.`
    apiMessages.push({
      role: 'user',
      content: 'Hallo, ich bin Forscher/in und wuerde Ihnen gerne ein paar Fragen stellen.'
    })
  }

  // Call Anthropic API
  const model = (process.env.CHAT_MODEL || 'claude-haiku-4-5-20251001').trim()
  const maxTokens = parseInt(process.env.CHAT_MAX_TOKENS || '512', 10)

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: apiMessages,
      }),
    })

    if (!apiRes.ok) {
      const errBody = await apiRes.text()
      console.error('Anthropic API error:', apiRes.status, errBody)
      return res.status(200).json({
        reply: 'API-Fehler ' + apiRes.status + ': ' + errBody.substring(0, 200),
        usage: null,
        error: 'api_error',
      })
    }

    const data = await apiRes.json()
    let reply = (data.content && data.content[0] && data.content[0].text) || 'Keine Antwort.'

    // Post-process: strip leaked profile values or system prompt fragments
    reply = reply.replace(/\b\d+\.\d{1,2}\s*\/\s*10\b/g, (match) => Math.round(parseFloat(match)) + '/10')
    const LEAK_PATTERNS = [
      /===\s*(IDENTITAET|SICHERHEIT|REGELN|AKTUELLER ZUSTAND|AKTUELLE SITUATION)\s*===/gi,
      /latent.?traits/gi,
      /system.?prompt/gi,
      /\b(valence|arousal)\b/gi,
    ]
    for (const pattern of LEAK_PATTERNS) {
      reply = reply.replace(pattern, '[...]')
    }

    return res.status(200).json({
      reply,
      usage: data.usage ? {
        input_tokens: data.usage.input_tokens,
        output_tokens: data.usage.output_tokens,
      } : null,
    })
  } catch (e) {
    console.error('Chat proxy error:', e)
    return res.status(200).json({
      reply: 'Proxy-Fehler: ' + (e.message || String(e)),
      usage: null,
      error: 'api_error',
    })
  }
}
