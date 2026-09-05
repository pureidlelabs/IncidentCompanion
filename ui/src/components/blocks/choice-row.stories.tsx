import type { Meta, StoryObj } from '@storybook/react-vite'
import { FlaskConical, Import, Plus } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { expect, fn } from 'storybook/test'

import { ChoiceRow, type Choice } from '@/components/blocks/choice-row'

/** The doors a case can be started through, shared with the sets next door. */
export const DOORS: readonly Choice[] = [
  {
    title: 'Start a case',
    detail: 'From a template, or empty.',
    icon: Plus,
    to: '/cases/new',
  },
  {
    title: 'Import a case',
    detail: 'An .iccase file exported from another install.',
    icon: Import,
    to: '/cases/import',
  },
  {
    title: 'Open the demo case',
    detail: 'A finished investigation to look through.',
    icon: FlaskConical,
    to: '/cases/demo',
    apart: true,
  },
]

/**
 * One offered door: an icon, a title, a line under it, and somewhere to go.
 */
const meta = {
  title: 'Blocks/Card/Choice row',
  component: ChoiceRow,
  parameters: { layout: 'padded' },
  args: { choice: DOORS[0]!, shape: 'row' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof ChoiceRow>

export default meta
type Story = StoryObj<typeof meta>

/** Down a column, where the icon, title and detail sit on one line. */
export const AsARow: Story = {
  name: 'One choice, as a row',
  play: async ({ canvas, args }) => {
    const link = canvas.getByRole('link', { name: /start a case/i })
    await expect(link).toHaveAttribute('href', args.choice.to)
    await expect(canvas.getByText('From a template, or empty.')).toBeVisible()
  },
}

/**
 * The same choice as a card, which is what a grid draws.
 */
export const AsACard: Story = {
  name: 'The same choice, as a card',
  args: { shape: 'card' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /start a case/i })).toBeVisible()
  },
}

/**
 * A choice with no `to` acts rather than navigates, and is a button.
 */
export const AsAButton: Story = {
  name: 'A choice that acts rather than navigates',
  args: {
    choice: {
      title: 'Fill from the last case',
      detail: 'Copy its scope.',
      icon: Plus,
      onSelect: fn(),
    },
  },
  play: async ({ canvas, args, userEvent }) => {
    const button = canvas.getByRole('button', { name: /fill from the last case/i })
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()

    await userEvent.click(button)
    await expect(args.choice.onSelect).toHaveBeenCalled()
  },
}

/**
 * The longest title and detail an install would put here, in both shapes.
 */
export const TheLongestText: Story = {
  name: 'A title nobody thought would be that long',
  args: {
    choice: {
      title: 'Business email compromise with payment fraud and mailbox forwarding',
      detail:
        'Mailbox rules, external forwarding, invoice interception and the '
        + 'recovery steps for each, with the finance handover already filled in.',
      icon: Import,
      to: '/cases/new',
    },
  },
  play: async ({ canvas, canvasElement }) => {
    const link = canvas.getByRole('link')
    await expect(link).toBeVisible()
    // The row must not push its own container wider than the screen gave it.
    await expect(link.getBoundingClientRect().width).toBeLessThanOrEqual(
      canvasElement.getBoundingClientRect().width,
    )
  },
}
