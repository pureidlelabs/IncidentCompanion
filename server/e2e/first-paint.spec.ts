/**
 * **The first painted frame carries the stored ground.**
 *
 * No tier below this can see it - jsdom paints nothing, and the sweep captures
 * a settled page - so a regression here is a flash the whole suite calls
 * green.
 *
 * `ui/public/theme.js` paints that frame, and its own docstring holds why it is
 * a served file and why `next-themes` cannot take the job.
 *
 * Driven with the OS on light and the stored ground dark - the only
 * combination where the two disagree and the script is what decides. With the
 * OS agreeing, `tokens.css`'s `prefers-color-scheme` fallback would paint the
 * right thing on its own and the test would pass against a missing script.
 */
import { expect, test } from '@playwright/test'

import { requireServedApp } from './support/app.js'

/** `--background`, dark. A colour rather than a token name: this reads the
 *  computed value, and the point is that the paint is right, not the class. */
const DARK_GROUND = 'oklch(0.19 0.012 260)'

test('the stored ground is painted in the first frame, not applied a frame later', async ({
  browser,
  baseURL,
}) => {
  await requireServedApp(baseURL ?? '')
  const context = await browser.newContext({ colorScheme: 'light', ignoreHTTPSErrors: true })
  try {
    const page = await context.newPage()
    // **Recorded into the page, not through `exposeFunction`.** That binding is
    // installed asynchronously and loses the race with `document-start`, so it
    // records nothing and reads as "no ground was set" - the same string a real
    // flash produces.
    await page.addInitScript(() => {
      window.localStorage.setItem('ic-theme', 'dark')
      const seen: string[] = []
      ;(window as unknown as { __frames: string[] }).__frames = seen
      const snap = () => {
        const root = document.documentElement
        const ground = getComputedStyle(document.body ?? root).backgroundColor
        seen.push(`${root.getAttribute('data-theme') ?? 'none'}/${ground}`)
      }
      requestAnimationFrame(() => {
        snap()
        requestAnimationFrame(snap)
      })
    })

    await page.goto('/', { waitUntil: 'load' })
    const frames = await page.evaluate(
      () => (window as unknown as { __frames: string[] }).__frames,
    )

    expect(frames.length, 'no frame was sampled - the probe, not the app').toBeGreaterThan(0)
    expect(
      frames,
      'a frame painted something other than the stored dark ground - that is the flash',
    ).toEqual(frames.map(() => `dark/${DARK_GROUND}`))
  } finally {
    await context.close()
  }
})
