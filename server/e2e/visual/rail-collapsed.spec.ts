/**
 * The rail when it is folded to icons.
 *
 * **The sweep does not cover this and says so** - the collapsed rail is in
 * `visual-check`'s not-covered list, which is how "the icons do not recentre"
 * reached the maintainer rather than a tier. It reports rather than asserts, like
 * the other files here.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, requireServedApp, settle } from '../support/app.js'

const OUT = process.env['SHOT_DIR'] ?? '/tmp/rail'

test('folds the rail and measures where the icons sit', async ({ browser, baseURL }) => {
  await requireServedApp(baseURL ?? '')
  const { page } = await asPersona(browser, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })
  // **The picker, because that is the screen `RailLayout` draws.** Measuring
  // the case shell first cost a run: its rail is not this layout, so nothing
  // matched the fold control and the click landed elsewhere.
  await page.goto(`${baseURL ?? ''}/cases`)
  await settle(page)

  const folder = page.getByTestId('picker-rail-collapse')
  await expect(folder).toBeVisible({ timeout: 15_000 })
  await folder.click()

  await page.waitForFunction(
    () => document.querySelector('[data-state="collapsed"]') !== null,
    undefined,
    { timeout: 10_000 },
  )
  await settle(page)
  await page.screenshot({ path: `${OUT}/collapsed.png` })

  // Where the active edge sits, against the icon it marks.
  const edge = await page.evaluate(() => {
    const mark = document.querySelector('[data-testid="rail-active-edge"]')
    if (!mark) return { found: false as const }
    const m = mark.getBoundingClientRect()
    const button = mark.closest('a, button, [data-slot="sidebar-menu-button"]')
    const svg = button?.querySelector('svg')
    const s = svg?.getBoundingClientRect()
    const b = button?.getBoundingClientRect()
    return {
      found: true as const,
      edgeLeft: Math.round(m.left),
      buttonLeft: b ? Math.round(b.left) : null,
      iconLeft: s ? Math.round(s.left) : null,
      // How far the edge is from the icon's left. Small is "on the icon".
      gapToIcon: s ? Math.round(s.left - m.right) : null,
    }
  })
  process.stdout.write(`EDGE ${JSON.stringify(edge)}\n`)

  const boxes = await page.evaluate(() => {
    const rail = document.querySelector('[data-state="collapsed"]')
    if (!rail) return { found: false as const }
    const railBox = rail.getBoundingClientRect()
    const rows: Record<string, unknown>[] = []
    for (const button of rail.querySelectorAll('[data-slot="sidebar-menu-button"], a, button')) {
      const svg = button.querySelector('svg')
      if (!svg) continue
      const b = button.getBoundingClientRect()
      const s = svg.getBoundingClientRect()
      if (b.width === 0) continue
      rows.push({
        label: (button.textContent ?? '').trim().slice(0, 18),
        buttonLeft: Math.round(b.left),
        buttonWidth: Math.round(b.width),
        iconLeft: Math.round(s.left),
        // **Against the RAIL, not against the button.** Measured against its
        // own button first, every row read 0 while the icons sat 12px left of
        // the rail's centre - the button is left-shifted too, so the two move
        // together and the comparison says nothing. That is a true measurement
        // of an adjacent thing.
        offCentre: Math.round(s.left + s.width / 2 - (railBox.left + railBox.width / 2)),
      })
    }
    return { found: true as const, railWidth: Math.round(railBox.width), rows: rows.slice(0, 12) }
  })

  process.stdout.write(`${JSON.stringify(boxes, null, 1)}\n`)

  expect(boxes.found, 'the rail never reported itself collapsed').toBe(true)
  const rows = boxes.found ? boxes.rows : []
  expect(rows.length, 'no icon rows were found in the folded rail').toBeGreaterThan(3)

  // **Asserted rather than reported, because it is a position worth
  // defending.** Folded, the component layer forces the button to `size-8` and
  // it sits at the left of its content box - so every icon read 12px left of a
  // 72px rail's centre, which is what the maintainer saw. One pixel of slack for
  // sub-pixel rounding; twelve is the defect.
  const off = rows.map((row) => Math.abs(Number(row['offCentre'])))
  expect(Math.max(...off), `icons off the rail's centre: ${JSON.stringify(off)}`).toBeLessThanOrEqual(1)
})
