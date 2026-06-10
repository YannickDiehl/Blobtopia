/**
 * Tablet touch suite (iPad emulation, real CDP touch events):
 * open survey via TopBar tap, drag by header, resize via grip,
 * double-tap maximize, tab taps — in landscape AND portrait, including
 * the regression scenario "window dragged down over the timeline bar".
 */
import { launch, gotoApp, touchTools, report, finish } from './lib.mjs'

for (const device of ['iPad Pro 11 landscape', 'iPad Pro 11']) {
  console.log(`\n── ${device} ──`)
  const { browser, context, page, errors } = await launch({ device })
  const t = await touchTools(context, page)
  const center = b => [b.x + b.width / 2, b.y + b.height / 2]

  await gotoApp(page)
  // Tour skip happened via click in gotoApp; re-do via tap if still visible
  const skip = page.locator('text=Überspringen').first()
  if (await skip.isVisible().catch(() => false)) { await t.tap(...center(await skip.boundingBox())); await page.waitForTimeout(1000) }

  // Open survey window by tapping the TopBar button
  await t.tap(...center(await page.locator('button[title="Befragungsinstitut (B)"]').boundingBox()))
  await page.waitForTimeout(1500)
  const win = page.locator('.survey-window')
  report('survey opens on tap', await win.isVisible())

  // Drag DOWN over the timeline bar (historical z-index regression scenario)
  const header = await page.locator('.survey-header').boundingBox()
  const before = await win.boundingBox()
  await t.drag(header.x + header.width / 2 - 60, header.y + header.height / 2,
    header.x + header.width / 2 + 140, header.y + header.height / 2 + 120)
  await page.waitForTimeout(400)
  const after = await win.boundingBox()
  report('touch drag moves window', after.x - before.x > 150 && after.y - before.y > 80,
    `Δ(${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)})`)

  // Resize via the injected grip — must work even above the timeline bar
  const grip = () => page.locator('[aria-label="Größe ändern (Doppeltipp: maximieren)"]').boundingBox()
  const g1 = await grip()
  const s1 = await win.boundingBox()
  await t.drag(...center(g1), g1.x + g1.width / 2 + 120, g1.y + g1.height / 2 + 90)
  await page.waitForTimeout(400)
  const s2 = await win.boundingBox()
  report('touch resize grows window', s2.width - s1.width > 80, `Δw=${Math.round(s2.width - s1.width)}`)

  // Double-tap the grip → maximize (grip is guaranteed on-screen by clamping)
  await t.doubleTap(...center(await grip()))
  await page.waitForTimeout(600)
  const max = await win.boundingBox()
  const vp = page.viewportSize()
  report('double-tap maximizes', max.height > vp.height * 0.8,
    `${Math.round(max.width)}x${Math.round(max.height)} of ${vp.width}x${vp.height}`)

  // Tabs reachable by touch
  await t.tap(...center(await page.locator('.step-tab:has-text("Stichprobe")').boundingBox()))
  await page.waitForTimeout(600)
  const active = await page.locator('.step-tab.active').innerText().catch(() => '?')
  report('tab switch via tap', active.includes('Stichprobe'))

  finish(errors)
  await browser.close()
}
