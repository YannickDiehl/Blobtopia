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
report('answerable item shows the ok chip', (await page.locator('.detect-chip.ok').count()) === 1)

// ── Nicht zuordenbares Item: Warnung sichtbar, Feldstart blockiert, Picker heilt ──
await page.locator('button:has-text("Item hinzufügen")').click()
await page.locator('.item-text').nth(1).fill('Was ist Ihr Lieblingsessen? Skala von 1 bis 10.')
await page.waitForTimeout(300)
report('unanswerable item shows the warning chip', (await page.locator('.detect-chip.warn').count()) === 1)
await page.locator('.step-tab:has-text("Stichprobe")').first().click()
await page.locator('button:has-text("Stichprobe ziehen")').click()
await page.waitForTimeout(600)
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.locator('button:has-text("Befragung durchführen")').click()
await page.waitForTimeout(500)
report('fieldwork is blocked while an item is unanswerable'
  , /Nicht beantwortbar/.test(await page.locator('.error-banner').innerText().catch(() => '')))
await page.locator('.step-tab:has-text("Fragebogen")').first().click()
await page.locator('.misst-select').nth(1).selectOption({ label: 'Allgemeines Vertrauen' })
await page.waitForTimeout(300)
report('manual binding fixes the warning', (await page.locator('.detect-chip.warn').count()) === 0)
await page.locator('.item-card').nth(1).locator('.action-btn.del').click()
await page.waitForTimeout(300)

// ── Demografische Selbstauskunft: „Wie alt sind Sie?" ist erfragbar ──
await page.locator('button:has-text("Item hinzufügen")').click()
await page.locator('.item-text').nth(1).fill('Wie alt sind Sie?')
await page.waitForTimeout(300)
report('demographic question (age) is answerable as an open number'
  , (await page.locator('.detect-chip.ok').count()) === 2
    && /offene Zahlenangabe/.test(await page.locator('.item-card').nth(1).innerText()))

await page.locator('.step-tab:has-text("Stichprobe")').first().click()
await page.locator('button:has-text("Stichprobe ziehen")').click()
await page.waitForTimeout(600)
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.locator('button:has-text("Befragung durchführen")').click()
await page.waitForTimeout(1500)
const resultText = await page.locator('.survey-section').innerText()
report('fieldwork produced a dataset', /Items/.test(resultText))
report('response rate (Ausschöpfung) reported', /Ausschöpfungsquote/.test(resultText) && /Brutto/.test(resultText))
report('disposition codes appear in the data', /verweigert|nicht erreicht/.test(resultText))
report('per-item estimates table shown', (await page.locator('.summary-table tbody tr').count()) === 2)

// ── Ergebnis-Datentabelle: echte Antworten sichtbar, Name default, Rest opt-in ──
report('data matrix shows the collected answers', (await page.locator('.data-table-wrap .data-table tbody tr').count()) > 0)
const tableHead = await page.locator('.data-table-wrap .data-table thead').innerText()
report('respondent names collected by default', /Name/.test(tableHead))
report('sociodemographics are NOT collected automatically', !/Alter|Bildung|Partei/.test(tableHead))
const firstAnswer = await page.locator('.data-table-wrap .data-table tbody tr').first().innerText()
report('answer cells are populated', /\d|kA|wn/.test(firstAnswer))
// Alter dazuwählen → neue Erhebung trägt die Spalte
await page.locator('.step-tab:has-text("Fragebogen")').first().click()
await page.locator('.demo-block .chip:has-text("Alter")').click()
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.locator('button:has-text("Befragung durchführen")').click()
await page.waitForTimeout(1200)
report('opting in adds the column on the next run'
  , /Alter/.test(await page.locator('.data-table-wrap .data-table thead').innerText()))

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
report('decomposition cards rendered for both items', (await page.locator('.truth-item').count()) === 2)
report('telescoping chains show all six means each', (await page.locator('.tse-row').count()) === 12)
report('five error components + total listed per item', (await page.locator('.tse-deltas .tse-delta').count()) === 12)
report('unit nonresponse is a separate component', /③a Unit-Nonresponse/.test(await page.locator('.truth-item').first().innerText()))
report('measurement error is itemized', /Rauschen\/Rundung/.test(await page.locator('.truth-item').first().innerText()))
report('construct was detected from wording'
  , /Zufriedenheit/.test(await page.locator('.truth-construct').first().innerText()))
const ciOrNote = await page.locator('.truth-item').first().innerText()
report('CI or design-honest SE note present', /95-%-KI|Standardfehler/.test(ciOrNote))

// ── Replikations-Simulator ──
await page.locator('.sim-row input').fill('100')
await page.locator('.sim-row button:has-text("Simulieren")').click()
await page.waitForSelector('.hist-bars', { timeout: 30000 })
await page.waitForTimeout(400)
report('simulator histograms rendered (24 bins × 2 items)', (await page.locator('.hist-bar').count()) === 48)
report('truth marker overlays the histogram', await page.locator('.hist-truth').first().isVisible())
report('empirical SE reported', /simulierter SE/.test(await page.locator('.hist-meta').first().innerText()))

// ── Dozenten-CSV ──
const dlPromise = page.waitForEvent('download', { timeout: 15000 })
await page.locator('button:has-text("Dozenten-CSV")').click()
const dl = await dlPromise
report('instructor CSV downloads', dl.suggestedFilename() === 'blobtopia-befragung-dozentenversion.csv')

// ── Wieder sperren ──
await page.locator('.reset-link:has-text("Wieder sperren")').click()
await page.waitForTimeout(300)
report('relock restores the password gate', await page.locator('.truth-lock input[type="password"]').isVisible())

// ── Längsschnitt (Trend): Wellen-Ausschöpfung, Wellen-Spalte, Wellen-Wahrheit ──
await page.locator('.step-tab:has-text("Stichprobe")').first().click()
await page.locator('.radio-row:has-text("Trend") input').check()
await page.locator('button:has-text("Welle hinzufügen")').click()
await page.waitForTimeout(300)
await page.locator('.step-tab:has-text("Ergebnis")').first().click()
await page.locator('button:has-text("Befragung durchführen")').click()
await page.waitForFunction(() => /Welle 2/.test(document.body.innerText), { timeout: 60000 })
await page.waitForTimeout(400)
report('trend study reports per-wave response rates'
  , /Welle 1/.test(await page.locator('.survey-section').innerText()))
report('data matrix carries the wave column'
  , /welle/.test(await page.locator('.data-table-wrap .data-table thead').innerText()))
await page.locator('.step-tab.truth-tab').click()
await page.locator('.truth-lock input[type="password"]').fill(process.env.E2E_INSPECTOR_PASSWORD || 'blob123')
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
await page.locator('button:has-text("Wahre Werte aufdecken")').click()
await page.waitForTimeout(600)
report('wave chips switch the decomposition', (await page.locator('.wave-chips .chip').count()) === 2)
report('change card compares estimated vs true delta'
  , /Δ wahr/.test(await page.locator('.change-card').first().innerText()))

finish(errors)
await browser.close()
