// Rendert eine Prototyp-HTML als PNGs (beide Ansichten).
// Nutzung: node design-prototyp/render.mjs [datei.html] [praefix]
import { chromium } from 'playwright'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const htmlFile = process.argv[2] || 'prototyp.html'
const prefix = process.argv[3] || ''
const htmlUrl = pathToFileURL(path.join(dir, htmlFile)).href

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

for (const view of ['stadt', 'schreibtisch']) {
  await page.goto(`${htmlUrl}?view=${view}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(900) // Fonts + Bilder
  await page.screenshot({ path: path.join(dir, `${prefix}${view}.png`) })
  console.log(`✓ ${prefix}${view}.png`)
}
await browser.close()
