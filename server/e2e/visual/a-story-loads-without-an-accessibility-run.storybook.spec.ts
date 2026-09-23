/** A story the walk loads spends nothing on an accessibility run whose answer nobody reads. */
import { expect, test } from '@playwright/test'

import { armStoryFinished, loadStory } from './storybook-lifecycle.js'
import { requireStorybook } from './require-storybook.js'
import { STORYBOOK_URL } from './storybook-url.js'

test('a loaded story finishes without axe having run over it', async ({ page }) => {
  await requireStorybook()
  await armStoryFinished(page)

  const { broke } = await loadStory(page, STORYBOOK_URL, 'components-badge--default', 'light')
  expect(broke, 'the story did not render, so this proves nothing').toBeNull()

  const reporters = await page.evaluate(async () => {
    const finished = (await window.__frameOracleStoryFinished) as unknown as {
      reporters?: { type: string }[]
    }
    return (finished.reporters ?? []).map((one) => one.type)
  })
  expect(reporters, 'the accessibility addon ran over a story the walk loaded').not.toContain(
    'a11y',
  )
})
