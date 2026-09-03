/**
 * A ring drawn outside a control's border box survives the box that scrolls it.
 *
 * **No other tier can see this.** A focus ring is geometry against an
 * ancestor's clip: jsdom gives both a zero box, and the story tier asserts
 * what rendered rather than where it was cut.
 *
 * The defect it holds: `section-body` is `overflow-y: auto`, and a scrollport
 * clips *both* axes as soon as one is not `visible` -- so a control flush
 * against any edge of it, including the two horizontal ones nothing scrolls,
 * loses part of the ring drawn outside its border box.
 *
 * **Two exclusions, or this reports a class that is 93% noise.** A sweep of 90
 * stories found 28 clipped rings; 9 once outlines that are not drawn were
 * dropped, and 2 once visually-hidden inputs were:
 *
 * - **`outline-style: none` still reports an `outline-width`.** Most inputs
 *   here are `outline-none` -- the kit puts the ring on the field group rather
 *   than the input -- so counting the width finds a ring nobody draws.
 * - **A visually-hidden input is not a visible control.** React Aria paints
 *   the real `<input>` into a 1x1 `clip-path: inset(50%)` span and styles a
 *   sibling. Its ring is clipped by design and no reader ever sees it.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/a-ring-is-not-clipped.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

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
   * The cost of that room, and the only one it has.
   *
   * A sticky offset is measured from the scrollport's *padding* edge, so an
   * element at `top-0` inside the padded body pins 6px down and the content
   * scrolls through the strip above it. `--section-sticky-top` cancels the
   * padding, and every sticky child of this box owes it -- a coupling nothing
   * else would report, since the strip only opens once something scrolls.
   */
  for (const [story, slot] of [
    ['screens-correlate-timeline-graph--dense', 'cascade-readout'],
    ['blocks-layout-section--fills', 'table-header'],
  ] as const) {
    test(`${story} stands ${slot} flush with the body it sticks to`, async ({ page }) => {
      await openStory(page, story)

      const strip = await page.evaluate((slot) => {
        const body = document.querySelector('[data-slot="section-body"]')
        const stuck = document.querySelector(`[data-slot="${slot}"]`)
        if (!(body instanceof HTMLElement) || !stuck) throw new Error(`no ${slot} in a section body`)
        body.scrollTop = body.scrollHeight
        const gap = stuck.getBoundingClientRect().top - body.getBoundingClientRect().top
        // What paints in the strip, if there is one: content that scrolled up
        // behind an element meant to stand in front of it.
        const behind =
          gap > 0.5
            ? document
                .elementsFromPoint(
                  body.getBoundingClientRect().left + body.clientWidth / 2,
                  body.getBoundingClientRect().top + gap / 2,
                )
                .map((n) => (n instanceof HTMLElement ? (n.dataset.slot ?? n.tagName) : n.tagName))
                .slice(0, 3)
            : []
        return { gap: Number(gap.toFixed(1)), behind }
      }, slot)

      expect(
        strip.gap,
        `${slot} sticks ${String(strip.gap)}px below the body's edge, and ${strip.behind.join(', ')} scrolls through the strip`,
      ).toBeLessThanOrEqual(0.5)
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
