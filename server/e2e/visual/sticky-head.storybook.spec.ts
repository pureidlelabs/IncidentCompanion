/**
 * A column head is stuck to the box that actually scrolls its rows.
 *
 * **No other tier can see this.** jsdom gives every element a zero box and no
 * `position`, so a unit test asking whether the head is sticky reads the class
 * and learns nothing.
 *
 * The defect it holds: at `scroll="page"` the table wraps its grid in an
 * `overflow-x-auto` box. A box with overflow on one axis is a scroll container
 * on **both** -- CSS computes the `visible` axis to `auto` whenever the other
 * is not `visible` -- so the head's nearest scrollport becomes that wrapper,
 * which has a content-fitting height and never scrolls vertically. A sticky
 * element in a box that does not scroll simply travels with it, and the head
 * rides the rows off the top.
 *
 * **The invariant is asserted, not the distance.** A scroll-distance check
 * reads whatever the story's data happens to make: measured on
 * `screens-collect-all-entities--in-the-shell` at 1400x900, the pane scrolls
 * 96px against a head sitting 227px down it, so the head is never asked to
 * stick and the reading says nothing whatever the head does. What is true
 * regardless of how many rows a fixture holds is that the box a head sticks to
 * has to be the box its rows scroll in.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/sticky-head.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/** Screens whose tables are drawn at `scroll="page"` inside the shell. */
const STORIES = ['screens-collect-all-entities--in-the-shell', 'blocks-report-index--dense']

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
    timeout: 20_000,
  })
  // Long enough for a loaded machine: inside a full sweep a dozen browsers and
  // the dev server compete, and a check that fails on how busy the host is
  // reports nothing about the layout.
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[data-slot="table-header"]').first().waitFor({ timeout: 30_000 })
}

/**
 * The nearest ancestor a sticky head would stick to, and whether that box has
 * anything to scroll.
 */
async function scrollportOf(page: Page) {
  return page.evaluate(() => {
    const head = document.querySelector('[data-slot="table-header"]')
    if (!(head instanceof HTMLElement)) throw new Error('the table drew no head')
    if (getComputedStyle(head).position !== 'sticky') {
      return { sticky: false, cls: '', slot: '', canScrollBy: 0 }
    }
    for (let node = head.parentElement; node; node = node.parentElement) {
      const s = getComputedStyle(node)
      const scrollport =
        ['auto', 'scroll'].includes(s.overflowY) || ['auto', 'scroll'].includes(s.overflowX)
      if (!scrollport) continue
      return {
        sticky: true,
        cls: String(node.className).slice(0, 60),
        slot: node.dataset.slot ?? '',
        canScrollBy: node.scrollHeight - node.clientHeight,
      }
    }
    // No scrollport ancestor: the head sticks to the viewport, and what
    // scrolls is the document. A block story outside the shell is that shape.
    const doc = document.documentElement
    return {
      sticky: true,
      cls: 'document',
      slot: 'document',
      canScrollBy: doc.scrollHeight - doc.clientHeight,
    }
  })
}

test.describe('a column head is stuck to the box its rows scroll in', () => {
  // The config sets no viewport, and the shell wants a real one.
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  for (const story of STORIES) {
    test(`${story} sticks its head to something that scrolls`, async ({ page }) => {
      await openStory(page, story)
      const port = await scrollportOf(page)

      // A head that is not sticky at all asserts nothing about where it sticks,
      // and would pass the reading below by being absent from the question.
      expect(port.sticky, 'the column head is not sticky at all').toBe(true)

      expect(
        port.canScrollBy,
        `the head sticks to ${port.slot || port.cls}, which has nothing to scroll -- so it rides the rows away instead of staying`,
      ).toBeGreaterThan(0)
    })
  }
})
