import { expect, test } from '@playwright/test'

import { ADMIN, asPersona } from './support/app'

/**
 * An opened dialog is actually painted.
 *
 * **`toBeVisible()` cannot decide this, and that is why the defect survived.**
 * Playwright's visibility check reads the bounding box, `display` and
 * `visibility`; it does not read an ancestor's `opacity`. So an overlay sitting
 * at `opacity: 0` -- mounted, focus-trapped, fetching its data, invisible to a
 * person -- answered `visible` to every assertion and every probe written
 * against it.
 *
 * The defect: `Dialog` entered on `initial="hidden"`, and React's StrictMode
 * double-mount in a development build lost the transition to `shown`, leaving
 * the overlay at the initial `opacity: 0`. Every dialog in the app was
 * invisible under `vite`, and every one of them painted in the production
 * build -- so no test that drove `dist` could see it either. `Popover` and
 * `Sheet` already entered with `initial={false}` and were unaffected.
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
})
