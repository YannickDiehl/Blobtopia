/**
 * Smoke test: app boots, 3D world renders, timeline advances at turbo
 * speed, survey window opens and all tabs are reachable. DOM-only
 * assertions (no Vue internals) — run via `npm run e2e`.
 */
import { launch, gotoApp, readClock, report, finish } from './lib.mjs'

const { browser, page, errors } = await launch()

await gotoApp(page)
report('app loads + canvas present', true)

const body = await page.evaluate(() => document.body.innerText)
report('500 Blobs loaded', /500\s*Blobs/.test(body))

// Deterministic tick step: the "+7" button must move the clock by a week.
const clock0 = await readClock(page)
await page.locator('button[title="1 Woche vor (Ctrl+→)"]').click()
await page.waitForTimeout(1500)
const clock1 = await readClock(page)
report('tick step (+7) advances the clock', clock0 !== clock1, `${clock0} → ${clock1}`)

// Turbo playback: select 10× in the speed menu, press play, expect movement.
await page.locator('.speed-selector').click()
await page.locator('.speed-item:has-text("10×")').click()
await page.locator('.play-btn').first().click()
await page.waitForTimeout(6000)
const clock2 = await readClock(page)
await page.locator('.play-btn').first().click() // pause again
report('timeline advances under 10× playback', clock1 !== clock2, `${clock1} → ${clock2}`)

// Survey window via TopBar button (works without keyboard)
await page.locator('button[title="Befragungsinstitut (B)"]').click()
await page.waitForTimeout(1200)
report('survey window opens', await page.locator('.survey-window').isVisible())

for (const tab of ['Stichprobe', 'Ergebnis', 'Fragebogen']) {
  await page.locator(`.step-tab:has-text("${tab}")`).first().click({ timeout: 8000 })
  await page.waitForTimeout(500)
}
report('all survey tabs clickable', true)

finish(errors)
await browser.close()
