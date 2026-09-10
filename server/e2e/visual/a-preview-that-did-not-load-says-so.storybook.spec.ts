/**
 * A preview that never loaded is reported as that, rather than as a layout defect.
 *
 * **The detector this proves is the only thing standing between a broken
 * Storybook and invented findings.** Every spec in this tier waits on an
 * element of its own and then measures its box; when the preview fails to load,
 * no story renders, the wait runs its full timeout and the tier reports a
 * geometry failure against whichever story happened to be running. -> #443
 *
 * **Both of Storybook's error surfaces are exercised, because a fix for either
 * alone leaves the tier able to invent findings out of the other.** -> the
 * `visual-check` skill for what they are and why they share no element.
 *
 * **What it does not cover**: that a real preview failure takes this shape.
 * The fault is induced at the network, so what is proved is the reporting, not
 * the cause -- which is the half #443 leaves open.
 *
 * ```bash
 * cd server && npx playwright test --config=e2e/playwright.kit.config.ts \
 *   e2e/visual/a-preview-that-did-not-load-says-so.storybook.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test'

import { brokenPreview } from './storybook-lifecycle.js'
import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/** Any story that renders, since what is under test is the reporting rather than the story. */
const STORY = 'screens-report-section--opened-on-a-report'

/** Whether a Storybook is listening, asked once. */
async function storybookIsUp(): Promise<boolean> {
  try {
    const answer = await fetch(`${SB}/index.json`, { signal: AbortSignal.timeout(5_000) })
    return answer.ok
  } catch {
    return false
  }
}

/**
 * Opens a story and waits only for the root to attach.
 *
 * **No `brokenPreview` call of its own**, unlike every other opener in this
 * tier: the return value is what each test here asserts against.
 */
async function open(page: Page, id: string): Promise<void> {
  await page.goto(`${SB}/iframe.html?id=${id}&viewMode=story`, {
    waitUntil: 'load',
    timeout: 30_000,
  })
  await page.locator('#storybook-root').waitFor({ state: 'attached', timeout: 30_000 })
}

test.describe('a preview that did not load says so', () => {
  test.beforeEach(async () => {
    test.skip(!(await storybookIsUp()), `no Storybook at ${SB} - run \`cd ui && npm run storybook\``)
  })

  test('a preview script that fails to fetch is reported, not read as an empty story', async ({
    page,
  }) => {
    // The fault is induced at the network rather than by pointing at a broken
    // Storybook: what #443 recorded was a transient fetch failure against a
    // Storybook that was otherwise serving every other spec in the same run.
    await page.route('**/vite-app.js*', (route) => route.abort('failed'))
    await open(page, STORY)

    const said = await brokenPreview(page)

    expect(said, 'a preview whose script never loaded reads as a story that rendered').not.toBeNull()
    expect(said ?? '', 'the report names the file that did not load').toContain('vite-app.js')
  })

  test('and says why it failed, rather than repeating Storybook`s guess about the hostname', async ({
    page,
  }) => {
    // **Only the first request is refused.** Aborting every one means the
    // detector's own re-fetch is aborted by the test, so it can only ever
    // reach the `threw` branch -- the assertion below would hold if the code
    // asked a URL that does not exist. Letting the second through is what a
    // dev server mid-restart actually does, and it is the branch that reports
    // the server answering.
    let refused = false
    await page.route('**/vite-app.js*', (route) => {
      if (refused) return route.continue()
      refused = true
      return route.abort('failed')
    })
    await open(page, STORY)

    const said = await brokenPreview(page)

    expect(refused, 'the preview script was never requested, so nothing was refused').toBe(true)

    // Storybook's own text is a fixed string rather than a diagnosis, and
    // reported unqualified it sends the next reader to configure `allowedHosts`
    // for a fetch that failed for some other reason entirely.
    //
    // **The status the server actually gave**, not merely the word `re-fetched`
    // -- the second request is allowed through above, so this is the branch
    // that reads the server rather than the one that reports a dead connection.
    expect(said ?? '', 'the report carries what the server answered on the retry').toMatch(
      /re-fetched 200/,
    )
  })

  test('a story that throws is still reported, which is the other error surface', async ({
    page,
  }) => {
    await open(page, 'blocks-no-such-story--nope')

    expect(
      await brokenPreview(page),
      'the preview runtime draws a missing story into `#error-message`',
    ).toContain('blocks-no-such-story--nope')
  })

  test('a story that renders is not reported as broken', async ({ page }) => {
    await open(page, STORY)

    expect(
      await brokenPreview(page),
      'a detector that fires on a healthy story fails the whole tier instead',
    ).toBeNull()
  })
})
