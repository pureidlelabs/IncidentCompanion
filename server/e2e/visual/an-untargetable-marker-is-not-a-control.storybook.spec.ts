/**
 * An element that cannot receive a click is not a click target.
 *
 * `OverlayAnchor` renders a `role="button"` span carrying `pointer-events-none`
 * and `tabIndex={-1}` -- a marker an overlay is positioned against, painted
 * over the thing it points at on purpose. The probe's control set matches
 * `[role="button"]`, so it counted the marker as a target: the deliberate
 * overlap read as two controls sitting on each other, and the marker's own box
 * as an undersized target. -> #197
 *
 * **`overlap` is the finding class read without argument**, which is what makes
 * noise in it expensive rather than merely untidy.
 *
 * **What this does not cover**: that a control given `pointer-events: none` by
 * mistake is still reported. Nothing reports that today, and the probe cannot
 * tell that case from this one.
 *
 * ```bash
 * cd server && npx playwright test --config=e2e/playwright.kit.config.ts \
 *   e2e/visual/an-untargetable-marker-is-not-a-control.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { brokenPreview } from './storybook-lifecycle.js'
import { STORYBOOK_URL } from './storybook-url.js'
import { findings, sayFinding } from './view.js'

const SB = STORYBOOK_URL

/** The story the false findings were measured on. */
const STORY = 'components-overlayanchor--anchored'

/** Whether a Storybook is listening, asked once. */
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
    timeout: 30_000,
  })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  expect(await brokenPreview(page), `Storybook did not render ${id}`).toBeNull()
}

test.describe('a marker nobody can click is not a target', () => {
  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('the overlay anchor draws no target or overlap finding', async ({ page }) => {
    await openStory(page, STORY)

    // **The vacuity guard.** Without it a story that stopped rendering the
    // anchor at all would pass this by having nothing to report.
    await expect(
      page.locator('[data-part="overlay-anchor"]'),
      'the marker has to be on the page for its absence from the findings to mean anything',
    ).toHaveCount(1)

    const said = await findings(page)
    const about = said.filter((one) => one.what.includes('pointer-events-none'))

    expect(
      about.map(sayFinding),
      'an element with `pointer-events: none` cannot be clicked, so it is neither a target nor a thing that can overlap one',
    ).toEqual([])
  })
})
