import type { Meta, StoryObj } from '@storybook/react-vite'
import { Shield } from 'lucide-react'
import { expect } from 'storybook/test'

import { IconTile } from './icon-tile'

const TONES = ['muted', 'primary', 'accent', 'destructive', 'solid', 'outline'] as const
const SIZES = ['xs', 'sm', 'default', 'lg', 'xl'] as const

/**
 * A square tinted tile holding one glyph. Pass the glyph as the child; the tile
 * sizes it.
 */
const meta = {
  title: 'Components/IconTile',
  component: IconTile,
  parameters: { layout: 'centered' },
  args: { tone: 'muted', size: 'default', radius: 'default' },
  render: (args) => (
    <IconTile {...args}>
      <Shield />
    </IconTile>
  ),
} satisfies Meta<typeof IconTile>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: a muted tile at the `--control-h-md` tier.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="icon-tile"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  },
}

/**
 * Every tone.
 */
export const Tones: Story = {
  render: ({ tone: _tone, ...args }) => (
    <div className="flex items-center gap-3">
      {TONES.map((tone) => (
        <IconTile key={tone} {...args} tone={tone} data-testid={tone}>
          <Shield />
        </IconTile>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const grounds = TONES.map((tone) => getComputedStyle(canvas.getByTestId(tone)).backgroundColor)
    // Six tones. `outline` is allowed to be transparent, so the assertion is on
    // the count of distinct grounds rather than on any one of them being set.
    await expect(new Set(grounds).size).toBe(TONES.length)
  },
}

/** Every size. */
export const Sizes: Story = {
  render: ({ size: _size, ...args }) => (
    <div className="flex items-center gap-3">
      {SIZES.map((size) => (
        <IconTile key={size} {...args} size={size} data-testid={size}>
          <Shield />
        </IconTile>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const widths = SIZES.map((size) => canvas.getByTestId(size).getBoundingClientRect().width)
    for (let index = 1; index < widths.length; index += 1) {
      await expect(widths[index]!).toBeGreaterThan(widths[index - 1]!)
    }
  },
}

/**
 * Both radii: a rounded square, and a circle.
 */
export const Radius: Story = {
  render: ({ radius: _radius, ...args }) => (
    <div className="flex items-center gap-3">
      <IconTile {...args} radius="default" tone="primary" data-testid="square">
        <Shield />
      </IconTile>
      <IconTile {...args} radius="full" tone="primary" data-testid="circle">
        <Shield />
      </IconTile>
    </div>
  ),
  play: async ({ canvas }) => {
    const square = canvas.getByTestId('square')
    const circle = canvas.getByTestId('circle')
    const radiusOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopLeftRadius)

    // A circle's radius is half its side. Anything less and it is a squircle
    // that reads as a rounded square with the corners overdone.
    await expect(radiusOf(circle)).toBeGreaterThanOrEqual(
      circle.getBoundingClientRect().width / 2,
    )
    await expect(radiusOf(square)).toBeLessThan(circle.getBoundingClientRect().width / 2)
  },
}

/**
 * The tile with no glyph in it.
 */
export const Empty: Story = {
  render: (args) => <IconTile {...args} />,
  play: async ({ canvasElement }) => {
    const tile = canvasElement.querySelector('[data-slot="icon-tile"]')!
    await expect(tile.getBoundingClientRect().width).toBeGreaterThan(0)
  },
}
