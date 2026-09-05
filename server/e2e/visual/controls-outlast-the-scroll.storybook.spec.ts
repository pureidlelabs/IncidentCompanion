/**
 * A table's own controls stay on screen while its rows scroll.
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
