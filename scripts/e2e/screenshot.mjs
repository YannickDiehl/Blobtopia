/**
 * Captures a deterministic screenshot set of the key views for visual
 * comparison across the migration. Usage:
 *   node scripts/e2e/screenshot.mjs [outDir]   (default: e2e-shots/)
 * Baseline workflow: capture once on the old stack into e2e-baseline/,
 * then compare each migration gate's e2e-shots/ against it (manual review
 * — blob wander animation makes pixel-diffs noisy by design).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, gotoApp, finish } from './lib.mjs'

const outDir = process.argv[2] || 'e2e-shots'
mkdirSync(outDir, { recursive: true })

const { browser, page, errors } = await launch()
const shot = async name => {
  await page.screenshot({ path: join(outDir, name + '.png') })
  console.log(`  📸 ${name}`)
}

await gotoApp(page)
await shot('01-world')

// Studienmappe am Schreibtisch: alle drei Blätter
await page.locator('button[title="Befragungsinstitut (B)"]').click()
await page.waitForTimeout(1200)
await shot('02-survey-fragebogen')
await page.locator('.step-tab:has-text("Stichprobe")').first().click()
await page.waitForTimeout(800)
await shot('03-survey-stichprobe')
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.waitForTimeout(800)
await shot('04-survey-ergebnis')
await page.keyboard.press('Escape') // zurück in die Stadt
await page.waitForTimeout(600)

// BlobPhone (Stadt) + Presse-Mappe (Schreibtisch)
await page.locator('button[title="BlobFeed ein-/ausblenden"]').click()
await page.waitForTimeout(1500)
await shot('05-feed')
await page.locator('button[title="BlobFeed ein-/ausblenden"]').click()
await page.waitForTimeout(600)
await page.locator('button[title="Presse lesen (N)"]').click()
await page.waitForTimeout(2000)
await shot('06-newspaper')

finish(errors)
await browser.close()
