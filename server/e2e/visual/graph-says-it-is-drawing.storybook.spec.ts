/**
 * The graph says it is drawing, rather than drawing nothing.
 *
 * The engine arrives as a lazy chunk, so between the frame mounting and the
 * drawing appearing there is a window whose length is the network's. In it the
 * canvas renders its chrome complete and confident -- the kind chips, the node
 * count, the legend, the brush -- around an empty host. That reads as a case
 * whose entities do not draw, which is the one wrong answer this pane can give:
 * `canvas-empty` beside it exists precisely because *an empty case, a layout
 * that threw and a build that returned early all look identical*.
 *
 * **Only this tier can hold that window open.** The story tier gets the engine
 * immediately, so the state under test never occurs there; here the chunk is
 * delayed deliberately.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/graph-says-it-is-drawing.storybook.spec.ts
 * ```
 */
import { expect, test } from '@playwright/test'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

const STORY = 'screens-correlate-investigation-graph--dense'

/** Whether a Storybook is listening, asked once. */
async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

test.describe('the graph says it is drawing', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('names the wait while the engine is still arriving', async ({ page }) => {
    await page.route('**/*', async (route) => {
      if (/cytoscape/i.test(route.request().url())) {
        await new Promise((resolve) => setTimeout(resolve, 12_000))
      }
      await route.continue()
    })

    await page.goto(`${SB}/iframe.html?id=${STORY}&viewMode=story`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })

    const host = page.locator('[data-slot="graph-canvas"]')
    await host.waitFor({ timeout: 15_000 })

    // The precondition: the drawing has genuinely not arrived. Without this a
    // run where the chunk was cached would assert over a graph already drawn.
    await expect
      .poll(async () => host.evaluate((node) => node.children.length), { timeout: 5_000 })
      .toBe(0)

    await expect(
      page.locator('[data-slot="canvas-drawing"]'),
      'the pane draws nothing and says nothing while the engine is on its way',
    ).toBeVisible()
  })
})
