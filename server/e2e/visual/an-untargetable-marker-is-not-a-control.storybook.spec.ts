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
 * **What this does not cover**: a control given `pointer-events: none` by
 * mistake, which is a real defect -- nobody can press it -- and which nothing
 * reports. The probe *can* tell a disabled control from this one, and does:
 * the exclusion asks `[disabled], .disabled, [aria-disabled="true"]` the way
 * `low-contrast` already did, so a dimmed control keeps its geometry checked.
 * What it cannot tell is an unclickable control that claims to be enabled.
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

  test('a disabled control keeps its geometry checked, though it takes no pointer either', async ({
    page,
  }) => {
    await openStory(page, STORY)

    // **The kit draws `isDisabled` with `pointer-events-none`**, so an
    // exclusion written on the property alone takes every dimmed control in the
    // product with it. A disabled button is painted at full size and can be
    // undersized, cut off or laid across its neighbour exactly as an enabled
    // one can. Injected rather than found, so the case does not depend on which
    // story happens to hold a disabled control today.
    await page.evaluate(() => {
      const dimmed = document.createElement('button')
      dimmed.type = 'button'
      dimmed.disabled = true
      dimmed.setAttribute('aria-label', 'A dimmed control')
      // A class the finding will carry: `name()` reports tag plus class, and
      // the story holds a real 16x16 button of its own, so a bare
      // "some small-target finding exists" assertion passes without this one.
      dimmed.className = 'dimmed-probe'
      dimmed.textContent = 'x'
      dimmed.style.cssText =
        'position:absolute;left:8px;top:8px;width:16px;height:16px;' +
        'pointer-events:none;opacity:0.5;font-size:8px'
      document.querySelector('#storybook-root')?.appendChild(dimmed)
    })

    const said = await findings(page)

    expect(
      said
        .filter((one) => one.kind === 'small-target' && one.what.includes('dimmed-probe'))
        .map(sayFinding),
      'a disabled control is dimmed, not absent: 16x16 is under the 24px floor whether or not it can be pressed',
    ).not.toEqual([])
  })

  test('the overlay anchor draws no target or overlap finding', async ({ page }) => {
    await openStory(page, STORY)

    // **The guard asserts the finding is live, not that the node exists.**
    // Three things have to hold before an absent `overlap` means anything: the
    // marker is painted at a size the probe measures at all (`paintedRect`
    // drops anything under 2x2, and the anchor falls back to `size-px` when the
    // story stops sizing it), it is painted over the button, and the two boxes
    // cross by more than the check's own 2px threshold. Assert all three, or a
    // story that merely moved the anchor passes this with the exclusion
    // reverted.
    // Waited for, not assumed: `#storybook-root` attaches before the story
    // renders into it, so reading the boxes straight after `openStory` is a
    // race that passes on a fast machine and reports `null` on a slow one.
    await page.locator('[data-part="overlay-anchor"]').waitFor({ state: 'attached', timeout: 20_000 })
    await page.locator('button[aria-label="A shape in the pane"]').waitFor({ timeout: 20_000 })

    const scene = await page.evaluate(() => {
      const marker = document.querySelector('[data-part="overlay-anchor"]')
      const button = document.querySelector('button[aria-label="A shape in the pane"]')
      if (!marker || !button) return null
      const a = marker.getBoundingClientRect()
      const b = button.getBoundingClientRect()
      return {
        marker: { w: a.width, h: a.height },
        overlapX: Math.min(a.right, b.right) - Math.max(a.left, b.left),
        overlapY: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
        untargetable: getComputedStyle(marker).pointerEvents === 'none',
        disabled: marker.closest('[disabled], .disabled, [aria-disabled="true"]') !== null,
      }
    })

    expect(scene, 'the story draws neither the marker nor the button it points at').not.toBeNull()
    const seen = scene as NonNullable<typeof scene>
    expect(seen.untargetable, 'the marker is the thing under test only while it takes no pointer').toBe(true)
    expect(seen.disabled, 'a disabled marker is excluded for a different reason, which would not test this').toBe(false)
    expect(
      Math.min(seen.marker.w, seen.marker.h),
      'a marker under 2x2 is dropped by `paintedRect` before the exclusion is reached',
    ).toBeGreaterThan(2)
    expect(
      Math.min(seen.overlapX, seen.overlapY),
      'the marker has to cross the button by more than the overlap threshold, or there is no finding to suppress',
    ).toBeGreaterThan(2)

    const said = await findings(page)
    const about = said.filter((one) => one.what.includes('pointer-events-none'))

    expect(
      about.map(sayFinding),
      'an element with `pointer-events: none` cannot be clicked, so it is neither a target nor a thing that can overlap one',
    ).toEqual([])
  })
})
