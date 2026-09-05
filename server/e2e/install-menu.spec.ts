import { expect, test } from '@playwright/test'

import { ADMIN, asPersona } from './support/app'

/**
 * The two doors the rail's head offers, pressed.
 *
 * **Both were inert for as long as they existed.** `productMenuRows` was a
 * static fragment carrying no `onAction`, on this branch and on the one before
 * it, so *About this install* and *Health* were drawn, focusable, enabled and
 * connected to nothing. Nothing failed when an analyst pressed them.
 *
 * What is asserted is what an analyst sees, not that a handler ran: a dialog
 * with the build in it, and the health pane on screen. A handler that fires
 * into a dialog nobody can see is the defect this file exists for -- the
 * component's own story renders it in both engines, so the gap this covers is
 * the app's, between the menu and the screen.
 */
test.describe('the rail head menu', () => {
  test('About this install opens the build, from the picker', async ({ browser }) => {
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.locator('[data-slot="sidebar-header"] button').first().click()
      await page.getByRole('menuitem', { name: /about this install/i }).click()

      // A React Aria menu popover also carries `role=dialog`, so the name is
      // what separates the door from the menu that opened it.
      const dialog = page.getByRole('dialog', { name: /about this install/i })
      await expect(dialog).toBeVisible()
      // The version is the one fact only the server can supply, so its
      // presence separates a painted dialog from a painted empty one.
      await expect(dialog).toContainText(/internal-dev|\d+\.\d+/)
    } finally {
      await context.close()
    }
  })

  test('Health leaves the menu and lands on the health pane', async ({ browser }) => {
    const { context, page } = await asPersona(browser, ADMIN)
    try {
      await page.locator('[data-slot="sidebar-header"] button').first().click()
      await page.getByRole('menuitem', { name: /^health$/i }).click()

      // The pane, not the rail row: the row is lit by state the menu also
      // sets, so asserting the row would pass on a menu that only lit it.
      await expect(page.getByText(/^(this machine|elsewhere|unknown)$/).first()).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
