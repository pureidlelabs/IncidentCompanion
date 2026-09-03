/**
 * A table's own controls stay on screen while its rows scroll.
 *
 * **No other tier can see this.** jsdom gives every element a zero box and no
 * scrollport, so nothing there can tell a head that travels with the rows from
 * one that stays; the arrangement is a fact about which box scrolls.
 *
 * The defect it holds: a `Section` that does not `fill` lets the *pane* scroll,
 * so the head carrying the add door and the toolbar carrying the search both
 * travel with the rows. The column heads are sticky against that same pane and
 * survive alone -- which leaves an analyst reading a long table under a header
 * with nothing on it to act on. Reported twice, from the timeline and from the
 * entities table.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/controls-outlast-the-scroll.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

/** Screens whose section holds a table long enough to scroll. */
const STORIES = ['screens-collect-all-entities--in-the-shell', 'screens-case-timeline--in-the-shell']

async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

async function openStory(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load', timeout: 20_000 })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[data-slot="section-body"]').first().waitFor({ timeout: 30_000 })
}

test.describe('a table keeps its controls while the rows move', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeAll(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook answering at ${SB}`)
  })

  for (const id of STORIES) {
    test(`${id} keeps its head and toolbar on screen`, async ({ page }) => {
      await openStory(page, id)

      const measure = async () =>
        page.evaluate(() => {
          const pane = document.querySelector('[data-slot="pane-scroll"]')
          const body = document.querySelector('[data-slot="section-body"]')
          if (pane === null || body === null) return { error: 'no pane or no section body' }
          const port = pane.getBoundingClientRect()
          const seen = (sel: string) => {
            const el = pane.querySelector(sel)
            if (el === null) return null
            const box = el.getBoundingClientRect()
            return box.bottom > port.top && box.top < port.bottom
          }
          return {
            // The rows have to actually move, or this passes over nothing.
            travel: Math.round(body.scrollHeight - body.clientHeight),
            head: seen('[data-slot="section-head"]'),
            toolbar: seen('[data-slot="table-toolbar"]'),
          }
        })

      const before = await measure()
      expect(before.error).toBeUndefined()
      expect(before.travel ?? 0, 'the story has too few rows to scroll').toBeGreaterThan(200)

      await page.evaluate(() => {
        const body = document.querySelector('[data-slot="section-body"]')
        if (body !== null) body.scrollTop = body.scrollHeight
      })
      await page.waitForTimeout(300)

      const after = await measure()
      expect(after.head, 'the section head scrolled out of reach with the rows').toBe(true)
      // A screen drawing no toolbar is not a failure; one drawing it and
      // losing it is.
      if (before.toolbar === true) {
        expect(after.toolbar, 'the table toolbar scrolled out of reach with the rows').toBe(true)
      }
    })
  }
})
