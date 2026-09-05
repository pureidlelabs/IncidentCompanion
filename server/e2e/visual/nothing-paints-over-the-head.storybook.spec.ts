/**
 * A sticky toolbar stands in front of the rows and in front of nothing else.
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
