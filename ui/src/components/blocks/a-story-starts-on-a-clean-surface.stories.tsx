import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

/**
 * What a story may assume about the surface it renders on.
 *
 * Every story in this tier runs in one browser, so anything a story writes to
 * `localStorage` is still there for the next one -- and the shell persists the
 * rail's fold, which decides whether a sub-list is drawn at all. A tier that
 * carries that forward asserts something different depending on the order it
 * happened to run in. -> #527
 *
 * **Two stories in one file, because the order inside a file is the only order
 * this tier fixes.** The first writes, the second reads: without the reset in
 * `.storybook/vitest.setup.ts` the second sees what the first left. The sort
 * is alphabetical and `LeavesAFold` precedes `StartsClean`, which is what
 * keeps them in that order -- renaming either breaks the pair silently.
 */
// `!autodocs`: three assertions about the harness, which is not a block and
// owes the gallery no documentation page.
const meta = { title: 'Blocks/App shell/A clean surface', tags: ['!autodocs'] } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Leaves a fold behind, the way any story that collapses the rail does. */
export const LeavesAFold: Story = {
  render: () => <p>writes a fold</p>,
  play: async () => {
    localStorage.setItem('case-rail', 'true')
    await expect(localStorage.getItem('case-rail')).toBe('true')
  },
}

/** Runs after it, and must not be able to tell. */
export const StartsClean: Story = {
  render: () => <p>reads the surface</p>,
  play: async () => {
    await expect(
      Object.keys(localStorage),
      'a story inherited what the one before it stored, so this tier asserts whatever ran first',
    ).toEqual([])
  },
}

/**
 * The width a story is drawn at, which nothing in this repository chooses.
 *
 * `@storybook/addon-vitest` resizes the tester before every story to its own
 * `DEFAULT_VIEWPORT_DIMENSIONS`, 1200x900, unless a story names a viewport
 * through `globals`. Vitest's `browser.viewport` is applied once per file and
 * then overwritten per story, so setting it there changes nothing -- measured,
 * by pinning 999x777 and still rendering 1200x900.
 *
 * With nothing stored the shell folds its rail below 768px, and a folded rail
 * draws no sub-list -- so that constant decides what a whole class of stories
 * can assert. This is what notices it moving. -> #527
 */
export const IsDrawnAtTheTiersWidth: Story = {
  render: () => <p>reads the viewport</p>,
  play: async () => {
    await expect(
      { width: window.innerWidth, height: window.innerHeight },
      'the size every story is drawn at has moved, which moves what they measure',
    ).toEqual({ width: 1200, height: 900 })
  },
}
