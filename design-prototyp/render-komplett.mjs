import { chromium } from 'playwright'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'
const dir = path.dirname(fileURLToPath(import.meta.url))
const htmlUrl = pathToFileURL(path.join(dir, 'komplett.html')).href
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
for (const view of ['stadt','interview','pinnwand','fragebogen','stichprobe','ergebnis','presse','wahrheit']) {
  await page.goto(`${htmlUrl}?view=${view}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: path.join(dir, `komplett-${view}.png`) })
  console.log(`✓ komplett-${view}.png`)
}
await browser.close()
