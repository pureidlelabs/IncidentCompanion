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
 * **A wheel gesture, not `scrollTop`, and the difference is a whole defect.**
 * Driving the body's `scrollTop` asks whether the body scrolls; an analyst
 * asks the browser to scroll and gets whatever the chain gives them. The
 * second reaches a case the first cannot: with the body a scrollport but not a
 * containing block, 50 visually-hidden spans laid out against the pane gave it
 * 3105px of its own overflow, so a wheel that ran the body out chained into
 * the pane and took the head 3029px off screen. Setting `scrollTop` on the
 * body reported that arrangement as sound.
 *
 * **The floor is on what can move, not on the body.** An earlier version
 * required `body.scrollHeight - body.clientHeight > 200` before asserting
 * anything, which is `0` on any tree where the section does not fill -- so the
 * precondition failed first, always, and the assertion naming the defect could
 * never run. That spec asserted "the body is a scrollport", which is the
 * implementation, not "the controls survive", which is the behaviour.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/controls-outlast-the-scroll.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

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
  // The rows arrive after the frame does, and a walk over an empty table
  // measures a section that has nothing to scroll.
  await page.waitForTimeout(1_000)
}

interface Reading {
  error?: string
  /** How far anything on this screen can be scrolled, wherever it lives. */
  travel: number
  head: boolean | null
  toolbar: boolean | null
}

async function measure(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const pane = document.querySelector('[data-slot="pane-scroll"]')
    const body = document.querySelector('[data-slot="section-body"]')
    if (pane === null || body === null)
      return { error: 'no pane or no section body', travel: 0, head: null, toolbar: null }
    const port = pane.getBoundingClientRect()
    const seen = (sel: string): boolean | null => {
      const el = pane.querySelector(sel)
      if (el === null) return null
      const box = el.getBoundingClientRect()
      return box.bottom > port.top && box.top < port.bottom
    }
    // Every scrollport on the screen, not the two this spec has opinions
    // about: the entities table scrolls inside its own `table-container`, so
    // a reading taken from the pane and the body alone says nothing can move
    // and the precondition fails before the assertion that names the defect.
    let travel = 0
    for (const el of [pane, ...pane.querySelectorAll('*')]) {
      const overflow = getComputedStyle(el).overflowY
      if (overflow !== 'auto' && overflow !== 'scroll') continue
      travel += Math.round(el.scrollHeight - el.clientHeight)
    }

    return {
      travel,
      head: seen('[data-slot="section-head"]'),
      toolbar: seen('[data-slot="table-toolbar"]'),
    }
  })
}

test.describe('a table keeps its controls while the rows move', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeAll(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook answering at ${SB}`)
  })

  for (const id of STORIES) {
    test(`${id} keeps its head and toolbar on screen`, async ({ page }) => {
      await openStory(page, id)

      const before = await measure(page)
      expect(before.error).toBeUndefined()
      // Whichever box holds it, something has to move -- otherwise every
      // assertion below is true of a screen with four rows in it.
      expect(before.travel, 'nothing on this screen can be scrolled at all').toBeGreaterThan(200)
      expect(before.head, 'the section draws no head to keep').toBe(true)

      // Far more than the travel, so the gesture ends against a hard stop
      // wherever the chain leaves it rather than part way down.
      await page.mouse.move(700, 500)
      for (let push = 0; push < 60; push += 1) await page.mouse.wheel(0, 400)
      await page.waitForTimeout(500)

      const after = await measure(page)
      expect(after.head, 'the section head scrolled out of reach with the rows').toBe(true)
      // A screen drawing no toolbar is not a failure; one drawing it and
      // losing it is.
      if (before.toolbar === true) {
        expect(after.toolbar, 'the table toolbar scrolled out of reach with the rows').toBe(true)
      }
    })
  }
})
