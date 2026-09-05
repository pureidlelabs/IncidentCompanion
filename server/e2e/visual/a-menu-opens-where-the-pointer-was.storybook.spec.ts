/**
 * A context menu opens at the pointer, not at the corner of the box the
 * pointer was over.
 *
 * **No other tier can see this.** jsdom lays nothing out, so the anchor's rect
 * and the pointer's coordinates are both zero and agree perfectly while the
 * menu opens 180px away from the hand that asked for it.
 *
 * The defect it holds: `OverlayAnchor` at `position: fixed` states the
 * pointer's `clientX`/`clientY`, which are viewport coordinates. A `fixed`
 * element resolves against the viewport only while no ancestor is a containing
 * block for it -- and `will-change: transform` makes one. The `DataTable`
 * scroller took that declaration to hold a sticky header and a scrollport clip
 * on the same device row, and the anchor inside it silently changed what its
 * coordinates were measured from. Measured in Firefox at 1440x900: the anchor
 * landed 17px right and 17px below the pointer, which is the scroller's own
 * border-box origin, and clearing `will-change` on that one node returned it
 * to 0/0. In the app the scroller sits far lower than a story's does, so the
 * same defect is the menu opening a long way from the pointer.
 *
 * **The compositing check is what stops this passing over nothing.** Delete
 * the `will-change` and the anchor is correct for the trivial reason, so the
 * assertion below would certify a hazard that is no longer there while the
 * next person to reintroduce it goes unwarned.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/a-menu-opens-where-the-pointer-was.storybook.spec.ts
 * ```
 */
import { expect, test } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

/**
 * Stories whose table scrolls in its own box **and** whose rows have a menu to
 * open. A row with nothing to offer hands the gesture back to the browser, so
 * the anchor stays where it was and the reading below is of an unopened menu:
 * `LargeSet` failed this spec that way, 40px off, while measuring nothing.
 */
const STORIES = [
  'blocks-table-data-table--rows',
  'blocks-table-data-table--menu-only-row',
] as const

/** Anything that makes an ancestor a containing block for `position: fixed`. */
const COMPOSITING = ['transform', 'perspective', 'filter', 'backdrop-filter', 'will-change']

for (const story of STORIES) {
  test(`the menu anchor lands on the pointer: ${story}`, async ({ page }) => {
    await page.goto(`${STORYBOOK_URL}/iframe.html?id=${story}&viewMode=story`, {
      waitUntil: 'networkidle',
    })
    await page.waitForSelector('[data-slot="table-scroll"]')

    const opened = await page.evaluate(() => {
      const scroller = document.querySelector('[data-slot="table-scroll"]')
      const row = document.querySelector('[data-row-id]')
      if (!scroller || !row) throw new Error('no scroller or row in this story')

      const box = row.getBoundingClientRect()
      const clientX = Math.round(box.left + 40)
      const clientY = Math.round(box.top + box.height / 2)
      row.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX, clientY }),
      )

      const style = getComputedStyle(scroller)
      return {
        pointer: { x: clientX, y: clientY },
        // Read back so a scroller that stops compositing cannot leave this
        // asserting the easy case.
        composited: {
          transform: style.transform,
          perspective: style.perspective,
          filter: style.filter,
          backdropFilter: style.backdropFilter,
          willChange: style.willChange,
        },
      }
    })

    // The hazard has to be present for the assertion below to mean anything.
    const composited = Object.entries(opened.composited).some(
      ([, value]) => value !== 'none' && value !== 'auto' && value !== '',
    )
    expect(
      composited,
      `the scroller no longer establishes a containing block (${COMPOSITING.join(', ')}); ` +
        'this spec would pass over nothing',
    ).toBe(true)

    // The menu has to have opened, or the anchor is still at its resting
    // `0,0` and the reading below is of nothing at all.
    await expect(page.getByRole('menu')).toBeVisible()

    const anchor = page.locator('[data-slot="overlay-anchor"]')
    await expect(anchor).toBeAttached()

    const box = await anchor.evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return { left: rect.left, top: rect.top }
    })

    expect(
      Math.abs(box.left - opened.pointer.x),
      `anchor at x=${box.left}, pointer at x=${opened.pointer.x}`,
    ).toBeLessThan(1)
    expect(
      Math.abs(box.top - opened.pointer.y),
      `anchor at y=${box.top}, pointer at y=${opened.pointer.y}`,
    ).toBeLessThan(1)
  })
}
