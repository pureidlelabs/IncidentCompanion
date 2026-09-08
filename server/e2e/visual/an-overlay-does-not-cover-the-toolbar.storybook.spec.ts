/**
 * A canvas overlay does not take the presses of the layers it spans.
 *
 * **The canvas stacks four absolutely positioned layers over its drawing.**
 * Three of them - the toolbar, the legend and the status line - are anchored
 * to a corner. The fourth is the overlay, and it is `inset-0`, so it spans all
 * three. An empty state handed to it is a message rather than a surface
 * anyone presses, and covering the others with one leaves their controls
 * drawn, enabled and unpressable.
 *
 * **Every control in the frame, not a named one.** The defect reached the four
 * toolbar buttons and the status line's count, which is the only door to the
 * entities the drawing cannot show - so this asks the document about each
 * control it finds rather than about a list written here, and about the
 * overlay's own action too. A layer that keeps its presses by refusing
 * everybody else's has moved the defect rather than fixed it.
 *
 * **Only a browser can see this.** jsdom lays nothing out, so a unit test
 * finds every one of these by role whatever is stacked over it. A story `play`
 * cannot see it either: `userEvent` dispatches at the element it was given
 * rather than at a point, so it never asks what is actually under the pointer.
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

/**
 * The screen's own empty case, which is the arrangement this is about: the
 * toolbar and the legend under an overlay that spans both, and an
 * `EmptyState` carrying the link out to the Timeline.
 *
 * **Not `Entities no entry names`**, which draws the richer frame - a status
 * line as well - but whose `play` presses the count and leaves the canvas for
 * the node list, so what this reads is whichever of the two won the race.
 */
const STORY = 'screens-correlate-investigation-graph--empty'

/** The layers the overlay spans, whichever of them a given case draws. */
const UNDER = ['canvas-toolbar', 'canvas-legend', 'canvas-status']

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
    test.skip(
      !(await storybookIsUp()),
      `no Storybook at ${SB} - run \`cd ui && npm run storybook\``,
    )
  })

  test('leaves every control in the frame under the pointer', async ({ page }) => {
    await openStory(page, STORY)

    await expect(
      page.locator('[data-slot="canvas-overlay"]'),
      'the story drew no overlay',
    ).toBeVisible()
    await expect(
      page.locator('[data-slot="canvas-toolbar"]'),
      'the story drew no toolbar',
    ).toBeVisible()

    /**
     * **What the document says is at that point**, not what the locator
     * resolves to. A covered control is still visible, still enabled and still
     * what `getByRole` returns; this is the only reading that changes.
     */
    const reachable = await page.evaluate(
      (slots) => {
        const found: { layer: string; name: string; onTop: string }[] = []
        for (const slot of slots) {
          const layer = document.querySelector(`[data-slot="${slot}"]`)
          if (!layer) continue
          for (const control of layer.querySelectorAll(
            'a, button, [role="button"], [role="link"]',
          )) {
            const box = control.getBoundingClientRect()
            if (box.width === 0 || box.height === 0) continue
            const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            found.push({
              layer: slot,
              name: (control.getAttribute('aria-label') ?? control.textContent ?? '')
                .trim()
                .slice(0, 40),
              onTop:
                at === control || control.contains(at)
                  ? 'itself'
                  : (at?.closest('[data-slot]')?.getAttribute('data-slot') ??
                    at?.tagName ??
                    'nothing'),
            })
          }
        }
        return found
      },
      [...UNDER, 'canvas-overlay'],
    )

    /**
     * **Both sides of it, or this asserts half.** A layer that keeps its own
     * presses by taking everybody else's has moved the defect rather than
     * fixed it, so the overlay's own action has to be in the list too - and a
     * run that found no controls at all satisfies the last check on its own.
     */
    expect(
      reachable.filter((control) => UNDER.includes(control.layer)).length,
      'the story drew no controls under the overlay, so this asserted nothing',
    ).toBeGreaterThan(3)
    expect(
      reachable.filter((control) => control.layer === 'canvas-overlay').length,
      'the overlay carried no control of its own, so this asserted nothing',
    ).toBeGreaterThan(0)
    expect(
      reachable.filter((control) => control.onTop !== 'itself'),
      'something is stacked over these',
    ).toEqual([])

    // And each takes a real press, which is the thing an analyst does.
    for (const slot of [...UNDER, 'canvas-overlay']) {
      const controls = page.locator(`[data-slot="${slot}"]`).locator('a, button')
      for (let i = 0; i < (await controls.count()); i += 1) {
        await controls.nth(i).hover({ timeout: 5_000 })
      }
    }
  })
})
