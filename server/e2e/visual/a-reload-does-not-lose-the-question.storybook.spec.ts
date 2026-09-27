import { expect, test } from '@playwright/test'

import { askDespiteNavigation } from './storybook-lifecycle.js'

/**
 * A navigation landing inside a bounded evaluate does not lose the answer.
 *
 * `whyThePreviewScriptFailed` holds an evaluate open for up to five seconds on
 * purpose, and Storybook reloads the preview whose script failed. On a loaded
 * machine that reload lands inside the window and the evaluate throws instead
 * of answering -- load from outside the run, since this tier is `workers: 1`.
 * -> #1037
 *
 * It rides the kit tier rather than needing it: the tier boots Storybook for
 * every run and this opens none, but the app tier's launcher raises Postgres,
 * Redis and Nest, which is the more expensive place to sit.
 *
 * Driven here rather than waited for: the real race needs a loaded machine,
 * and a test that only fails under load is one nobody can act on.
 */
test.describe('a reload does not lose the question', () => {
  test('re-asks when a navigation destroys the context mid-answer', async ({ page }) => {
    await page.goto('about:blank')

    let asked = 0
    const answer = await askDespiteNavigation(page, async () => {
      asked += 1
      // The first ask is interrupted the way Storybook interrupts one: a
      // navigation begun while the evaluate is still waiting.
      // A query rather than a fragment: a fragment change keeps the context.
      if (asked === 1) void page.goto('about:blank?reloaded=1')
      return page.evaluate(
        async () => new Promise<string>((done) => setTimeout(() => done('answered'), 1_000)),
      )
    })

    expect(asked, 'the first ask was lost to the navigation and a second was made').toBe(2)
    expect(answer, 'the question survived the reload').toBe('answered')
  })

  test('lets anything else through rather than asking again', async ({ page }) => {
    await page.goto('about:blank')

    let asked = 0
    await expect(
      askDespiteNavigation(page, async () => {
        asked += 1
        await Promise.resolve()
        throw new Error('something else entirely')
      }),
    ).rejects.toThrow(/something else entirely/)
    expect(asked, 'a retry here would hide a real failure').toBe(1)
  })
})
