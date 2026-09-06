import { expect, test } from '@playwright/test'

import { ADMIN, asPersona } from './support/app'

/**
 * An opened dialog is actually painted.
 *
 * **`toBeVisible()` cannot decide this, and that is why the defect survived.**
 * Playwright's visibility check reads the bounding box, `display` and
 * `visibility`; it does not read an ancestor's `opacity`. So an overlay sitting
 * at `opacity: 0` -- mounted, focus-trapped, fetching its data, invisible to a
 * person -- answers `visible` to every assertion and every probe written
 * against it.
 *
 * **Only a development build can show it.** An overlay entering on a hidden
 * initial state loses its transition to React's StrictMode double-mount, which
 * production does not run - so the same spec pointed at `dist` passes over the
 * whole class. This tier drives Vite unless `VISUAL_TARGET=dist` says
 * otherwise.
 *
 * So this asserts the computed opacity of the overlay, which is the one
 * reading that separates a painted dialog from a transparent one.
 */
test.describe('an opened dialog paints', () => {
  test('the About door reaches full opacity, not just the DOM', async ({ browser }) => {
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.locator('[data-slot="sidebar-header"] button').first().click()
      await page.getByRole('menuitem', { name: /about this install/i }).click()
      await expect(page.getByRole('dialog', { name: /about this install/i })).toBeVisible()

      // The overlay carries the fade, so it is the element that can be
      // transparent while everything inside it reports `opacity: 1`.
      // **Polled, because the fade is real.** A single reading lands
      // mid-animation and fails at 0.6, which reads exactly like the defect.
      await expect
        .poll(
          () =>
            page
              .locator('[data-slot="dialog"]')
              .first()
              .evaluate((el) => Number(getComputedStyle(el).opacity)),
          { message: 'the dialog overlay is mounted but painted transparent' },
        )
        .toBe(1)
    } finally {
      await context.close()
    }
  })

  test('the archive door does too, so this is the kit and not one caller', async ({ browser }) => {
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.getByRole('button', { name: /import archive/i }).first().click()
      await expect(page.getByRole('dialog', { name: /import a case archive/i })).toBeVisible()

      await expect
        .poll(
          () =>
            page
              .locator('[data-slot="dialog"]')
              .first()
              .evaluate((el) => Number(getComputedStyle(el).opacity)),
          { message: 'the dialog overlay is mounted but painted transparent' },
        )
        .toBe(1)
    } finally {
      await context.close()
    }
  })
})
