/**
 * **Dragging a report section into place.**
 *
 * jsdom cannot see this at all: dnd-kit resolves a drop from measured rects
 * and every element there has a zero box, so a simulated drag finds no target
 * and the move silently does nothing. `reorder-grip.test.tsx` holds the half
 * that tier *can* see - the grip exists, is named, and the sections stay list
 * items. This holds the half it cannot.
 *
 * **The keyboard route is asserted rather than the pointer one.** dnd-kit's
 * keyboard sensor is the same code path to the same commit, it is the route an
 * analyst who cannot drag has, and it does not depend on synthesising pointer
 * moves at the right pixel.
 */
import { expect, test, type Page } from '@playwright/test'

import { ADMIN, asPersona, requireServedApp, settle } from './support/app.js'

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

/**
 * The grip's accessible name.
 *
 * **`Drag`, because React Aria names the drag button itself.** `SortableItem`
 * deliberately gives it no `aria-label` -- *"React Aria names the drag button
 * after the row's own text, and an explicit label would win and say less"* --
 * and what it produces is `Drag <the row's text>`. The outline drew as a plain
 * `<ol>` until #381 was wired, so no grip had ever been named at all and this
 * pattern had never matched anything.
 */
/**
 * The keys React Aria's own live region names.
 *
 * **`Enter` to drop, not `Space`.** Measured against a wired outline with the
 * handler instrumented: a drop on `Space` never reaches `onReorder` at all,
 * and the same gesture ending in `Enter` fires it with a real target and posts
 * the order.
 *
 *     Space/ArrowDown/Space:  onReorder fired: (never)          POSTs=0
 *     Enter/ArrowDown/Enter:  onReorder fired: {"dropPosition":"before"}  POSTs=1
 *
 * The library says so itself, in the region this spec reads: *"Started
 * dragging. Press Tab to navigate to a drop target, then press Enter to drop,
 * or press Escape to cancel."* -> https://react-aria.adobe.com/dnd
 */
const DROP = 'Enter'

const GRIP = /^Drag /

/**
 * Take hold of the grip on the section at `index`, the way a keyboard reaches it.
 *
 * **A grip cannot be focused directly, and that is the collection working.**
 * `GridList` keeps a roving tabindex: every row but the focused one is
 * `tabindex="-1"`, so `locator.focus()` on a grip inside another row is pulled
 * back to the focused row and the drag never starts at all. Measured -- asking
 * for the fourth grip and pressing Enter left focus on the first row and
 * `onDragStart` never fired.
 *
 * So the route is the one a person has: the grid takes focus on its first row,
 * the arrow keys move between rows, and `keyboardNavigationBehavior="tab"` is
 * what makes Tab step into that row's own controls.
 */
async function takeGrip(page: Page, index: number): Promise<void> {
  await page.locator('[aria-label="Report sections"] [role="row"]').first().focus()
  for (let step = 0; step < index; step += 1) {
    await page.keyboard.press('ArrowDown')
    await settle(page, 200)
  }
  await page.keyboard.press('Tab')
  await settle(page, 250)
}


test('a section moves down one place, and the order is written', async ({ browser, request }) => {
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signedIn.ok(), 'the browser tier could not sign in').toBe(true)
  const cases = (await (await request.get('/api/cases')).json()) as
    { id: string; isDemo?: boolean }[]
  const demo = cases.find((row) => row.isDemo)
  expect(demo, 'no demo case - nothing here has a report with sections').toBeDefined()

  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/cases/${demo?.id ?? ''}/report`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    /**
     * **A report that has not been sent.** A sent report is superseded rather
     * than edited, and the server refuses the order with a 409 - which is
     * correct, and which reads here as a broken drag. The rail marks a sent one
     * with a SENT chip; this takes the first that has none.
     */
    /**
     * **By its row on the index, not by a rail anchor.** This asked for
     * `[data-testid="case-rail"] a[href*="report?report="]`, and the rail's
     * report rows are `onSelect` buttons rather than links -- so the selector
     * matched nothing and the spec never opened a report at all.
     */
    const draft = page.getByRole('row').filter({ hasText: 'Draft' }).first()
    await draft.waitFor({ state: 'visible', timeout: 15_000 })
    await draft.getByRole('button').first().click()
    await settle(page)

    /**
     * The section titles, in order.
     *
     * **Read off each row rather than from a heading input.** Only a *written*
     * section renders one, so a selector on the input measures the written
     * sections and calls every generated one absent.
     */
    const headings = () =>
      page.locator('[role="row"]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const input = node.querySelector('input[aria-label^="Heading for"]')
          if (input) return (input as HTMLInputElement).value
          return (node.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
        }),
      )

    const before = await headings()
    expect(before.length, 'the report drew no sections').toBeGreaterThan(2)

    /**
     * **The write, and that the server takes it.**
     *
     * The response is asserted as well as the request, which is what this test
     * is for. A drag that posts and is refused looks identical to one that
     * worked if only the request is checked - and the route does refuse an
     * order it will not take, which is correct and reads here as nothing at
     * all.
     */
    const posted = page.waitForRequest(
      (request_) =>
        request_.url().includes('/report_blocks/order') && request_.method() === 'POST',
      { timeout: 10_000 },
    )

    const rows = await page.locator('[role="row"]').evaluateAll((nodes) =>
      // **`data-key`, which React Aria writes from the item's `id`.** Measured
      // on a section row: data-slot, data-rac, data-collection, data-key,
      // role, aria-label. There is no `data-value` and there never was, so
      // this read answered null on every row. -> #381
      nodes.map((node) => node.getAttribute('data-key')),
    )
    const [first, second] = rows
    expect(first, 'no section carried its id').toBeTruthy()
    expect(second, 'the report drew one section').toBeTruthy()

    const grip = page.getByRole('button', { name: GRIP }).first()
    // **A tick between each press.** The drag measures on the frame after the
    // pickup is announced, so three presses in one turn is a pickup and two
    // keystrokes nothing sees, and the drop commits nothing. Without the waits
    // the request never fires.
    await takeGrip(page, 0)
    await expect(grip, 'the grip never took focus, so no drag could start').toBeFocused()
    await page.keyboard.press('Enter')
    await settle(page, 400)
    await page.keyboard.press('ArrowDown')
    await settle(page, 600)
    await page.keyboard.press(DROP)

    const request_ = await posted
    const body = JSON.parse(request_.postData() ?? '{}') as { ids?: string[] }
    const sent = body.ids ?? []
    expect(sent.length, 'the drop posted no order').toBeGreaterThan(0)

    const answer = await request_.response()
    expect(answer?.status(), 'the server refused the reorder').toBe(200)

    /**
     * **The whole permutation, not a pairwise ordering.**
     *
     * `indexOf(second) < indexOf(first)` is true of a move of one place, of
     * two, and of a fling to the bottom of the report - so a one-row drag that
     * sent a section five places away would pass it. What "moves down one
     * place" means is that exactly two neighbours swapped and nothing else
     * shifted.
     *
     * **Compared whole, not as a subsequence.** The posted list is this
     * report's blocks and no others, so it is the rows on screen in the order
     * asked for. Filtering it down to the screen first would pass a payload
     * that also carried a second report's ids.
     */
    const onScreen = rows.filter((id): id is string => id !== null)

    const expected = [...onScreen]
    const at = expected.indexOf(first as string)
    expected[at] = second as string
    expected[at + 1] = first as string

    expect(sent, 'more than the two neighbours moved').toEqual(expected)
  } finally {
    await context.close()
  }
})
