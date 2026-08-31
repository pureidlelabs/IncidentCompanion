import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor } from 'storybook/test'

import { DrawnCheck } from '@/components/ui/drawn-check'

/**
 * A checkmark that draws itself on.
 *
 * **The stroke arriving is what says the thing just happened**, rather than a
 * glyph that was always going to be there appearing all at once. That is the
 * difference between a control reporting a result and a control showing an
 * icon. It is not a `lucide` `Check`.
 *
 * **Decorative, and deliberately unlabelled.** Whatever it sits beside says
 * what finished: `Button` puts it next to its settled words, `CopyButton`
 * swaps it for the clipboard. A tick that announced itself would say
 * "checkmark" over the top of the word that means something.
 *
 * It inherits `currentColor` and sizes from `size-4`, so a caller recolours
 * and resizes it by styling whatever holds it.
 */
const meta = {
  title: 'Components/Drawn check',
  component: DrawnCheck,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DrawnCheck>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The tick at its own size, drawn on at mount.
 *
 * The `play` waits for the stroke to finish rather than reading it at once:
 * `pathLength` starts at 0, so an assertion on arrival would read the frame
 * before anything is on screen.
 */
export const Drawn: Story = {
  name: 'The tick, drawing itself on',
  play: async ({ canvasElement }) => {
    const path = canvasElement.querySelector('path')
    await expect(path).not.toBeNull()

    // Motion drives `pathLength` as a dash offset, so a stroke that arrives
    // carries a dasharray and one that was always there does not. Reading the
    // style alone is not enough: an unanimated path reports no `pathLength`
    // at all, which reads as "finished" to anything expecting a number.
    await expect(path).toHaveAttribute('stroke-dasharray')

    // And it settles fully drawn rather than stopping part-way or never
    // starting.
    await waitFor(() => {
      void expect(Number(getComputedStyle(path!).opacity)).toBe(1)
    })
  },
}

/**
 * Larger and recoloured by its container, which is the only way it is styled.
 *
 * It carries no colour or size of its own beyond a default, so a caller sets
 * both on whatever holds it rather than through props it does not have.
 */
export const Inherited: Story = {
  name: 'Sized and coloured by what holds it',
  render: (args) => (
    <span className="text-severity-medium">
      <DrawnCheck {...args} className="size-10" />
    </span>
  ),
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')
    await expect(svg).not.toBeNull()
    await expect(svg?.getBoundingClientRect().width).toBeGreaterThan(20)
    await expect(svg?.getAttribute('stroke')).toBe('currentColor')
  },
}

/**
 * It says nothing to a screen reader, which is the contract rather than an
 * omission.
 */
export const Decorative: Story = {
  name: 'Silent to a screen reader',
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')
    await expect(svg).toHaveAttribute('aria-hidden', 'true')
    await expect(svg?.getAttribute('aria-label')).toBeNull()
  },
}
