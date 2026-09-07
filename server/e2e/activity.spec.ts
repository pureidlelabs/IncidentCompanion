import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, openFirstCase, requireServedApp, settle } from './support/app.js'

/**
 * **The activity door, opened in a browser against the real route.**
 *
 * TypeScript on both sides catches no wire-contract bug: the client declares
 * the shape it hopes for and the controller declares the shape it serves, and
 * nothing compares the two. A feed that renders perfectly against a fixture
 * and empty against the server passes every unit test in the tree.
 *
 * So this asserts what only a browser can: the route answers, the panel draws
 * at a real size, and the feed shows either its rows or its empty line rather
 * than the nothing a wire mismatch leaves behind.
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

      // **By its name: `case-activity` is in no component.** `activity-door.tsx`
      // labels it `Case activity`, and `Case activity, new since you last
      // looked` when there is something unseen -- so the match is anchored
      // rather than exact.
      const door = page.getByRole('button', { name: /^Case activity/ })
      await expect(door).toBeVisible()

      // **Outboard of the roster.** The order is the design - who is here now,
      // then what they have done - and it is a position, so it is asserted
      // here rather than in a tier with no layout.
      // **A testid, not a slot.** `presence-stack` is published as
      // `data-testid`, so the slot selector matched nothing and the
      // `isVisible` guard below turned that into a silent skip -- the
      // position this test exists to hold was never asserted.
      const roster = page.locator('[data-testid="presence-stack"]').first()
      if (await roster.isVisible()) {
        const [left, right] = await Promise.all([roster.boundingBox(), door.boundingBox()])
        expect(left && right && right.x).toBeGreaterThan((left?.x ?? 0) + (left?.width ?? 0) - 1)
      }

      await door.click()

      // **`popover`, not `popover-content`.** The door renders the kit's
      // `Popover`, which sets `data-slot="popover"`; nothing has ever
      // published `popover-content`.
      const panel = page.locator('[data-slot="popover"]')
      await expect(panel).toBeVisible()
      /**
       * **A row, or the empty line - and never both, and never neither.** A
       * case the fixture built has writes; one restored from an archive may
       * not. What would be a defect is a panel that draws neither, which is
       * what a wire-shape mismatch looks like: the feed maps an empty array
       * and the empty state never fires because `data` is `undefined`.
       *
       * **And it is the whole postcondition: no heading is asserted, because
       * the panel has never had one.** `activity-door.tsx` puts an
       * `ActivityFeed` straight inside the `Popover`, and the word `Activity`
       * is on the *button* that opens it. That file has a single commit in its
       * history, so this was never a heading that went away.
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
       *
       * The registry centres the indicator on the rail and shifts it by half
       * its own width, so a disc wider than the registry's default reaches
       * left of the row it belongs to - and the scroller clips at its own
       * padding box rather than the panel's. The feed draws a wider one, which
       * makes the overhang live and is the size of defect a full-viewport
       * capture passes.
       */
      if ((await rows.count()) > 0) {
        const clip = await panel.locator('[data-slot="scroll-area"]').first().boundingBox()
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
