import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Skeleton } from './skeleton'

/**
 * A loading placeholder in the shape the content will take, hidden from a
 * screen reader.
 *
 * `aria-hidden` is set and not optional, so something above it owns the
 * announcement. The caller supplies the size: only `text` has a height of its
 * own, and a placeholder that is not the size of what it replaces makes the
 * layout jump when the data lands.
 *
 * A run of `text` skeletons makes its last line two thirds width, so it reads
 * as prose rather than as a table.
 *
 * `shimmer` is Motion and stops under reduced motion; `pulse` is a CSS class
 * and keeps going. `none` suits a page of many. -> issue 53
 */
const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  parameters: { layout: 'centered' },
  args: { shape: 'block', motion: 'shimmer' },
  render: (args) => <Skeleton {...args} className="h-24 w-64" />,
} satisfies Meta<typeof Skeleton>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: a block standing in for a box of content.
 *
 * **It is hidden from assistive technology.** A screen reader hears the live
 * region the loading state owns - one sentence naming what is being waited for
 * - rather than a row of empty boxes announcing themselves individually.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const placeholder = canvasElement.querySelector('[data-slot="skeleton"]')
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
  },
}

/**
 * Every shape, side by side.
 *
 * `text` is the one with an opinion of its own: **the last line in a run is
 * two thirds width**, because a paragraph does not end flush and a stack of
 * full-width bars reads as a table rather than as prose.
 */
export const Shapes: Story = {
  render: ({ shape: _shape, ...args }) => (
    <div className="flex w-72 flex-col gap-4">
      <Skeleton {...args} shape="block" className="h-16" />
      <div data-testid="lines" className="flex flex-col gap-2">
        <Skeleton {...args} shape="text" />
        <Skeleton {...args} shape="text" />
        <Skeleton {...args} shape="text" />
      </div>
      <Skeleton {...args} shape="circle" className="w-10" />
    </div>
  ),
  play: async ({ canvas }) => {
    const lines = [...canvas.getByTestId('lines').children].map(
      (el) => el.getBoundingClientRect().width,
    )

    await expect(lines).toHaveLength(3)
    await expect(lines[0]).toBe(lines[1])
    // `last:w-2/3`. jsdom reports every one of these as 0 and cannot tell the
    // ragged edge from a flush one.
    await expect(lines[2]!).toBeLessThan(lines[0]!)
  },
}

/** A row placeholder: an avatar and two lines. */
export const Row: Story = {
  render: ({ shape: _shape, ...args }) => (
    <div className="flex w-72 items-center gap-3">
      <Skeleton {...args} shape="circle" className="w-8" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton {...args} shape="text" />
        <Skeleton {...args} shape="text" />
      </div>
    </div>
  ),
}

/**
 * **The three ways it signals waiting**, and they are not equivalent.
 *
 * `shimmer`, the default, runs a highlight across the placeholder on its own
 * element - a transform rather than an animated `background-position`, which
 * cannot be composited and puts a page of them on the main thread.
 *
 * `pulse` is a plain opacity throb. `none` is still, and is the right answer
 * for a page of many, where a wall of movement is worse than none at all.
 *
 * **Both stop for an analyst who asked for less motion.** `shimmer` is Motion,
 * configured `reducedMotion="user"`; `pulse` is a CSS class under
 * `motion-safe:`. A skeleton says *something is coming* through its shape and
 * its place, so neither loses anything by holding still.
 */
export const MotionLadder: Story = {
  name: 'Shimmer, pulse, and still',
  render: ({ motion: _motion, ...args }) => (
    <div className="flex flex-col gap-6">
      {(['shimmer', 'pulse', 'none'] as const).map((how) => (
        <div key={how} data-testid={how} className="flex flex-col gap-2">
          <p className="text-xs text-ink-muted">{how}</p>
          <div className="flex items-center gap-3">
            <Skeleton {...args} shape="circle" motion={how} className="size-10" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton {...args} shape="text" motion={how} />
              <Skeleton {...args} shape="text" motion={how} />
            </div>
          </div>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas, step }) => {
    await step('Only shimmer draws the travelling highlight', async () => {
      await expect(
        canvas.getByTestId('shimmer').querySelectorAll('[data-slot="skeleton-shimmer"]'),
      ).toHaveLength(3)
      for (const how of ['pulse', 'none']) {
        await expect(
          canvas.getByTestId(how).querySelectorAll('[data-slot="skeleton-shimmer"]'),
        ).toHaveLength(0)
      }
    })

    await step('Only pulse carries the CSS animation', async () => {
      const pulsing = canvas
        .getByTestId('pulse')
        .querySelector('[data-slot="skeleton"]')!
      await expect(getComputedStyle(pulsing).animationName).not.toBe('none')

      const still = canvas.getByTestId('none').querySelector('[data-slot="skeleton"]')!
      await expect(getComputedStyle(still).animationName).toBe('none')
    })
  },
}

/**
 * A page of many, which is the state that decides whether the default is right.
 *
 * Twelve rows shimmering at once is the case for `motion="none"`. Read this
 * story next to `Row` rather than on its own.
 */
export const ManyAtOnce: Story = {
  render: ({ motion: _motion, shape: _shape, ...args }) => (
    <div className="flex w-96 flex-col gap-3">
      {Array.from({ length: 12 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton {...args} shape="circle" className="w-8" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton {...args} shape="text" />
            <Skeleton {...args} shape="text" />
          </div>
        </div>
      ))}
    </div>
  ),
}
