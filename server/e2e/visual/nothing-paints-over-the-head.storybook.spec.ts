/**
 * A sticky toolbar stands in front of the rows and in front of nothing else.
 *
 * **Two halves, and either alone is passed by a broken bar.** A bar that covers
 * nothing at rest is equally satisfied by a bar that covers nothing ever; a bar
 * that covers the strip when stuck is equally satisfied by one that covers the
 * heading as well. Both are asserted here, against the one story that puts a
 * bar inside a scroller -- `Blocks/Table/Filter bar / Stuck to a pane that
 * scrolls`, which exists because without it neither half could be measured.
 *
 * **No other tier can see either.** jsdom resolves no Tailwind class to a box,
 * and the element that did the covering was a `::before` pseudo, which has no
 * node for a DOM query to find. What settles the resting half is asking the
 * browser which element paints at a point: `elementsFromPoint` answers with the
 * pseudo's originating element, so a bar whose own box starts lower and still
 * answers first is painting outside itself.
 *
 * The defect they hold: a sticky offset is measured from the scrollport's
 * *padding* edge, so a bar at `top-0` in a pane inset by `--spacing-pane-y` pins
 * that far down and the rows scroll through the strip above it. Reaching that
 * strip by drawing upward from the bar covers it while stuck and paints over
 * the section head while resting, because no selector tells the two states
 * apart. Pulling the offset back by the inset is read only once the bar is
 * stuck, so it leaves the resting layout alone by construction.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/nothing-paints-over-the-head.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/** The story holding a bar inside a scroller, plus the screens that draw one. */
const IN_A_SCROLLER = 'blocks-table-filter-bar--in-a-pane-that-scrolls'
const RESTING = [
  IN_A_SCROLLER,
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

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  // Long enough for a loaded machine: inside a full sweep the browsers and the
  // dev server compete, and a check failing on how busy the host is reports
  // nothing about what was painted.
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[data-slot="filter-bar"]').first().waitFor({ timeout: 30_000 })
}

test.describe('a sticky toolbar', () => {
  test.beforeAll(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook answering at ${SB}`)
  })

  for (const id of RESTING) {
    test(`${id} covers no text above it while resting`, async ({ page }) => {
      await openStory(page, id)

      const covered = await page.evaluate(() => {
        const bar = document.querySelector('[data-slot="filter-bar"]')
        if (bar === null) return { error: 'no filter-bar in this story' }
        const barTop = bar.getBoundingClientRect().top

        // Every text leaf ending above the bar, sampled at a point inside
        // itself: if the bar answers there, the bar is drawn over it.
        const hits: string[] = []
        for (const el of document.querySelectorAll('h1,h2,h3,p,span,button,a,label')) {
          if (bar.contains(el)) continue
          if (el.querySelector('*') !== null) continue
          const text = (el.textContent ?? '').trim()
          if (text === '') continue
          const box = el.getBoundingClientRect()
          if (box.height === 0 || box.top >= barTop) continue

          const painted = document.elementsFromPoint(box.left + 4, box.bottom - 2)[0]
          if (painted !== undefined && (painted === bar || bar.contains(painted))) {
            hits.push(`${text.slice(0, 40)} (${String(Math.round(box.top))})`)
          }
        }
        return { hits }
      })

      expect(covered.error, 'the story must draw a filter bar to mean anything').toBeUndefined()
      expect(covered.hits, 'the toolbar is painted over text that sits above it').toEqual([])
    })
  }

  test('it pins flush to the scrollport once stuck', async ({ page }) => {
    await openStory(page, IN_A_SCROLLER)

    const stuck = await page.evaluate(() => {
      const bar = document.querySelector('[data-slot="filter-bar"]')
      if (bar === null) return { error: 'no filter-bar in this story' }

      let port: Element | null = bar.parentElement
      for (; port !== null; port = port.parentElement) {
        if (/auto|scroll/.test(getComputedStyle(port).overflowY)) break
      }
      if (port === null) return { error: 'the bar is in no scroll container' }

      port.scrollTop = port.scrollHeight
      return {
        scrolled: Math.round(port.scrollTop),
        gap: Math.round(bar.getBoundingClientRect().top - port.getBoundingClientRect().top),
      }
    })

    expect(stuck.error).toBeUndefined()
    // A reading taken without scrolling would pass over nothing at all.
    expect(stuck.scrolled ?? 0, 'the story has to scroll for this to say anything').toBeGreaterThan(
      0,
    )
    expect(stuck.gap, 'rows scroll through the strip the bar leaves above it').toBe(0)
  })
})
