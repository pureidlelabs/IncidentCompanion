import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileSearch } from 'lucide-react'
import { expect } from 'storybook/test'

import { IconStack } from './icon-stack'

/**
 * An isometric stack of three cards behind one glyph, for the illustration
 * above an empty state.
 */
const meta = {
  title: 'Components/IconStack',
  component: IconStack,
  parameters: { layout: 'centered' },
  args: { size: 'default' },
  render: (args) => (
    <IconStack {...args}>
      <FileSearch />
    </IconStack>
  ),
} satisfies Meta<typeof IconStack>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: three layered cards with one glyph on the front.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const stack = canvasElement.querySelector('[data-slot="icon-stack"]')!
    await expect(stack).toHaveAttribute('aria-hidden', 'true')
    // Three cards, two paths each. A layer that stopped rendering leaves a
    // thinner stack that still reads as a deliberate drawing.
    await expect(stack.querySelectorAll('[data-slot="icon-stack-layer"]')).toHaveLength(6)
  },
}

/**
 * Every size. The drawing scales as one thing rather than being re-laid out,
 * because the cards and the ground shadow share a single `0 0 72 81` viewBox.
 */
export const Sizes: Story = {
  render: ({ size: _size, ...args }) => (
    <div className="flex items-center gap-8">
      <div data-testid="sm">
        <IconStack {...args} size="sm">
          <FileSearch className="size-3.5" />
        </IconStack>
      </div>
      <div data-testid="default">
        <IconStack {...args} size="default">
          <FileSearch />
        </IconStack>
      </div>
      <div data-testid="lg">
        <IconStack {...args} size="lg">
          <FileSearch className="size-6" />
        </IconStack>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const widths = ['sm', 'default', 'lg'].map(
      (size) =>
        canvas
          .getByTestId(size)
          .querySelector('[data-slot="icon-stack"]')!
          .getBoundingClientRect().width,
    )
    for (let index = 1; index < widths.length; index += 1) {
      await expect(widths[index]!).toBeGreaterThan(widths[index - 1]!)
    }
  },
}

/**
 * **The glyph sits on the front card's face**, skewed onto it rather than
 * floating over the drawing.
 */
export const GlyphOnTheFace: Story = {
  play: async ({ canvasElement }) => {
    const stack = canvasElement.querySelector('[data-slot="icon-stack"]')!
    const content = stack.querySelector('[data-slot="icon-stack-content"]')!

    // Skewed, not upright. A transform that reset to `none` would leave the
    // glyph flat on an isometric card, which reads as a rendering fault.
    await expect(getComputedStyle(content).transform).not.toBe('none')

    // Sitting inside the drawing rather than beside it.
    const outer = stack.getBoundingClientRect()
    const inner = content.getBoundingClientRect()
    await expect(inner.left).toBeGreaterThan(outer.left)
    await expect(inner.right).toBeLessThan(outer.right + 1)
  },
}

/**
 * With no glyph, it is three empty cards.
 */
export const Bare: Story = {
  render: ({ children: _children, ...args }) => <IconStack {...args} />,
  play: async ({ canvasElement }) => {
    const stack = canvasElement.querySelector('[data-slot="icon-stack"]')!
    await expect(stack.querySelector('[data-slot="icon-stack-content"]')).toBeNull()
    await expect(stack.querySelectorAll('[data-slot="icon-stack-layer"]')).toHaveLength(6)
  },
}

/**
 * On both grounds, which is what the card faces are for.
 */
export const OnBothGrounds: Story = {
  render: (args) => (
    <div className="flex gap-6">
      <div className="rounded-lg bg-background p-6">
        <IconStack {...args} />
      </div>
      <div className="rounded-lg bg-muted p-6">
        <IconStack {...args} />
      </div>
    </div>
  ),
}
