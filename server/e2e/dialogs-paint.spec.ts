import { expect, test } from '@playwright/test'

import { ADMIN, asPersona } from './support/app'

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
