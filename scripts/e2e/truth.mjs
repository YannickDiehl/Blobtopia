/**
 * e2e: Wahrheit-Tab (Ground-Truth-Lernansicht) — der komplette Flow:
 * Fragebogen → Stichprobe → Ergebnis → Schloss → Aufdecken → TSE-Zerlegung →
 * Replikations-Simulator → Dozenten-CSV → wieder sperren.
 * Run:  node scripts/e2e/truth.mjs   (braucht laufenden Dev-/Preview-Server)
 */
import { launch, gotoApp, report, finish } from './lib.mjs'

const { browser, page, errors } = await launch()
await gotoApp(page)

// ── Setup: Fragebogen + Stichprobe + Erhebung ──
await page.locator('button[title="Befragungsinstitut (B)"]').click()
await page.waitForTimeout(800)
await page.locator('.step-tab:has-text("Fragebogen")').first().click()
await page.locator('.item-text').first().fill(
  'Wie zufrieden sind Sie mit der Politik? Skala von 1 bis 10, wobei 1 = gar nicht zufrieden und 10 = völlig zufrieden.'
)
await page.waitForTimeout(300)
await page.locator('.step-tab:has-text("Stichprobe")').first().click()
await page.locator('button:has-text("Stichprobe ziehen")').click()
await page.waitForTimeout(600)
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.locator('button:has-text("Befragung durchführen")').click()
await page.waitForTimeout(1500)
report('fieldwork produced a dataset', /Datensätze/.test(await page.locator('.survey-section').innerText()))

// ── Ergebnis-Datentabelle: echte Antworten sichtbar, Name default, Rest opt-in ──
report('data matrix shows the collected answers', (await page.locator('.data-table tbody tr').count()) > 0)
const tableHead = await page.locator('.data-table thead').innerText()
report('respondent names collected by default', /Name/.test(tableHead))
report('sociodemographics are NOT collected automatically', !/Alter|Bildung|Partei/.test(tableHead))
const firstAnswer = await page.locator('.data-table tbody tr').first().innerText()
report('answer cells are populated', /\d|kA|wn/.test(firstAnswer))
// Alter dazuwählen → neue Erhebung trägt die Spalte
await page.locator('.step-tab:has-text("Fragebogen")').first().click()
await page.locator('.demo-block .chip:has-text("Alter")').click()
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.locator('button:has-text("Befragung durchführen")').click()
await page.waitForTimeout(1200)
report('opting in adds the column on the next run'
  , /Alter/.test(await page.locator('.data-table thead').innerText()))

// ── Schloss ──
await page.locator('.step-tab.truth-tab').click()
await page.waitForTimeout(400)
const pw = page.locator('.truth-lock input[type="password"]')
report('truth tab is locked', await pw.isVisible())
await pw.fill('falsches-passwort')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
report('wrong password rejected', await page.locator('.truth-lock input.has-error').isVisible())
await pw.fill(process.env.E2E_INSPECTOR_PASSWORD || 'blob123')
await page.keyboard.press('Enter')
await page.waitForTimeout(400)

// ── Aufdeck-Moment + Zerlegung ──
const reveal = page.locator('button:has-text("Wahre Werte aufdecken")')
report('unlock shows the reveal moment (truth still hidden)', await reveal.isVisible())
await reveal.click()
await page.waitForTimeout(600)
report('decomposition card rendered', (await page.locator('.truth-item').count()) === 1)
report('telescoping chain shows all five means', (await page.locator('.tse-row').count()) === 5)
report('four error components + total listed', (await page.locator('.tse-delta').count()) === 5)
report('construct was detected from wording'
  , /Zufriedenheit/.test(await page.locator('.truth-construct').innerText()))
const ciOrNote = await page.locator('.truth-item').innerText()
report('CI or design-honest SE note present', /95-%-KI|Standardfehler/.test(ciOrNote))

// ── Replikations-Simulator ──
await page.locator('.sim-row input').fill('100')
await page.locator('.sim-row button:has-text("Simulieren")').click()
await page.waitForSelector('.hist-bars', { timeout: 30000 })
await page.waitForTimeout(400)
report('simulator histogram rendered (24 bins)', (await page.locator('.hist-bar').count()) === 24)
report('truth marker overlays the histogram', await page.locator('.hist-truth').isVisible())
report('empirical SE reported', /simulierter SE/.test(await page.locator('.hist-meta').innerText()))

// ── Dozenten-CSV ──
const dlPromise = page.waitForEvent('download', { timeout: 15000 })
await page.locator('button:has-text("Dozenten-CSV")').click()
const dl = await dlPromise
report('instructor CSV downloads', dl.suggestedFilename() === 'blobtopia-befragung-dozentenversion.csv')

// ── Wieder sperren ──
await page.locator('.reset-link:has-text("Wieder sperren")').click()
await page.waitForTimeout(300)
report('relock restores the password gate', await page.locator('.truth-lock input[type="password"]').isVisible())

finish(errors)
await browser.close()
