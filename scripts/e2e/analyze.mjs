/**
 * e2e: LLM-Frageanalyse (Rolle A) im Browser — der async Fluss.
 * Tippen → „Frage prüfen“ → Chip „erkannt …“; nicht messbar → Warn-Chip +
 * Hinweis; reverse-keyed Polung wird sichtbar. Braucht laufenden Dev-/Preview-
 * Server MIT ANTHROPIC_API_KEY (wie chat.mjs); skippt sauber ohne Schlüssel.
 * Run:  node scripts/e2e/analyze.mjs
 */
import { launch, gotoApp, report, finish } from './lib.mjs'

const { browser, page, errors } = await launch()
await gotoApp(page)

await page.locator('button[title="Befragungsinstitut (B)"]').click()
await page.waitForTimeout(700)
await page.locator('.step-tab:has-text("Fragebogen")').first().click()
await page.waitForTimeout(200)

// Hilfsfunktion: Item i füllen, „Frage prüfen“ klicken, auf das Ergebnis warten.
async function check(i, text) {
  const card = page.locator('.item-card').nth(i)
  await card.locator('.item-text').fill(text)
  await page.waitForTimeout(150)
  await card.locator('.recheck').click()
  // Auf einen Endzustand warten: ok / warn (nicht messbar oder Fehler).
  await page.waitForFunction((idx) => {
    const c = document.querySelectorAll('.item-card')[idx]
    if (!c) return false
    return c.querySelector('.detect-chip.ok') || c.querySelector('.detect-chip.warn')
  }, i, { timeout: 25000 }).catch(() => {})
  return card
}

// Probe: ist die Analyse überhaupt erreichbar? (sonst Error-Chip → skip)
const probe = await check(0, 'Wie sehr vertrauen Sie der Regierung? Skala von 1 bis 10.')
const probeChip = (await probe.locator('.detect-chip').first().innerText().catch(() => '')) || ''
if (/analyse nicht möglich/i.test(probeChip)) {
  console.log('  · /api/analyze nicht verfügbar (kein Key?) — e2e übersprungen')
  await browser.close()
  process.exit(0)
}

report('klare Frage → „erkannt“-Chip', /erkannt/i.test(probeChip), probeChip.replace(/\n/g, ' '))
report('gebunden → ein ok-Chip', (await page.locator('.detect-chip.ok').count()) === 1)

// reverse-keyed: invertierte Labels werden als „invers gepolt“ sichtbar.
const rev = await check(0, 'Wie zufrieden sind Sie mit der Politik? Skala 1–5, wobei 1 = sehr zufrieden und 5 = gar nicht zufrieden.')
const revChip = (await rev.locator('.detect-chip.ok').innerText().catch(() => '')) || ''
report('reverse-keyed Skala → „invers gepolt“ im Chip', /invers/i.test(revChip), revChip.replace(/\n/g, ' '))

// nicht messbar: Warn-Chip + freundlicher Hinweis.
await page.locator('.add-btn').click()
await page.waitForTimeout(150)
const un = await check(1, 'Welche Augenfarbe haben Sie?')
report('nicht messbare Frage → Warn-Chip', (await un.locator('.detect-chip.warn').count()) >= 1)
report('nicht messbar → Umformulier-Hinweis sichtbar', await un.locator('.unmeasurable-hint, .reword-hint').first().isVisible().catch(() => false))

// Tippen löst die alte Bindung (Feldstart-Wächter bleibt ehrlich).
await rev.locator('.item-text').fill('Wie zufrieden sind Sie? geänderter Text ohne Skala xyz')
await page.waitForTimeout(200)
report('Textänderung löst die Bindung (idle/Prüf-Aufforderung)',
  (await page.locator('.item-card').nth(0).locator('.detect-chip.ok').count()) === 0)

finish(errors)
await browser.close()
