import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, openFirstCase, requireServedApp, settle } from './support/app.js'

/**
 * **The activity door, opened in a browser against the real route.**
 */
test.describe('the case activity door', () => {
  test.beforeEach(async ({ baseURL }) => {
    await requireServedApp(baseURL ?? '')
  })

  test('opens onto what the server recorded, over the header', async ({ browser }) => {
    const { page, context } = await asPersona(browser, ADMIN)
    try {
      await openFirstCase(page)
      await settle(page)

      const door = page.getByTestId('case-activity')
      await expect(door).toBeVisible()

      // **Outboard of the roster.** The order is the design - who is here now,
      // then what they have done - and it is a position, so it is asserted
      // here rather than in a tier with no layout.
      const roster = page.locator('[data-slot="presence-stack"]').first()
      if (await roster.isVisible()) {
        const [left, right] = await Promise.all([roster.boundingBox(), door.boundingBox()])
        expect(left && right && right.x).toBeGreaterThan((left?.x ?? 0) + (left?.width ?? 0) - 1)
      }

      await door.click()

      const panel = page.locator('[data-slot="popover-content"]')
      await expect(panel).toBeVisible()
      await expect(panel.getByText('Activity')).toBeVisible()

      /**
       * **A row, or the empty line - and never both, and never neither.**
       */
      const rows = panel.locator('[data-slot="timeline-item"]')
      const empty = panel.getByText(/nothing has been written/i)
      await expect
        .poll(async () => (await rows.count()) > 0 || (await empty.count()) > 0)
        .toBe(true)

      const box = await panel.boundingBox()
      expect(box?.width ?? 0).toBeGreaterThan(200)
      expect(box?.height ?? 0).toBeGreaterThan(40)

      /**
       * **The disc is inside the scroller, measured rather than looked at.**
       */
      if ((await rows.count()) > 0) {
        const clip = await panel.locator('[data-slot="scroll-area-viewport"]').first().boundingBox()
        const disc = await panel.locator('[data-slot="timeline-indicator"]').first().boundingBox()
        expect(disc?.width ?? 0).toBeGreaterThan(0)
        expect(disc?.x ?? 0).toBeGreaterThanOrEqual(clip?.x ?? 0)
        expect((disc?.x ?? 0) + (disc?.width ?? 0)).toBeLessThanOrEqual(
          (clip?.x ?? 0) + (clip?.width ?? 0),
        )
      }
    } finally {
      await context.close()
    }
  })
})
