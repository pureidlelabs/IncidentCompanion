/**
 * **The first painted frame carries the stored ground.**
 *
 * No tier below this can see it - jsdom paints nothing, and the sweep captures
 * a settled page - so a regression here is a flash the whole suite calls
 * green. It was one for months: `index.html` carried an inline script for
 * exactly this job, and `script-src 'self'` blocked it on every load while the
 * console said so and nobody read it.
 *
 * **`next-themes` does not cover this and cannot.** Its `ThemeScript` is a
 * `<script>` element rendered by React, hoisted and run when the bundle
 * executes, which is after first paint; its `nonce` is applied only when
 * `typeof window === 'undefined'`. The library owns the state, the listener
 * and the persistence. The first frame is `ui/public/theme.js`'s, served as a
 * file so the CSP admits it.
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
    // **Recorded into the page, not through `exposeFunction`.** The binding is
    // installed asynchronously and lost the race with `document-start`, so an
    // earlier version of this test recorded nothing and read it as "no ground
    // was set" - which is the same string a real flash produces.
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
