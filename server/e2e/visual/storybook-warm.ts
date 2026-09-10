/**
 * Opens the story iframe once, so Vite optimises its dependencies before a
 * test is timing one.
 *
 * **Storybook answering is not the story iframe being ready.** A `webServer`
 * `url` and `requiring('storybook')` both probe the root URL, which the dev
 * server answers as soon as it is listening. The preview's module graph is
 * compiled on first request, and Vite restarts the server when that changes
 * what it has optimised:
 *
 *     Vite [optimizer] bundling dependencies...
 *     Vite dependency optimized: next-themes
 *     Vite optimized dependencies changed. reloading
 *
 * Whatever navigates first wears that restart, and the shape it takes says
 * nothing about Storybook: a `page.goto` timeout on whichever story happened
 * to be first, reported against the assertion that story was going to make.
 * The sweeps pay it differently from the kit tier -- there the whole walk is
 * one test, so the cost lands inside a timer sized for the walk. -> #286
 *
 * **A fetch cannot do this.** The optimiser runs when the preview's modules
 * are executed, not when its HTML is served, so warming it needs a browser.
 *
 * Best-effort by design: a tier that cannot warm Storybook is one whose own
 * precondition has already refused, or one deliberately skipping.
 */
import { chromium } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

export default async function warmStorybook(): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    // Twice, because the first navigation is the one that triggers the reload:
    // it is the second that meets a server which has finished restarting.
    for (const attempt of [1, 2]) {
      await page
        .goto(`${STORYBOOK_URL}/iframe.html?viewMode=story`, {
          waitUntil: 'load',
          timeout: 120_000,
        })
        .catch(() => undefined)
      // **Waiting on the server, not on the page.** There is nothing in the
      // document to poll for: the restart happens in Vite, and the page that
      // would report it is the one being thrown away.
      // eslint-disable-next-line playwright/no-wait-for-timeout
      if (attempt === 1) await page.waitForTimeout(2_000)
    }
  } finally {
    await browser.close()
  }
}
