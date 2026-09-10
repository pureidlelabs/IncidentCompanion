/**
 * Opens the story iframe once, so Vite optimises its dependencies before a
 * test is timing one.
 *
 * **Storybook answering is not the story iframe being ready.** Both readiness
 * probes ask the root URL, which the dev server answers as soon as it listens;
 * the preview's module graph is compiled on first request, and Vite restarts
 * when that changes what it has optimised. Whatever navigates first wears the
 * restart, as a `page.goto` timeout blamed on that story. -> #286
 *
 * **A fetch cannot do this**: the optimiser runs when the modules execute, not
 * when the HTML is served.
 *
 * Best-effort. Only the kit tier has a precondition behind it; the sweeps skip
 * per test, so for them this returns having warmed nothing.
 */
import { chromium } from '@playwright/test'

import { STORYBOOK_URL } from './storybook-url.js'

export default async function warmStorybook(): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    // Twice: the first navigation triggers the reload, the second meets the
    // server that finished restarting.
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
