/**
 * **The Health pane, end to end.**
 *
 * The unit tests feed the pane fixtures, so they prove it renders what it is
 * given and nothing about whether the two routes behind it answer or whether
 * the shapes agree. This walks the whole chain - rail row, both requests, the
 * numbers on screen - which is the seam a wire mismatch hides in: a client
 * field the server does not serve reads as an empty screen rather than as a
 * mismatch.
 */
import { expect, test } from '@playwright/test'

import { ADMIN, ANALYST, asPersona, ensureAnalyst, settle } from './support/app.js'

test.beforeAll(async ({ browser, baseURL }) => {
  await ensureAnalyst(browser, baseURL ?? '')
})

test('the health pane reports the install, from both routes', async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await asPersona(browser, ADMIN)
  try {
    await page.getByRole('button', { name: 'Health' }).click()
    await settle(page, 8000)

    // Serving: the roster names every dependency, not only the unwell ones.
    // `.first()` because Postgres is named twice by design - once as a status
    // tile, once as the heading of the section holding its own figures.
    await expect(page.getByText('Postgres').first()).toBeVisible()
    await expect(page.getByText('Redis').first()).toBeVisible()

    /**
     * **The database section says which machine it is.** Every figure under
     * "This server" is the app server's host, and reading a low disk figure
     * there against a large database below is the wrong conclusion the moment
     * they are two machines.
     */
    // Exact, because "Memory on this machine" is a different sentence that
    // happens to contain the same words.
    await expect(page.getByText(/^(this machine|elsewhere|unknown)$/).first()).toBeVisible()

    /**
     * **The count is the assertion**, because a pane that rendered its
     * headings and none of its figures - the shape a failed request takes -
     * satisfies every text check above it.
     *
     * **The expected count comes from what the route answered, not a literal.**
     * `disk` is null until the evidence directory exists, so a hardcoded 5
     * asserts the shape of *this* machine and goes red on any tree that has
     * never written a file.
     */
    const resources = (await (await page.request.get('/api/health/resources')).json()) as {
      disk: unknown
    }
    // **`[role~="meter"]`, a token match, not `[role="meter"]`.** React Aria
    // renders `role="meter progressbar"` on purpose: Firefox does not support
    // the `meter` role at all and Chrome falls back, so the element names both
    // and lets the browser take the first it knows. An exact attribute match
    // finds none of them, and the failure reads as the pane not rendering.
    await expect(page.locator('[role~="meter"]')).toHaveCount(resources.disk === null ? 4 : 5)

    /**
     * **Every meter has a real value.** `aria-valuenow` absent or NaN is what
     * a field the server stopped sending looks like from here, and the bar
     * still draws at zero width, which reads as "nothing in use".
     */
    const values = await page
      .locator('[role~="meter"]')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('aria-valuenow'))))
    expect(values.every((value) => Number.isFinite(value))).toBe(true)

    await expect(page.getByRole('table', { name: /tables holding rows/i })).toBeVisible()
    await expect(page.getByText('Rows \u2248')).toBeVisible()

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    )
    expect(sideways, 'the health pane scrolls sideways').toBe(false)
  } finally {
    await context.close()
  }
})

/**
 * **An analyst sees it too, and that is a decision rather than an oversight.**
 * Nothing here is an install secret: the disk figure carries no path, the
 * dependency roster is what the banner already tells everyone, and an analyst
 * who can see the app is unwell stops filing tickets about a slow screen.
 */
test('an analyst can read it, and it holds no path', async ({ browser }) => {
  test.setTimeout(120_000)
  const { context, page } = await asPersona(browser, ANALYST)
  try {
    await page.getByRole('button', { name: 'Health' }).click()
    await settle(page, 8000)

    await expect(page.locator('[role~="meter"]').first()).toBeVisible()

    const shown = await page.locator('main').innerText()
    expect(shown, 'the health pane leaked a filesystem path').not.toMatch(/\/(Users|home|var)\//)
  } finally {
    await context.close()
  }
})
