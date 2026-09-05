import type { Meta, StoryObj } from '@storybook/react-vite'
import { Plus } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { expect } from 'storybook/test'

import { ChoiceRows } from '@/components/blocks/choice-row'
import { DOORS } from '@/components/blocks/choice-row.stories'

/**
 * A set of choices, down a column or across a grid.
 */
const meta = {
  title: 'Blocks/Card/Choice rows',
  component: ChoiceRows,
  parameters: { layout: 'padded' },
  args: { choices: DOORS },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof ChoiceRows>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Down a column, with the rule before the demo.
 */
export const DownAColumn: Story = {
  name: 'A set down a column, with a rule before the demo',
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getAllByRole('link')).toHaveLength(args.choices.length)
    await expect(canvasElement.querySelectorAll('[data-slot="choice-rows-rule"]')).toHaveLength(1)
  },
}

/**
 * The same set across two columns, where `apart` has nowhere to go.
 */
export const AcrossTwo: Story = {
  name: 'The same set across two columns',
  args: { columns: 2 },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvas.getAllByRole('link')).toHaveLength(args.choices.length)
    await expect(canvasElement.querySelector('[data-slot="choice-rows"]')).toHaveAttribute(
      'data-columns',
      '2',
    )
    await expect(canvasElement.querySelectorAll('[data-slot="choice-rows-rule"]')).toHaveLength(0)
  },
}

/**
 * Nothing to offer draws nothing, and takes the footnote with it.
 */
export const NoChoices: Story = {
  name: 'Nothing to offer',
  args: { choices: [] },
  render: (args) => (
    <ChoiceRows {...args}>
      <p className="text-xs text-ink-muted">A footnote nothing draws.</p>
    </ChoiceRows>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
    await expect(canvas.queryByText('A footnote nothing draws.')).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('[data-slot="choice-rows"]')).toBeNull()
  },
}

/**
 * A footnote under a set that does draw, which is the other half of the pair
 * above: the child appears exactly when the rows do.
 */
export const WithAFootnote: Story = {
  name: 'A set with a footnote under it',
  render: (args) => (
    <ChoiceRows {...args}>
      <p className="text-xs text-ink-muted">A footnote nothing draws.</p>
    </ChoiceRows>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('A footnote nothing draws.')).toBeVisible()
  },
}

/**
 * More ways in than a screen would ever offer, down a column.
 */
export const TooMuchData: Story = {
  name: 'Forty choices',
  args: {
    choices: Array.from({ length: 40 }, (_, i) => ({
      title: `Start a case from the ${String(i)} template`,
      detail: 'From a template, or empty.',
      icon: Plus,
      to: `/cases/new/${String(i)}`,
      ...(i % 10 === 0 && i > 0 ? { apart: true } : {}),
    })),
  },
  play: async ({ canvas, canvasElement }) => {
    const rows = canvas.getAllByRole('link')
    await expect(rows).toHaveLength(40)

    // One height throughout: the first pair and a pair deep in the list are
    // the same distance apart.
    const gap = (a: number, b: number) =>
      rows[b]!.getBoundingClientRect().top - rows[a]!.getBoundingClientRect().top
    await expect(gap(30, 31)).toBeCloseTo(gap(1, 2), 0)

    // Three rules, one before each tenth, and none above the first.
    await expect(canvasElement.querySelectorAll('[data-slot="choice-rows-rule"]')).toHaveLength(3)
  },
}
