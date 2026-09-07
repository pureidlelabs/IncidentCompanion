/**
 * A canvas overlay does not take the toolbar's presses.
 *
 * **The canvas stacks four absolutely positioned layers over its drawing**, and
 * three of them - the toolbar, the legend and the status line - are
 * `pointer-events-none` with their children switched back on. The overlay is
 * the fourth, it is `inset-0` so it spans the whole canvas, and it sits above
 * the rest. An empty state handed to it is a message, not a surface anyone
 * clicks, and covering the toolbar with one leaves every control drawn,
 * enabled and unpressable.
 *
 * **Only a browser can see this.** jsdom lays nothing out, so a unit test
 * finds the toolbar's button by role whatever is stacked on top of it. A story
 * `play` cannot see it either: `userEvent` dispatches at the element it was
 * given rather than at a point, so it never asks what is actually under the
 * pointer. This asks the document.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/an-overlay-does-not-cover-the-toolbar.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/** The empty graph wearing the frame a screen gives it: toolbar and overlay. */
const STORY = 'blocks-layout-incident-canvas--overlaid-empty'

async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 10_000 })
}

test.describe('an overlaid canvas', () => {
  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('leaves the toolbar reachable under the pointer', async ({ page }) => {
    await openStory(page, STORY)

    const button = page.getByRole('button', { name: 'Fit to the pane' })
    await expect(button, 'the story drew no toolbar').toBeVisible()
    await expect(page.locator('[data-slot="canvas-overlay"]'), 'the story drew no overlay').toBeVisible()

    /**
     * **What the document says is at that point**, not what the locator
     * resolves to. A covered button is still visible, still enabled and still
     * the thing `getByRole` returns; the only reading that changes is this
     * one.
     */
    const onTop = await button.evaluate((node) => {
      const box = node.getBoundingClientRect()
      const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return at === node || node.contains(at) ? 'the button' : (at?.getAttribute('data-slot') ?? at?.tagName ?? 'nothing')
    })
    expect(onTop, 'something is stacked over the toolbar button').toBe('the button')

    // And it takes a real press, which is the thing an analyst does.
    await button.click({ timeout: 5_000 })
  })
})
