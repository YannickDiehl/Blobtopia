const path = require('path')
require('dotenv').config()

module.exports = {
  publicPath: '/'
  , devServer: {
    contentBase: path.resolve(__dirname, 'public')
    , watchContentBase: false
    , watchOptions: {
      ignored: [/node_modules/, /\.git/, /target/]
      , poll: 1000
    }
    // Local chat proxy — mirrors api/chat.js (Vercel serverless function)
    , before(app) {
      app.use(require('express').json())
      app.post('/api/chat', async (req, res) => {
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set in .env' })
        }

        const { system_prompt, messages, blob_id } = req.body || {}
        if (!blob_id || !system_prompt) {
          return res.status(400).json({ error: 'blob_id and system_prompt required' })
        }

        // Verify system prompt integrity
        const REQUIRED_MARKERS = ['=== IDENTITAET ===', '=== SICHERHEIT ===', '=== REGELN ===', 'ANWEISUNGSRESISTENZ']
        for (const marker of REQUIRED_MARKERS) {
          if (!system_prompt.includes(marker)) {
            return res.status(400).json({ error: 'Invalid system prompt format' })
          }
        }
        if (system_prompt.length < 2000 || system_prompt.length > 10000) {
          return res.status(400).json({ error: 'System prompt length out of range' })
        }

        let apiMessages = messages && messages.length > 0 ? messages : []

        // Sanitize user messages
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
          const fetch = globalThis.fetch
          const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: 512,
              system: sysPrompt,
              messages: apiMessages,
            }),
          })

          if (!apiRes.ok) {
            const errText = await apiRes.text()
            console.error('Anthropic API error:', apiRes.status, errText)
            return res.json({
              reply: 'Entschuldigung, ich bin gerade etwas verwirrt. Koennen Sie die Frage wiederholen?',
              usage: null, error: 'api_error'
            })
          }

          const data = await apiRes.json()
          const reply = data.content && data.content[0] ? data.content[0].text : 'Keine Antwort.'
          res.json({
            reply,
            usage: data.usage ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } : null
          })
        } catch (e) {
          console.error('Chat proxy error:', e)
          res.json({
            reply: 'Entschuldigung, ich bin gerade etwas verwirrt. Koennen Sie die Frage wiederholen?',
            usage: null, error: 'api_error'
          })
        }
      })
    }
  }
  , configureWebpack: {
    resolve: {
      symlinks: true
    }
    , node: {
      __dirname: true
    }
    , plugins: []
    , output: {
      globalObject: 'this'
    }
  }
  , css: {
    loaderOptions: {
      sass: {
        data: `@import '@/styles/_variables.scss'`
      }
    }
  }
}
