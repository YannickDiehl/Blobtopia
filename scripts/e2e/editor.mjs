/**
 * e2e: Stadt-Editor — Laden, Stempel-Platzieren, Undo, Straßenzug,
 * Inspektor, Validierung und der Welt-Vorschau-Contract (Preview-Key).
 * DOM-only wie die übrigen Driver. Läuft via `npm run e2e`.
 */
import { launch, report, finish, BASE_URL } from './lib.mjs'

const { browser, page, errors } = await launch()

async function gotoEditor () {
  await page.goto(BASE_URL + '/#/editor', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('.city-editor canvas', { timeout: 60000 })
  await page.waitForTimeout(4000) // Layout-Fetch + GLB-Erstladung
}

const stat = async (label) => {
  const text = await page.evaluate(() => document.querySelector('.side-panel').innerText)
  const m = text.match(new RegExp(label + '\\n(\\d+)'))
  return m ? parseInt(m[1]) : NaN
}

await gotoEditor()
report('Editor lädt (Canvas + Palette)', await page.locator('.palette-item').count() > 10)

// Ausgeliefertes Layout wird automatisch geladen
const initial = await stat('Gebäude')
report('ausgelieferte Stadt geladen', initial > 800, `${initial} Gebäude`)

// Validierung: ausgelieferte Stadt hat keine Fehler
const panelText = await page.evaluate(() => document.querySelector('.side-panel').innerText)
report('Prüfung ohne Fehler', !/Zu wenig Wohnraum|Keine Straßen/.test(panelText))

// Stempel-Modus: Villa wählen, zweimal platzieren ohne erneute Auswahl
await page.locator('.palette-item:has-text("Villa A")').first().click()
const canvasBox = await page.locator('.viewport canvas').boundingBox()
const cx = canvasBox.x + canvasBox.width / 2
const cy = canvasBox.y + canvasBox.height / 2
await page.mouse.click(cx, cy)
await page.waitForTimeout(400)
await page.mouse.click(cx + 60, cy)
await page.waitForTimeout(400)
const afterPlace = await stat('Gebäude')
report('Stempel-Modus platziert 2× ohne Neuauswahl', afterPlace === initial + 2, `${initial} → ${afterPlace}`)

// Undo ×2 (Ctrl+Z) → Ausgangszustand
await page.keyboard.press('Escape')
await page.keyboard.press('Control+z')
await page.waitForTimeout(800)
await page.keyboard.press('Control+z')
await page.waitForTimeout(1500)
report('Undo stellt Ausgangszustand her', await stat('Gebäude') === initial)

// Redo (Ctrl+Shift+Z)
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(1500)
report('Redo wiederholt die Platzierung', await stat('Gebäude') === initial + 1)

// Straßenzug-Werkzeug: Drag legt mehrere Tiles
const roadsBefore = await stat('Straßen')
await page.locator('.palette-item:has-text("Straßenzug ziehen")').click()
await page.mouse.move(cx - 150, cy + 100)
await page.mouse.down()
await page.mouse.move(cx + 150, cy + 100, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(800)
const roadsAfter = await stat('Straßen')
report('Straßenzug legt mehrere Tiles', roadsAfter > roadsBefore + 2, `${roadsBefore} → ${roadsAfter}`)

// Auswählen + Inspektor: Klick auf Gebäude öffnet Inspektor, Kapazität editierbar
await page.keyboard.press('Escape')
await page.mouse.click(cx, cy)
await page.waitForTimeout(400)
const inspectorVisible = await page.locator('.panel-title:has-text("Inspektor")').isVisible()
report('Inspektor öffnet bei Auswahl', inspectorVisible)
if (inspectorVisible) {
  // Roundtrip: Wert setzen → Auswahl aufheben → erneut anklicken → Wert noch da?
  const capInput = page.locator('.field-row input[type="number"]')
  await capInput.fill('42')
  await capInput.dispatchEvent('change')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(400)
  const val = await page.locator('.field-row input[type="number"]').inputValue()
  report('Kapazität im Inspektor editierbar (persistiert)', val === '42', `Wert nach Re-Select: ${val}`)
}

// Entwurf wird automatisch gespeichert
const draftSaved = await page.evaluate(() => localStorage.getItem('blobtopia-editor-draft') != null)
report('Entwurf-Autosave in localStorage', draftSaved)

// ── Welt-Vorschau-Contract ──────────────────────────────────────
await page.locator('button:has-text("In Welt ansehen")').click()
await page.waitForTimeout(9000) // Welt lädt (Timeline + Stadt)
const onSimulation = page.url().includes('/s/0')
const previewKeySet = await page.evaluate(() => localStorage.getItem('blobtopia-city-preview') != null)
report('Vorschau: Navigation zur Welt + Preview-Key gesetzt', onSimulation && previewKeySet)
const worldHasCanvas = await page.locator('canvas').count() > 0
report('Welt rendert mit Vorschau-Layout', worldHasCanvas)

await gotoEditor()
await page.locator('button:has-text("Vorschau beenden")').click()
await page.waitForTimeout(400)
const previewCleared = await page.evaluate(() => localStorage.getItem('blobtopia-city-preview') == null)
report('Vorschau beenden räumt den Preview-Key', previewCleared)

// Aufräumen: Draft löschen, damit der Lauf idempotent bleibt
await page.evaluate(() => localStorage.removeItem('blobtopia-editor-draft'))

finish(errors)
await browser.close()
