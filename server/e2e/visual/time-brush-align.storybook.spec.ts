/**
 * The brush's grip stands exactly as tall as the density it sits in.
 *
 * **Only a browser can see this.** jsdom gives every element a zero box, so a
 * unit test comparing a grip to a bar compares `0` with `0` and passes on any
 * geometry at all. The story tier renders the control and asserts nothing
 * about where its parts land. What found it was a person looking at the
 * control, which is the instrument this replaces.
 *
 * **The two parts are positioned from different frames, which is the defect.**
 * The density band is bottom-aligned inside the track with a floor under it,
 * so a bar's baseline sits above the track's own bottom. The grip is a
 * fixed-height mark that React Aria centres on the *track*. Measured before
 * the fix, at a 28px track: bars ran 16 to 40, the grip 18 to 42 -- so it hung
 * below every bar and stopped short of the tallest one, in one control.
 *
 * Asserted as equality with the band rather than as a pair of numbers. A test
 * holding `top === 16` re-fails the day the row's padding changes, and the
 * claim was never about 16.
 *
 * ```bash
 * cd ui && npm run storybook          # in another shell, first
 * cd server && npx playwright test --config=e2e/visual/playwright.storybook.config.ts \
 *   e2e/visual/time-brush-align.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

const SB = process.env['STORYBOOK_URL'] ?? 'http://localhost:6006'

/** A window narrowed inside a case, so both grips are away from the edges. */
const STORY = 'components-timebrush--narrowed'

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
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 10_000 })
  // The band itself, not the root: the control mounts a frame later and a
  // reading taken before it exists throws inside `measure` rather than
  // failing the claim, which reads as a broken test instead of a defect.
  await page
    .locator('[data-slot="time-brush-density"] span')
    .first()
    .waitFor({ state: 'attached', timeout: 10_000 })
}

interface Band {
  /** The top of the tallest bar: the highest ink the density draws. */
  ceiling: number
  /** Every bar's baseline, which is the band's floor rather than the track's. */
  floor: number
  /** Each grip's painted mark. */
  grips: { top: number; bottom: number }[]
}

async function measure(page: Page): Promise<Band> {
  return page.evaluate(() => {
    const band = document.querySelector('[data-slot="time-brush-density"]')
    if (!band) throw new Error('the density band is not rendered')
    const bars = [...band.querySelectorAll('span')].map((one) => one.getBoundingClientRect())
    const drawn = bars.filter((one) => one.height > 0)
    if (drawn.length === 0) throw new Error('the density band drew no bars')
    return {
      ceiling: Math.min(...drawn.map((one) => one.top)),
      floor: Math.max(...drawn.map((one) => one.bottom)),
      grips: [...document.querySelectorAll('[data-slot="time-brush-thumb"] span[aria-hidden]')].map(
        (one) => {
          const box = one.getBoundingClientRect()
          return { top: box.top, bottom: box.bottom }
        },
      ),
    }
  })
}

test.describe('the time brush grip against its density', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB}`)
    await openStory(page, STORY)
  })

  test('stands on the same floor the bars stand on', async ({ page }) => {
    const { floor, grips } = await measure(page)
    expect(grips.length).toBeGreaterThan(0)
    // Sub-pixel only: these are laid out from the same box, not rounded to it.
    for (const grip of grips) expect(Math.abs(grip.bottom - floor)).toBeLessThan(1)
  })

  /**
   * The alignment is derived from the floor, not equal to it by luck.
   *
   * **Written because a mutation proved the other two blind.** Reverting the
   * grip to a fixed `h-6` left both green: at the default floor the track's
   * 28px minus 4px is exactly 24, so a hard-coded mark lands where a derived
   * one would. Moving the floor separates them -- a derived mark follows, a
   * fixed one does not -- and that is the only thing that distinguishes the
   * two, since neither can be seen at one value.
   */
  test('follows the floor when the floor moves', async ({ page }) => {
    await page.locator('[data-slot="time-brush"]').first().evaluate((node) => {
      node.style.setProperty('--brush-floor', '0.75rem')
    })
    const { ceiling, floor, grips } = await measure(page)
    expect(grips.length).toBeGreaterThan(0)
    for (const grip of grips) {
      expect(Math.abs(grip.bottom - floor)).toBeLessThan(1)
      expect(Math.abs(grip.top - ceiling)).toBeLessThan(1)
    }
  })

  test('reaches the height the tallest bar reaches, and no further', async ({ page }) => {
    const { ceiling, grips } = await measure(page)
    for (const grip of grips) expect(Math.abs(grip.top - ceiling)).toBeLessThan(1)
  })
})
