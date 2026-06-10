#!/usr/bin/env node
/**
 * Minimaler Standalone-Server für die Chat-API — ohne externe Dependencies.
 *
 * Umgeht defekte node_modules-Installationen, indem nur node:http und das
 * ESM-Modul api/chat.js benötigt werden.
 *
 * Usage: node scripts/start-api-server.js
 */
require('dotenv').config()
const http = require('node:http')
const url = require('node:url')

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      if (!body) return resolve({})
      try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

// Response-Adapter: Vercel-Handler erwartet Express-ähnliche res-API
function makeResAdapter(nodeRes) {
  const adapter = {
    _status: 200,
    _headers: {},
    setHeader(name, value) { this._headers[name] = value; nodeRes.setHeader(name, value) },
    status(code) { this._status = code; return this },
    json(obj) {
      nodeRes.statusCode = this._status
      nodeRes.setHeader('Content-Type', 'application/json')
      nodeRes.end(JSON.stringify(obj))
      return this
    },
    end() {
      nodeRes.statusCode = this._status
      nodeRes.end()
      return this
    },
  }
  return adapter
}

;(async () => {
  const chatModule = await import('../api/chat.js')
  const handler = chatModule.default

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url || '', true)
    const pathname = parsed.pathname || '/'

    // CORS preflight is handled inside the handler
    if (pathname === '/api/chat') {
      try {
        const body = await readJsonBody(req)
        req.body = body
        const adapter = makeResAdapter(res)
        await handler(req, adapter)
      } catch (e) {
        console.error('Handler error:', e)
        res.statusCode = 500
        res.end(JSON.stringify({ error: String(e.message || e) }))
      }
      return
    }

    // Health check
    if (pathname === '/') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.end('OK — API-Server für Tests läuft')
      return
    }

    res.statusCode = 404
    res.end('Not found')
  })

  const port = 8080
  server.listen(port, () => {
    console.log(`✓ Chat-API-Server läuft auf http://localhost:${port}/api/chat`)
    console.log(`  Modell: ${process.env.CHAT_MODEL || '(default)'}`)
    console.log(`  API-Key gesetzt: ${process.env.ANTHROPIC_API_KEY ? 'ja' : 'NEIN'}`)
  })
})().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
