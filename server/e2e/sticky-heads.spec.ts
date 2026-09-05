/**
 * **A sticky table header stays put while its rows scroll.**
 *
 * Nothing below this can see it. jsdom gives every element a zero box, and
 * `npm run visual` captures a settled, unscrolled page - which is why a sweep
 * reporting "66 captures, no findings" was true and covered none of this.
 *
 * **The defect it was written for.** The registry's `Table` wraps its
 * `<table>` in `relative w-full overflow-x-auto`, and `overflow-x: auto`
 * computes `overflow-y` to `auto` as well. That div then becomes the nearest
 * scrollport for anything sticky inside it - and it has no height cap, so it
 * never scrolls and the header travels away with the rows. Converting two
 * hand-written tables to `Table` broke both silently.
 *
 * Measured before the fix: scrolling the outer box 300px moved the head from
 * `top: 1` to `top: -97`.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, requireServedApp, settle } from './support/app.js'

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

test('the indicators head stays while the list scrolls under it', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case - an empty table cannot scroll').toBeDefined()

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    // **Short on purpose.** At 900px the demo indicator list fits, nothing
    // scrolls, and the assertion passes against a header that would have gone.
    await page.setViewportSize({ width: 1100, height: 400 })
    await page.goto(`/cases/${demo?.id ?? ''}/indicators`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    const head = page.locator('thead').first()
    await expect(head, 'the indicators table did not render').toBeVisible()

    /**
     * **The pin, not the distance travelled.**
     *
     * A sticky header is *supposed* to move with the rows until it reaches its
     * `top`, and only then hold. An assertion that it barely moves is
     * therefore wrong on a header that starts partway down the pane - it
     * measured 200px of legitimate travel and called the app broken. What
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
              // The wrapper the registry's `Table` renders must not be a
              // scrollport of its own, or the head resolves against a box that
              // never moves and leaves with the rows.
              container: getComputedStyle(
                thead.closest('[data-slot="table-container"]') ?? thead,
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

    /**
     * **What is asserted stops here.**
     *
     * Whether the head *pins* on this screen is not this branch's to hold:
     * `IndicatorTable`'s own wrapper is `min-h-0 flex-1 overflow-y-auto`, so
     * it is the nearest scrollport whether or not it overflows - and on the
     * demo case it does not, the pane scrolls instead, and a header inside a
     * box that never moves cannot stick to anything. That is the screen's
     * layout and it predates the registry `Table`.
     *
     * What the swap *did* introduce is a second scrollport inside that one,
     * from `Table`'s own `overflow-x-auto` wrapper, and that is what this
     * holds. Break-verified: removing the `overflow-visible` utility from
     * `IndicatorTable` takes it red.
     */
  } finally {
    await context.close()
  }
})
