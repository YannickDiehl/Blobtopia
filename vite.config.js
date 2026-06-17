import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import 'dotenv/config'
import { analyzeFetch, ANALYZE_MODEL_DEFAULT } from './src/lib/survey-analyze.js'

/**
 * Dev-Middleware: lokaler Chat-Proxy — spiegelt api/chat.js (Vercel-Function),
 * 1:1 portiert aus dem alten vue.config.js devServer.before.
 * Braucht ANTHROPIC_API_KEY in .env.
 */
function chatApiPlugin() {
  return {
    name: 'blobtopia-chat-api'
    , configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const send = (status, obj) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('error', () => send(400, { error: 'bad request' }))
        req.on('end', async () => {
          let body
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
          catch (_e) { return send(400, { error: 'invalid JSON' }) }

          const apiKey = process.env.ANTHROPIC_API_KEY
          if (!apiKey) return send(503, { error: 'ANTHROPIC_API_KEY not set in .env' })

          const { system_prompt, messages, blob_id } = body
          if (!blob_id || !system_prompt) return send(400, { error: 'blob_id and system_prompt required' })

          // Verify system prompt integrity
          const REQUIRED_MARKERS = ['=== IDENTITAET ===', '=== SICHERHEIT ===', '=== REGELN ===', 'ANWEISUNGSRESISTENZ']
          for (const marker of REQUIRED_MARKERS) {
            if (!system_prompt.includes(marker)) return send(400, { error: 'Invalid system prompt format' })
          }
          if (system_prompt.length < 2000 || system_prompt.length > 10000) {
            return send(400, { error: 'System prompt length out of range' })
          }

          let apiMessages = messages && messages.length > 0 ? messages : []
          for (const m of apiMessages) {
            if (m.role === 'user' && m.content) {
              m.content = m.content.replace(/\[SYSTEM\]/gi, '').replace(/\[INST\]/gi, '').replace(/<\|.*?\|>/g, '').trim()
            }
          }
          let sysPrompt = system_prompt

          // Greeting request (no messages)
          if (apiMessages.length === 0) {
            const firstNameMatch = system_prompt.match(/Du bist (.+?)\./)
            const firstName = firstNameMatch ? firstNameMatch[1].split(' ')[0] : 'Blob'
            sysPrompt += '\n\n=== BEGRUESSUNG ===\nBegruesse den Interviewer kurz und freundlich als ' + firstName + '. Stelle dich vor und frage, was er/sie wissen moechte.'
            apiMessages = [{ role: 'user', content: 'Hallo, ich bin Forscher/in und wuerde Ihnen gerne ein paar Fragen stellen.' }]
          }

          const model = process.env.CHAT_MODEL || 'claude-haiku-4-5-20251001'
          try {
            const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST'
              , headers: {
                'Content-Type': 'application/json'
                , 'x-api-key': apiKey
                , 'anthropic-version': '2023-06-01'
              }
              , body: JSON.stringify({ model, max_tokens: 512, system: sysPrompt, messages: apiMessages })
            })

            if (!apiRes.ok) {
              const errText = await apiRes.text()
              console.error('Anthropic API error:', apiRes.status, errText)
              return send(200, {
                reply: 'Entschuldigung, ich bin gerade etwas verwirrt. Koennen Sie die Frage wiederholen?'
                , usage: null, error: 'api_error'
              })
            }

            const data = await apiRes.json()
            const reply = data.content && data.content[0] ? data.content[0].text : 'Keine Antwort.'
            send(200, {
              reply
              , usage: data.usage ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } : null
            })
          } catch (e) {
            console.error('Chat proxy error:', e)
            send(200, {
              reply: 'Entschuldigung, ich bin gerade etwas verwirrt. Koennen Sie die Frage wiederholen?'
              , usage: null, error: 'api_error'
            })
          }
        })
      })
    }
  }
}

/**
 * Dev-Middleware: Stadt-Editor → Repo. Schreibt das Layout synchron in
 * data/blobtopia-city.json (Precompute-Input) UND public/blobtopia-city.json
 * (ausgelieferte Welt) — die beiden Dateien können nicht mehr divergieren.
 * Nur im Dev-Server; in Produktion exportiert der Editor per Download.
 */
function editorSavePlugin() {
  return {
    name: 'blobtopia-editor-save'
    , async configureServer(server) {
      const { writeFile } = await import('node:fs/promises')
      server.middlewares.use('/api/editor/save-city', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const send = (status, obj) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('error', () => send(400, { error: 'bad request' }))
        req.on('end', async () => {
          let layout
          try { layout = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
          catch (_e) { return send(400, { error: 'invalid JSON' }) }
          if (!layout || !Array.isArray(layout.placements) || !layout.version) {
            return send(400, { error: 'kein gültiges Layout (version + placements nötig)' })
          }
          try {
            const json = JSON.stringify(layout, null, 2)
            await writeFile('data/blobtopia-city.json', json)
            await writeFile('public/blobtopia-city.json', json)
            send(200, { written: ['data/blobtopia-city.json', 'public/blobtopia-city.json'] })
          } catch (e) {
            send(500, { error: String(e) })
          }
        })
      })
    }
  }
}

/**
 * Dev-Middleware: lokaler Frage-Analyse-Proxy — spiegelt api/analyze.js.
 * Teilt sich Schema + System-Prompt mit der Function (src/lib/survey-analyze.js),
 * damit Dev und Produktion nicht driften. Braucht ANTHROPIC_API_KEY in .env.
 */
function analyzeApiPlugin() {
  return {
    name: 'blobtopia-analyze-api'
    , configureServer(server) {
      server.middlewares.use('/api/analyze', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const send = (status, obj) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('error', () => send(400, { error: 'bad request' }))
        req.on('end', async () => {
          let body
          try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
          catch (_e) { return send(400, { error: 'invalid JSON' }) }

          const apiKey = process.env.ANTHROPIC_API_KEY
          if (!apiKey) return send(503, { error: 'ANTHROPIC_API_KEY not set in .env' })

          const text = body && body.text
          if (!text || typeof text !== 'string' || !text.trim()) {
            return send(400, { error: 'text erforderlich (die Fragetext-Eingabe).' })
          }
          if (text.length > 1000) return send(400, { error: 'Fragetext zu lang (max. 1000 Zeichen).' })

          const model = process.env.ANALYZE_MODEL || ANALYZE_MODEL_DEFAULT
          try {
            const out = await analyzeFetch({ apiKey, model, text })
            send(200, out)
          } catch (e) {
            console.error('Analyze proxy error:', e)
            send(502, { error: 'Analyse fehlgeschlagen: ' + (e.message || String(e)) })
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), chatApiPlugin(), analyzeApiPlugin(), editorSavePlugin()]
  , resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
    // Altbestand importiert .vue ohne Endung (Webpack-Konvention)
    , extensions: ['.mjs', '.js', '.json', '.vue']
  }
  // .env nutzt weiterhin VUE_APP_*-Variablen (Vercel-Env unverändert)
  , envPrefix: ['VITE_', 'VUE_APP_']
  , css: {
    preprocessorOptions: {
      // 49 SFCs nutzen indented sass, der Rest scss — beide brauchen die
      // injizierten Variablen (Syntax beachten: scss mit, sass ohne Semikolon)
      scss: {
        additionalData: `@import '@/styles/_variables.scss';\n`
        , silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div']
      }
      , sass: {
        additionalData: `@import '@/styles/_variables.scss'\n`
        , silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'slash-div']
      }
    }
  }
  , server: {
    port: 8080
  }
  , build: {
    outDir: 'dist'
    // theme-bulma 0.9 enthält ein (invalides) `min-width: var(--bulma-desktop)`
    // in einer Media-Query — lightningcss bricht dort hart ab, esbuild toleriert es
    , cssMinify: 'esbuild'
  }
})
