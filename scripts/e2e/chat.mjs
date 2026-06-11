/**
 * e2e: Blob-Interview (die einzige Live-Komponente) — Blob anklicken,
 * Interview starten, Begrüßung abwarten, Frage stellen, Antwort prüfen.
 * Protokolliert den /api/chat-Verkehr für die Diagnose.
 *
 * Braucht ANTHROPIC_API_KEY im Server (.env) — ohne Key wird die Suite
 * mit Hinweis übersprungen (kostet sonst ~2 Haiku-Calls).
 * Run:  node scripts/e2e/chat.mjs   (gegen laufenden Dev-/Preview-Server)
 */
import { launch, gotoApp, report, finish } from './lib.mjs'

const { browser, page, errors } = await launch()

const chatCalls = []
page.on('response', async res => {
  if (!res.url().includes('/api/chat')) return
  let body
  try { body = (await res.text()).slice(0, 300) } catch (_e) { body = '<body nicht lesbar>' }
  chatCalls.push({ status: res.status(), body })
})

await gotoApp(page)

// ── Blob auswählen: Command-Palette (deterministischer als ein Canvas-Tap) ──
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
await page.waitForSelector('.search-input', { timeout: 8000 })
await page.locator('.search-input').fill('a')
await page.waitForTimeout(500)
let inspectorOpen = false
const resultCount = Math.min(await page.locator('.result-item').count(), 5)
for (let i = 0; i < resultCount && !inspectorOpen; i++) {
  await page.locator('.result-item').nth(i).click()
  await page.waitForTimeout(700)
  inspectorOpen = await page.locator('.blob-interaction').isVisible().catch(() => false)
  if (!inspectorOpen && !(await page.locator('.search-input').isVisible().catch(() => false))) {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
    await page.waitForSelector('.search-input', { timeout: 8000 })
    await page.locator('.search-input').fill('a')
    await page.waitForTimeout(500)
  }
}
report('blob inspector opens via command palette', inspectorOpen)
if (!inspectorOpen) { finish(errors); await browser.close(); process.exit(1) }

// ── Interview starten → Begrüßung ──
await page.locator('.interview-section button:has-text("Interview führen")').click()
const greetingOk = await page.waitForSelector(
  '.chat-messages .message.assistant .bubble:not(.typing)'
  , { timeout: 45000 }
).then(() => true).catch(() => false)

if (!greetingOk && chatCalls.length && /ANTHROPIC_API_KEY not set/.test(chatCalls[0].body)) {
  console.log('  ⊘ übersprungen — kein ANTHROPIC_API_KEY im Server (.env)')
  await browser.close()
  process.exit(0)
}
report('greeting arrives', greetingOk, chatCalls.length ? `HTTP ${chatCalls[0].status}` : 'KEIN /api/chat-Request abgesetzt!')
const greeting = greetingOk ? await page.locator('.chat-messages .message.assistant .bubble').first().innerText() : ''
report('greeting has content', greeting.trim().length > 10, greeting.slice(0, 80).replace(/\n/g, ' '))

// ── Frage stellen → Antwort ──
await page.locator('textarea.chat-input').fill('Wie zufrieden sind Sie mit der Politik, auf einer Skala von 1 bis 10?')
await page.locator('.send-btn').click()
const replyOk = await page.waitForFunction(
  () => document.querySelectorAll('.chat-messages .message.assistant .bubble:not(.typing)').length >= 2
  , { timeout: 45000 }
).then(() => true).catch(() => false)
report('answer to a question arrives', replyOk)
if (replyOk) {
  const bubbles = await page.locator('.chat-messages .message.assistant .bubble:not(.typing)').allInnerTexts()
  const last = bubbles[bubbles.length - 1] || ''
  report('answer has content', last.trim().length > 10, last.slice(0, 80).replace(/\n/g, ' '))
  report('answer is not the error fallback', !/etwas verwirrt/.test(last))
}
report('no error banner shown', !(await page.locator('.error-banner').isVisible().catch(() => false))
  , await page.locator('.error-banner').innerText().catch(() => ''))

// ── Diagnose-Protokoll ──
console.log('— /api/chat-Verkehr (' + chatCalls.length + ' Calls):')
for (const c of chatCalls) console.log(`    HTTP ${c.status}: ${c.body.replace(/\n/g, ' ').slice(0, 200)}`)

finish(errors)
await browser.close()
