import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileSearch, Plus, Upload } from 'lucide-react'

import { expect } from 'storybook/test'

import { Button } from './button'
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from './empty'
import { IconStack } from './icon-stack'

/**
 * The empty state of a list or a pane: a glyph, a title, a line of explanation
 * and the action that fills it.
 *
 * **An empty state names the way out.** A pane saying only that it is empty
 * leaves an analyst to guess whether nothing was collected, nothing matched, or
 * nothing loaded -- so the description says which, and the actions are the ones
 * that change it.
 *
 * Compose it as `Empty > EmptyMedia + EmptyTitle + EmptyDescription +
 * EmptyActions`, every part optional but the title. The block centres its own
 * contents on both axes, so a caller gives it a box and nothing else.
 */
const meta = {
  title: 'Components/Empty',
  component: Empty,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Empty>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: a glyph, a title, a line and two actions.
 *
 * The parts stack centred, and the actions sit on one row -- a column of buttons
 * in an empty state reads as a form rather than as a way out of a blank pane.
 */
export const Default: Story = {
  render: () => (
    <Empty className="w-96">
      <EmptyMedia>
        <FileSearch />
      </EmptyMedia>
      <EmptyTitle>No evidence yet</EmptyTitle>
      <EmptyDescription>
        Attach a file or paste a log excerpt to start the evidence record.
      </EmptyDescription>
      <EmptyActions>
        <Button size="sm">
          <Plus />
          Add evidence
        </Button>
        <Button size="sm" variant="outline">
          <Upload />
          Import
        </Button>
      </EmptyActions>
    </Empty>
  ),
  play: async ({ canvas, canvasElement, step }) => {
    const block = canvasElement.querySelector<HTMLElement>('[data-slot="empty"]')!

    await step('Every part is centred on the block', async () => {
      const middle = block.getBoundingClientRect().left + block.getBoundingClientRect().width / 2
      for (const slot of ['empty-media', 'empty-title', 'empty-description']) {
        const box = block.querySelector(`[data-slot="${slot}"]`)!.getBoundingClientRect()
        await expect(box.left + box.width / 2).toBeCloseTo(middle, 0)
      }
    })

    await step('And the actions share a row', async () => {
      const buttons = canvas.getAllByRole('button').map((b) => b.getBoundingClientRect())
      await expect(buttons[0]!.top).toBeCloseTo(buttons[1]!.top, 0)
    })
  },
}

/**
 * Every size, which is a ladder of air rather than of type: the title and the
 * line read the same at each rung, and what changes is how much room the block
 * takes. So a small one drops into a section that already has a heading without
 * competing with it.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-4">
      <Empty size="sm" inset>
        <EmptyTitle>Small</EmptyTitle>
        <EmptyDescription>Inside a section that already has a heading.</EmptyDescription>
      </Empty>
      <Empty size="default" inset>
        <EmptyTitle>Default</EmptyTitle>
        <EmptyDescription>The empty state of a table or a list.</EmptyDescription>
      </Empty>
      <Empty size="lg" inset>
        <EmptyTitle>Large</EmptyTitle>
        <EmptyDescription>A whole pane with nothing in it.</EmptyDescription>
      </Empty>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const blocks = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="empty"]')]

    await step('Each rung takes more room than the last', async () => {
      const heights = blocks.map((block) => block.getBoundingClientRect().height)
      await expect(heights[1]).toBeGreaterThan(heights[0]!)
      await expect(heights[2]).toBeGreaterThan(heights[1]!)
    })

    await step('And the type does not move with it', async () => {
      const sizes = blocks.map(
        (block) =>
          getComputedStyle(block.querySelector('[data-slot="empty-title"]')!).fontSize,
      )
      await expect(new Set(sizes).size).toBe(1)
    })
  },
}

/**
 * `inset` draws a dashed border and fills the container.
 *
 * Dashed rather than solid: a solid border reads as a panel that is meant to be
 * there, and a dashed one reads as a space waiting to be filled. It grows to the
 * box it is dropped into, so the emptiness is the shape of what will replace it.
 */
export const Inset: Story = {
  render: () => (
    <div className="flex h-64 w-96">
      <Empty inset>
        <EmptyMedia>
          <FileSearch />
        </EmptyMedia>
        <EmptyTitle>No matching rows</EmptyTitle>
        <EmptyDescription>Clear the filters to see the whole timeline.</EmptyDescription>
        <EmptyActions>
          <Button size="sm" variant="outline">
            Clear filters
          </Button>
        </EmptyActions>
      </Empty>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const block = canvasElement.querySelector<HTMLElement>('[data-slot="empty"]')!

    await step('The border is dashed', async () => {
      await expect(getComputedStyle(block).borderTopStyle).toBe('dashed')
    })

    await step('And it takes the box it was dropped into', async () => {
      const pane = block.parentElement!.getBoundingClientRect()
      await expect(block.getBoundingClientRect().height).toBeCloseTo(pane.height, 0)
    })
  },
}

/**
 * Both media variants: a glyph on a ground, and artwork of its own.
 *
 * `icon` gives the glyph a tinted square to sit on, so a single small mark reads
 * as deliberate rather than as a stray. `illustration` draws none, because
 * artwork brings its own box and a ground behind it would be a second frame.
 *
 * Both are `aria-hidden`: the title says what the state is, and a screen reader
 * reading a decorative glyph as well says it twice.
 */
export const MediaVariants: Story = {
  render: () => (
    <div className="flex items-start gap-8">
      <Empty className="w-64">
        <EmptyMedia variant="icon">
          <FileSearch />
        </EmptyMedia>
        <EmptyTitle>Icon</EmptyTitle>
        <EmptyDescription>A glyph on a tinted round ground.</EmptyDescription>
      </Empty>
      <Empty className="w-64">
        <EmptyMedia variant="illustration">
          <IconStack>
            <FileSearch />
          </IconStack>
        </EmptyMedia>
        <EmptyTitle>Illustration</EmptyTitle>
        <EmptyDescription>Artwork that brings its own box.</EmptyDescription>
      </Empty>
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const media = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="empty-media"]')]

    await step('The glyph gets a ground and the artwork does not', async () => {
      const grounds = media.map((box) => getComputedStyle(box).backgroundColor)
      await expect(grounds[0]).not.toBe(grounds[1])
      await expect(grounds[1]).toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    })

    await step('And neither is read out', async () => {
      for (const box of media) await expect(box).toHaveAttribute('aria-hidden')
    })
  },
}
