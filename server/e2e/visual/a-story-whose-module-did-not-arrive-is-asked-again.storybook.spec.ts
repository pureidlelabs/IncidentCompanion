/**
 * A story whose module did not arrive is asked a second time before it counts.
 *
 * The dev server compiles a story's module graph on demand and re-optimises
 * when it changes, so a page can ask for a URL from before that and be handed
 * nothing. The story is fine and the request was not, but the walk's one
 * assertion is that it could look -- so a run against a server in that state
 * fails, naming stories that render perfectly well.
 *
 * **What this does not cover**: that a server which has gone stale is cured by
 * asking again. The fault is induced at the network, so what is proved is that
 * a module which fails once and arrives next time costs nothing -- the same
 * boundary `a-preview-that-did-not-load-says-so.storybook.spec.ts` draws for
 * its own induced fault. -> #887
 */
import { expect, test, type Page } from '@playwright/test'

import { armStoryFinished, loadStory } from './storybook-lifecycle.js'
import { requireStorybook } from './require-storybook.js'
import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

/** Any story that renders: what is under test is the asking, not the story. */
const STORY = 'components-badge--default'

/**
 * Refuses the story's own module for the first `times` requests.
 *
 * Returns a counter, because "it recovered" and "it never failed" are the same
 * screenshot and only the count tells them apart.
 */
async function refuseTheModule(page: Page, times: number): Promise<() => number> {
  let asked = 0
  await page.route('**/*.stories.tsx*', async (route) => {
    asked += 1
    if (asked <= times) {
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  return () => asked
}

test.describe('a story whose module did not arrive is asked again', () => {
  test.beforeEach(async ({ page }) => {
    await requireStorybook()
    // `loadStory` reads what this arms, and refuses outright without it.
    await armStoryFinished(page)
  })

  test('one refusal costs nothing, and the second asking is what answers', async ({ page }) => {
    const asked = await refuseTheModule(page, 1)

    const { broke } = await loadStory(page, SB, STORY, 'light')

    expect(
      broke,
      'a module that failed once and arrived next time was reported as broken',
    ).toBeNull()
    // Exactly two: `toBeGreaterThan(1)` passes a runaway retry, measured -- a
    // loop of three attempts left all three cases green.
    expect(asked(), 'the story was asked a number of times that is not twice').toBe(2)
  })

  test('a module that never arrives is still reported', async ({ page }) => {
    const asked = await refuseTheModule(page, Number.MAX_SAFE_INTEGER)

    const { broke } = await loadStory(page, SB, STORY, 'light')

    expect(broke, 'a story that cannot load reported as fine').not.toBeNull()
    expect(broke).toMatch(/dynamically imported module/)
    expect(asked(), 'a story that never arrives was asked more than twice').toBe(2)
  })

  test('a story that renders is not asked twice', async ({ page }) => {
    const asked = await refuseTheModule(page, 0)

    const { broke } = await loadStory(page, SB, STORY, 'light')

    expect(broke).toBeNull()
    expect(asked(), 'a story that loaded was fetched again anyway').toBe(1)
  })
})
