import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { Mark } from './mark'

/**
 * The product's mark, drawn inline so it follows the ground switcher.
 */
const meta = {
  title: 'Components/Mark',
  component: Mark,
  parameters: { layout: 'centered' },
  args: { className: 'size-12' },
  render: (args) => <Mark {...args} />,
} satisfies Meta<typeof Mark>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The masthead size, as the three auth screens draw it.
 */
export const Default: Story = {
  name: 'The mark',
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')!
    await expect(svg).toHaveAttribute('aria-hidden', 'true')
    await expect(svg).toHaveAttribute('focusable', 'false')
  },
}

/**
 * The sizes it is actually asked for.
 */
export const Sizes: Story = {
  name: 'At the sizes it is drawn',
  render: ({ className: _className }) => (
    <div className="flex items-end gap-6">
      {['size-5', 'size-6', 'size-8', 'size-12', 'size-20'].map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Mark className={size} />
          <span className="text-2xs text-ink-muted">{size}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const marks = [...canvasElement.querySelectorAll('svg')]
    await expect(marks).toHaveLength(5)

    await step('Every mark owns its gradient and its mask', async () => {
      const ids = marks.flatMap((svg) =>
        [...svg.querySelectorAll('[id]')].map((el) => el.id),
      )
      await expect(ids).toHaveLength(10)
      await expect(new Set(ids).size).toBe(10)
    })

    await step('And the ladder ascends', async () => {
      const widths = marks.map((svg) => svg.getBoundingClientRect().width)
      for (let index = 1; index < widths.length; index += 1) {
        await expect(widths[index]!).toBeGreaterThan(widths[index - 1]!)
      }
    })
  },
}

/**
 * **The mark carries its own two colours and does not take them from its
 * ground.**
 */
export const OnAColouredGround: Story = {
  name: 'Keeping its own ink on any ground',
  render: () => (
    <div className="flex items-center gap-4">
      <div data-testid="on-primary" className="rounded-lg bg-primary p-4 text-on-primary">
        <Mark className="size-10" />
      </div>
      <div data-testid="on-muted" className="rounded-lg bg-muted p-4 text-ink-muted">
        <Mark className="size-10" />
      </div>
      <div data-testid="on-surface" className="rounded-lg border border-border p-4">
        <Mark className="size-10" />
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const inkOf = (id: string) => {
      const group = canvas.getByTestId(id).querySelector('svg > g')!
      return getComputedStyle(group).color
    }

    // One ink across three grounds. Were the mark inheriting, these would be
    // three different colours and the mark on `bg-primary` would be legible.
    const inks = [inkOf('on-primary'), inkOf('on-muted'), inkOf('on-surface')]
    await expect(new Set(inks).size).toBe(1)
  },
}
