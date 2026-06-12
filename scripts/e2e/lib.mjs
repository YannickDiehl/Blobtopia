/**
 * Shared helpers for the e2e drivers (smoke/touch/screenshot).
 * Framework-agnostic by design: all assertions go through the DOM, never
 * through Vue internals — so these drivers survive the Vue-2→3 migration.
 *
 * Requires Google Chrome (driven via playwright channel:'chrome').
 * Target URL via E2E_URL (default http://localhost:8080).
 */
import { chromium, webkit, devices } from 'playwright'

export const BASE_URL = process.env.E2E_URL || 'http://localhost:8080'

// E2E_BROWSER=webkit testet mit der Safari-Engine (braucht einmalig
// `npx playwright install webkit`); Default bleibt Chrome.
export async function launch({ device } = {}) {
  const browser = process.env.E2E_BROWSER === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext(
    device ? { ...devices[device] } : { viewport: { width: 1440, height: 900 } }
  )
  const page = await context.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
  return { browser, context, page, errors }
}

/** Load the app, wait for the 3D canvas + data, dismiss the intro tour. */
export async function gotoApp(page, { settleMs = 9000 } = {}) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('canvas', { timeout: 60000 })
  await page.waitForTimeout(settleMs)
  const skip = page.locator('text=Überspringen').first()
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await page.waitForTimeout(1200)
  }
}

/** Read the in-app clock ("Jahr X · Tag Y · HH:00") from the Datums-Stempel. */
export async function readClock(page) {
  const text = await page.evaluate(() => document.body.innerText)
  return text.match(/Jahr\s+\d+\s*·\s*Tag\s+\d+\s*·\s*\d+:\d+/)?.[0] || null
}

/** CDP-based real touch gestures (pointer events derive from these). */
export async function touchTools(context, page) {
  const cdp = await context.newCDPSession(page)
  return {
    async tap(x, y) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    , async doubleTap(x, y) {
      await this.tap(x, y)
      await page.waitForTimeout(120)
      await this.tap(x, y)
    }
    , async drag(x1, y1, x2, y2, steps = 10) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] })
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove'
          , touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }]
        })
        await page.waitForTimeout(16)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    },
  }
}

export function report(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

export function finish(errors) {
  if (errors.length) {
    console.log('CONSOLE ERRORS:\n  ' + errors.slice(0, 10).join('\n  '))
    process.exitCode = 1
  } else {
    console.log('console errors: none')
  }
}
