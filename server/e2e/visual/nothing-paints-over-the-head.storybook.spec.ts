/**
 * A sticky toolbar covers nothing that sits above it while it is at rest.
 *
 * **No other tier can see this.** The element doing the covering is a `::before`
 * pseudo, which has no node, so a DOM query cannot find it and jsdom has no
 * geometry to compare anyway. What settles it is asking the browser which
 * element paints at a point: `elementsFromPoint` returns the pseudo's
 * originating element, so a bar whose own box starts lower and still answers
 * first is painting outside itself.
 *
 * The defect it holds: a sticky offset is measured from the scrollport's
 * *padding* edge, so a bar at `top-0` inside a padded scroller sticks below the
 * scrollport's true top and rows scroll through the strip above it. Covering
 * that strip with a band above the bar fixes the stuck case and breaks the
 * resting one, because no selector distinguishes the two.
 *
 * **Only the resting half is asserted here, and it is half.** A bar covering
 * nothing at rest is equally satisfied by a bar covering nothing at all, so
 * the stuck case needs its own claim -- and no story draws a filter bar inside
 * a scrolling pane, so this tier cannot make it. What the stuck case rests on
 * is the pane not putting its inset on the scroller, which is asserted from
 * the source in `ui/src/a-sticky-offset-measures-from-the-scrollport.rule.test.ts`.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/nothing-paints-over-the-head.storybook.spec.ts
 * ```
 */
import { expect, test } from '@playwright/test'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

/** Stories drawing a sticky filter bar under a section head. */
const STORIES = [
  'blocks-report-index--dense',
  'blocks-report-index--populated',
  'screens-case-timeline--populated',
]

async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

test.describe('a sticky toolbar at rest', () => {
  test.beforeAll(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook answering at ${SB}`)
  })

  for (const id of STORIES) {
    test(`${id} covers no text above it`, async ({ page }) => {
      await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
        waitUntil: 'load',
        timeout: 20_000,
      })
      // Long enough for a loaded machine: inside a full sweep the browsers and
      // the dev server compete, and a check failing on how busy the host is
      // reports nothing about what was painted.
      await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
      await page.locator('[data-slot="filter-bar"]').first().waitFor({ timeout: 30_000 })

      const covered = await page.evaluate(() => {
        const bar = document.querySelector('[data-slot="filter-bar"]')
        if (bar === null) return { error: 'no filter-bar in this story' }
        const barTop = bar.getBoundingClientRect().top

        // Every text leaf that ends above the bar. Each is sampled at a point
        // inside itself: if the bar answers there, the bar is drawn over it.
        const hits: string[] = []
        for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,a,label')) {
          if (bar.contains(el)) continue
          if (el.querySelector('*') !== null) continue
          const text = (el.textContent ?? '').trim()
          if (text === '') continue
          const box = el.getBoundingClientRect()
          if (box.height === 0 || box.top >= barTop) continue

          const at = { x: box.left + 4, y: box.bottom - 2 }
          const painted = document.elementsFromPoint(at.x, at.y)[0]
          if (painted !== undefined && (painted === bar || bar.contains(painted))) {
            hits.push(`${text.slice(0, 40)} (${String(Math.round(box.top))}-${String(Math.round(box.bottom))})`)
          }
        }
        return { hits }
      })

      expect(covered.error, 'the story must draw a filter bar for this to mean anything').toBeUndefined()
      expect(covered.hits, 'the toolbar is painted over text that sits above it').toEqual([])
    })

  }
})
