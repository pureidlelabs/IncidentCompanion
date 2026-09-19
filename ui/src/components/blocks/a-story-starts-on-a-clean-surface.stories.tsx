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
 * `.storybook/vitest.setup.ts` the second sees what the first left.
 */
const meta = { title: 'Blocks/App shell/A clean surface' } satisfies Meta

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
 * The width a story is drawn at is the tier's, not the provider's.
 *
 * With nothing stored the shell folds its rail below 768px, and a folded rail
 * draws no sub-list -- so an unpinned viewport leaves a default deciding what
 * the tier asserts. Asserted rather than trusted: a provider changing its own
 * default is silent, and every story that measures a box would move with it.
 */
export const IsDrawnAtTheTiersWidth: Story = {
  render: () => <p>reads the viewport</p>,
  play: async () => {
    await expect(
      { width: window.innerWidth, height: window.innerHeight },
      'the story tier is not rendering at the size it pins, so what it asserts is a default',
    ).toEqual({ width: 1200, height: 900 })
  },
}
