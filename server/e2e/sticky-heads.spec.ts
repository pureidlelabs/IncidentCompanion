/**
 * **A sticky table header stays put while its rows scroll.**
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
     */
  } finally {
    await context.close()
  }
})
