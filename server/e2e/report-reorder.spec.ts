/**
 * **Dragging a report section into place.**
 *
 * jsdom cannot see this at all: dnd-kit resolves a drop from measured rects
 * and every element there has a zero box, so a simulated drag finds no target
 * and the move silently does nothing. `reorder-grip.test.tsx` holds the half
 * that tier *can* see - the grip exists, is named, and the sections stay list
 * items. This holds the half it cannot.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, asPersona, requireServedApp, settle } from './support/app.js'

test.beforeEach(async ({ baseURL }) => {
  await requireServedApp(baseURL ?? '')
})

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
     * **A report that has not been sent.**
     */
    const drafts = page.locator('[data-testid="case-rail"] a[href*="report?report="]').filter({
      hasNotText: /SENT/i,
    })
    await drafts.first().click()
    await settle(page)

    /**
     * The section titles, in order.
     */
    const headings = () =>
      page.locator('[role="listitem"]').evaluateAll((nodes) =>
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
     */
    const posted = page.waitForRequest(
      (request_) =>
        request_.url().includes('/report_blocks/order') && request_.method() === 'POST',
      { timeout: 10_000 },
    )

    const rows = await page.locator('[role="listitem"]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-value')),
    )
    const [first, second] = rows
    expect(first, 'no section carried its id').toBeTruthy()
    expect(second, 'the report drew one section').toBeTruthy()

    const grip = page.getByRole('button', { name: /^Reorder / }).first()
    // **A tick between each press.** dnd-kit's keyboard sensor announces the
    // pickup, then measures on the next frame; three presses in one turn is a
    // pickup and two keystrokes the sensor never sees, and the drop then
    // commits nothing. Measured - without these the request never fires.
    await grip.focus()
    await page.keyboard.press('Space')
    await settle(page, 400)
    await page.keyboard.press('ArrowDown')
    await settle(page, 600)
    await page.keyboard.press('Space')

    const request_ = await posted
    const body = JSON.parse(request_.postData() ?? '{}') as { ids?: string[] }
    const sent = body.ids ?? []
    expect(sent.length, 'the drop posted no order').toBeGreaterThan(0)

    const answer = await request_.response()
    expect(answer?.status(), 'the server refused the reorder').toBe(200)

    /**
     * **The whole permutation, not a pairwise ordering.**
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
