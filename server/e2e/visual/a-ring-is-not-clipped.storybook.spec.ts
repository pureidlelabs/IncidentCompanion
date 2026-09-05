/**
 * A ring drawn outside a control's border box survives the box that scrolls it.
 */
import { expect, test, type Page } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/**
 * The two stories a sweep of 90 found a real clipped ring in, both cut on the
 * left edge -- an axis nothing scrolls, which is why the clip reads as absurd
 * until you know a scrollport clips both.
 */
const STORIES = [
  'screens-collect-import-incidents--dense',
  'screens-correlate-investigation-graph--all-unnarrated',
]

/** How far into the tab order to walk. Past this the stories repeat rows. */
const CONTROLS = 14

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
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.locator('[data-slot="section-body"]').first().waitFor({ timeout: 30_000 })
  // The body exists a good deal before the screen's own controls do, and the
  // walk below is a fixed number of presses: tabbing early reaches a different
  // set, and the story that holds the defect reported clean.
  await page.waitForTimeout(1_000)
}

/**
 * For the sticky walk, which covers stories that draw no section at all -- a
 * bare filter bar in a pane mock is one. Waiting on a section body there fails
 * the case on its precondition and says nothing about what it sticks to.
 */
async function openAnyStory(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
  await page.waitForTimeout(1_000)
}

interface Clip {
  name: string
  reach: number
  cut: number
  edge: string
  by: string
}

/** The focused control's ring against every clipping ancestor, or null. */
async function clipOnFocus(page: Page): Promise<Clip | null> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement) || el === document.body) return null

    const style = getComputedStyle(el)
    if (style.outlineStyle === 'none') return null
    const reach = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
    if (!(reach > 0)) return null

    const holder = el.parentElement?.getBoundingClientRect()
    if (holder && holder.width <= 2 && holder.height <= 2) return null

    const box = el.getBoundingClientRect()
    for (let node = el.parentElement; node; node = node.parentElement) {
      const s = getComputedStyle(node)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const clip = node.getBoundingClientRect()
      const edges = {
        top: clip.top - (box.top - reach),
        bottom: box.bottom + reach - clip.bottom,
        left: clip.left - (box.left - reach),
        right: box.right + reach - clip.right,
      }
      const [edge, cut] = Object.entries(edges).sort((a, b) => b[1] - a[1])[0] as [string, number]
      if (cut <= 0.5) continue
      return {
        name: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 40),
        reach,
        cut: Number(cut.toFixed(1)),
        edge,
        by: node.dataset.slot ?? String(node.className).slice(0, 40),
      }
    }
    return null
  })
}

test.describe('a scrolling section leaves room for a ring', () => {
  // The config sets no viewport, and these screens want a real one.
  test.use({ viewport: { width: 1400, height: 900 } })

  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  for (const story of STORIES) {
    test(`${story} clips no focus ring`, async ({ page }) => {
      await openStory(page, story)

      const clipped: Clip[] = []
      for (let step = 0; step < CONTROLS; step++) {
        await page.keyboard.press('Tab')
        const clip = await clipOnFocus(page)
        if (clip) clipped.push(clip)
      }

      expect(
        clipped,
        clipped
          .map((c) => `${c.name}: ${String(c.reach)}px ring cut ${String(c.cut)}px on the ${c.edge} by ${c.by}`)
          .join('; '),
      ).toEqual([])
    })
  }

  /**
   * The cost of that room, and the rule that pays it.
   */
  const STUCK = [
    'screens-correlate-timeline-graph--dense',
    'blocks-layout-section--fills',
    'blocks-layout-section--grows',
    'blocks-report-index--dense',
    'screens-collect-all-entities--in-the-shell',
    'screens-case-timeline--in-the-shell',
    'blocks-table-filter-bar--in-a-pane-that-scrolls',
  ]

  for (const story of STUCK) {
    test(`${story} stands every sticky element flush with what it sticks to`, async ({ page }) => {
      await openAnyStory(page, story)

      const strips = await page.evaluate(() => {
        const scrollportOf = (el: Element): HTMLElement | null => {
          for (let node = el.parentElement; node; node = node.parentElement) {
            const s = getComputedStyle(node)
            if (s.overflowY === 'auto' || s.overflowY === 'scroll') return node
          }
          return null
        }

        const stuck: { slot: string; port: string; gap: number; behind: string[] }[] = []
        for (const el of document.querySelectorAll('*')) {
          if (getComputedStyle(el).position !== 'sticky') continue
          const port = scrollportOf(el)
          if (port === null) continue
          // Only a box with something to scroll can open a strip, and only a
          // stuck element is at its offset -- so drive it to the end first.
          if (port.scrollHeight - port.clientHeight < 2) continue
          port.scrollTop = port.scrollHeight
          const gap = el.getBoundingClientRect().top - port.getBoundingClientRect().top
          if (gap <= 0.5) continue
          const box = port.getBoundingClientRect()
          stuck.push({
            slot: (el as HTMLElement).dataset.slot ?? el.tagName,
            port: port.dataset.slot ?? port.tagName,
            gap: Number(gap.toFixed(1)),
            behind: document
              .elementsFromPoint(box.left + port.clientWidth / 2, box.top + gap / 2)
              .map((n) => (n instanceof HTMLElement ? (n.dataset.slot ?? n.tagName) : n.tagName))
              .slice(0, 3),
          })
        }
        return stuck
      })

      expect(
        strips.map(
          (s) =>
            `${s.slot} sticks ${String(s.gap)}px below ${s.port}, and ${s.behind.join(', ')} scrolls through the strip`,
        ),
        'a sticky element pinned below the box it sticks to, opening a strip its content scrolls through',
      ).toEqual([])
    })
  }

  /**
   * The reported case, and the one the sweep above cannot see: the ring around
   * the current step is a sibling element rather than an `outline`, so nothing
   * reading `outline-width` finds it. It reaches 5px past its disc -- `-inset-[3px]`
   * plus `ring-2` -- and the disc sits at the top of the section's body.
   */
  test('the wizard keeps the ring around the step it is on', async ({ page }) => {
    await openStory(page, 'screens-collect-import-incidents--dense')

    const cut = await page.evaluate(() => {
      const ring = document.querySelector('[data-slot="stepper-ring"]')
      if (!ring) throw new Error('no step is current, so no ring is drawn')
      // The `ring-2` is a box shadow, which no rect carries: the element's own
      // box is the `-inset-[3px]`, and the shadow reaches 2px past it.
      const SHADOW = 2
      const box = ring.getBoundingClientRect()
      let worst = -Infinity
      for (let node = ring.parentElement; node; node = node.parentElement) {
        const s = getComputedStyle(node)
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
        const clip = node.getBoundingClientRect()
        worst = Math.max(
          worst,
          clip.top - (box.top - SHADOW),
          box.bottom + SHADOW - clip.bottom,
          clip.left - (box.left - SHADOW),
          box.right + SHADOW - clip.right,
        )
      }
      return worst
    })

    expect(cut, 'the current-step ring is cut by the box that scrolls the wizard').toBeLessThanOrEqual(0)
  })
})
