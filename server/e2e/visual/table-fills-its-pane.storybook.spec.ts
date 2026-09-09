/**
 * A boxed table uses the room its pane gives it.
 *
 * A table that scrolls in its own box stops where its ceiling says, and a
 * ceiling that guesses at the chrome above the table leaves dead pane under a
 * list that still has rows to show. Measured at 1440x900 on a thirty-row
 * table before this was fixed: the box ended at 835 in a 900px window.
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

const STORIES = ['screens-collect-all-entities--dense', 'screens-collect-all-entities--in-the-shell']

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
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[data-part="table-scroll"]').first().waitFor({ timeout: 30_000 })
}

test.describe('a boxed table reaches the bottom of its pane', () => {
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  for (const story of STORIES) {
    test(`${story} leaves no dead pane under a table that still scrolls`, async ({ page }) => {
      await openStory(page, story)
      // The measure lands after the first paint; two frames is enough.
      await page.waitForTimeout(300)
      const read = await page.locator('[data-part="table-scroll"]').first().evaluate((el) => {
        const rect = el.getBoundingClientRect()
        const root = getComputedStyle(document.documentElement)
        const rem = parseFloat(root.fontSize)
        // The pane's inset, and the room the section body keeps around a
        // scrolling box so a focus ring is not clipped: both are owed.
        const inset = parseFloat(root.getPropertyValue('--pane-inset-y')) * rem
        const ring = parseFloat(root.getPropertyValue('--section-ring-room')) * rem
        return {
          bottom: rect.bottom,
          scrolls: el.scrollHeight > el.clientHeight + 1,
          owed: inset + ring,
          viewport: window.innerHeight,
        }
      })
      // Only a table with more rows than room can leave dead pane.
      test.skip(!read.scrolls, `${story} fits without scrolling`)
      const slack = read.viewport - read.owed - read.bottom
      expect(slack, `${String(slack)}px of pane under a table with rows still to show`).toBeLessThanOrEqual(2)
      expect(read.bottom, 'the box runs past the pane').toBeLessThanOrEqual(read.viewport)
    })
  }
})
