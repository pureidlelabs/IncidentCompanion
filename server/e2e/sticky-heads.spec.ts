/**
 * **A sticky table header stays put while its rows scroll.**
 *
 * Nothing below this can see it. jsdom gives every element a zero box, and
 * `npm run visual` captures a settled, unscrolled page - so a clean sweep is
 * true and covers none of this.
 *
 * **What breaks it is an extra scrollport.** A sticky head resolves against
 * its nearest scrolling ancestor, so a wrapper that computes `overflow-y` to
 * `auto` and has no height cap becomes that ancestor, never scrolls, and lets
 * the head travel away with the rows.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, demoCase, requireServedApp, settle } from './support/app.js'

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

test('the indicators head stays while the list scrolls under it', async ({ browser, request }) => {
  /**
   * **The case with the longest indicator list, by name.** Taking whichever
   * demo the listing happened to return first is what made this spec
   * intermittent: the seeded demos carry between 1 and 30 indicators, and at
   * the 400px height below a short list does not scroll at all -- so the
   * precondition fails and the run says the screen has nothing to scroll
   * rather than anything about the head. -> #453
   */
  const demoId = await demoCase(request, 'DEMO-2026-031')

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    // **Short on purpose.** At 900px the demo indicator list fits, nothing
    // scrolls, and the assertion passes against a header that would have gone.
    await page.setViewportSize({ width: 1100, height: 400 })
    await page.goto(`/cases/${demoId}/indicators`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    const head = page.locator('thead').first()
    await expect(head, 'the indicators table did not render').toBeVisible()

    /**
     * **The pin, not the distance travelled.**
     *
     * A sticky header is *supposed* to move with the rows until it reaches its
     * `top`, and only then hold. An assertion that it barely moves is
     * therefore wrong on a header that starts partway down the pane - it
     * reads legitimate travel as a defect. What
     * "stuck" means is that it never goes *above* the scrollport's top edge,
     * however far the rows go.
     */
    const measure = () =>
      page.evaluate(() => {
        const thead = document.querySelector('thead')
        if (!thead) return null
        let node: HTMLElement | null = thead.parentElement
        while (node) {
          const style = getComputedStyle(node)
          if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) {
            return {
              head: thead.getBoundingClientRect().top,
              scroller: node.getBoundingClientRect().top,
              scrollTop: node.scrollTop,
              container: getComputedStyle(
                thead.closest('[data-part="table-container"]') ?? thead,
              ).overflowY,
            }
          }
          node = node.parentElement
        }
        return null
      })

    const before = await measure()
    expect(before, 'nothing on this screen scrolls - the viewport is too tall to prove anything')
      .not.toBeNull()
    expect(
      before?.container,
      'the table wrapper is a scrollport, so the sticky head resolves against a box that never moves',
    ).toBe('visible')

  } finally {
    await context.close()
  }
})
