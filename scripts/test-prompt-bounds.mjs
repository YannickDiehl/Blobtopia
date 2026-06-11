/**
 * Contract tripwire: der Persona-Prompt JEDES Blobs muss zu JEDEM Zeitpunkt
 * die Validierung des Chat-Proxys passieren (api/chat.js + vite.config.js):
 * alle vier Sicherheits-Marker, Länge 2000–10000 Zeichen. Verstöße heißen
 * für Nutzer: „Blob antwortet nicht" (HTTP 400 statt Interview).
 *
 * Sweept alle 500 Blobs × 3 Ticks (Anfang/Mitte/Ende) × 4 Aktivitäten mit den
 * echten Change-Summaries. Läuft nur lokal (CI-Clone hat keine ticks/).
 * Run:  node scripts/test-prompt-bounds.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { buildSystemPrompt } from '../src/lib/build-system-prompt.js'
import { expandTickSnapshot } from '../src/lib/timeline-decode.js'

const dataUrl = p => new URL('../public/data/timeline/' + p, import.meta.url)
if (!existsSync(dataUrl('blobs-static.json')) || !existsSync(dataUrl('ticks/0000-0099.json'))) {
  console.log('  – übersprungen: lokale Timeline-Daten fehlen (CI-Clone)')
  console.log('\n0 passed, 0 failed')
  process.exit(0)
}

let pass = 0, fail = 0
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  ✗ ' + label) }
}

const MARKERS = ['=== IDENTITAET ===', '=== SICHERHEIT ===', '=== REGELN ===', 'ANWEISUNGSRESISTENZ']
const MIN = 2000, MAX = 10000
const TPY = 365

const statics = JSON.parse(readFileSync(dataUrl('blobs-static.json'), 'utf8'))
const staticMap = Object.fromEntries(statics.map(g => [g.id, g]))
const blobIndex = JSON.parse(readFileSync(dataUrl('blob-index.json'), 'utf8'))
const summaries = JSON.parse(readFileSync(dataUrl('change-summaries.json'), 'utf8'))
const meta = JSON.parse(readFileSync(dataUrl('meta.json'), 'utf8'))
const maxTick = meta.max_tick != null ? meta.max_tick : 8029

// Nearest change summary at or before the tick (mirrors blob-prompt.js).
function summaryFor(blobId, tick) {
  const entries = summaries[blobId]
  if (!entries || !entries.length) return null
  let best = null
  for (const e of entries) {
    if (e.tick <= tick) best = e
    else break
  }
  return best ? best.summary : null
}

function blockFor(tick) {
  const lo = Math.floor(tick / 100) * 100
  const hi = Math.min(lo + 99, maxTick) // letzter Block ist am max_tick gekappt
  const name = String(lo).padStart(4, '0') + '-' + String(hi).padStart(4, '0') + '.json'
  return JSON.parse(readFileSync(dataUrl('ticks/' + name), 'utf8'))
}

const TICKS = [0, Math.floor(maxTick / 2), maxTick]
const ACTIVITIES = [[null, 12], ['working', 10], ['protesting', 17], ['sleeping', 3]]

const violations = []
let checked = 0
let minLen = Infinity, maxLen = 0
const lastKnownTraits = {}

for (const tick of TICKS) {
  const block = blockFor(tick)
  const snap = block[String(tick)]
  if (!snap) { violations.push({ tick, problem: 'Tick fehlt im Block' }); continue }
  const gen = expandTickSnapshot(snap, { blobIndex, staticMap, lastKnownTraits })
  for (const blob of gen.blobs) {
    const sg = staticMap[blob.id] || {}
    if (blob.job == null && sg.job != null) blob.job = sg.job
    const cs = summaryFor(blob.id, tick)
    for (const [activity, hour] of ACTIVITIES) {
      let prompt
      try {
        prompt = buildSystemPrompt(blob, sg, tick, TPY, cs, activity, hour)
      } catch (e) {
        violations.push({ tick, blob: sg.name || blob.id, problem: 'wirft: ' + e.message })
        continue
      }
      checked++
      minLen = Math.min(minLen, prompt.length)
      maxLen = Math.max(maxLen, prompt.length)
      const missing = MARKERS.filter(m => !prompt.includes(m))
      if (missing.length) violations.push({ tick, blob: sg.name || blob.id, problem: 'Marker fehlt: ' + missing.join(', ') })
      if (prompt.length < MIN || prompt.length > MAX) {
        violations.push({ tick, blob: sg.name || blob.id, activity, problem: 'Länge ' + prompt.length })
      }
    }
  }
}

console.log('prompt bounds sweep (' + checked + ' Prompts, Ticks ' + TICKS.join('/') + '):')
ok(checked >= TICKS.length * 500 * ACTIVITIES.length * 0.99, 'alle Blobs × Ticks × Aktivitäten gebaut (' + checked + ')')
ok(violations.length === 0, 'alle Prompts innerhalb des Proxy-Vertrags [' + MIN + ', ' + MAX + '] mit allen Markern (Länge ' + minLen + '–' + maxLen + ')')
if (violations.length) {
  for (const v of violations.slice(0, 15)) console.log('    ✗', JSON.stringify(v))
  if (violations.length > 15) console.log('    … und ' + (violations.length - 15) + ' weitere')
}

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
