/** A story the walk loads reads nothing the story before it stored. -> #1137 */
import { expect, test } from '@playwright/test'

import { armStoryFinished, loadStory } from './storybook-lifecycle.js'
import { requireStorybook } from './require-storybook.js'
import { STORYBOOK_URL } from './storybook-url.js'

const SB = STORYBOOK_URL

test('what one story stores is gone when the next one loads', async ({ page }) => {
  await requireStorybook()
  await armStoryFinished(page)

  await loadStory(page, SB, 'components-badge--default', 'light')
  await page.evaluate(() => {
    localStorage.setItem('case-rail', 'true')
    sessionStorage.setItem('left-behind', 'true')
  })

  await loadStory(page, SB, 'components-badge--variants', 'light')

  expect(
    await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]),
    'the next story read what the one before it stored',
  ).toEqual([])
})
