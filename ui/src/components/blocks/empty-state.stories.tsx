import type { Meta, StoryObj } from '@storybook/react-vite'
import { FileText, FlaskConical, Import, Plus, Table2 } from 'lucide-react'
import { MemoryRouter } from 'react-router-dom'
import { expect, fn } from 'storybook/test'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/blocks/empty-state'

/**
 * What a list or a pane draws instead of rows.
 */
const meta = {
  title: 'Blocks/Empty state/Empty state',
  component: EmptyState,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing to offer: the screen says what will appear here and stops. */
export const Bare: Story = {
  name: 'Nothing to offer',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No systems yet')).toBeVisible()
    await expect(canvas.getByText('Systems added to this case appear here.')).toBeVisible()
    await expect(canvas.queryByRole('button')).not.toBeInTheDocument()
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument()
  },
}

/** One way in, which is a single control rather than a tile. */
export const OneWayIn: Story = {
  name: 'One way in, as a button',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
    action: (
      <Button variant="outline">
        <Plus />
        Add a system
      </Button>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /add a system/i })).toBeVisible()
  },
}

/**
 * Several ways in, as tiles under a table.
 */
export const OffersInline: Story = {
  name: 'Several ways in, under a table',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
    offers: [
      { label: 'Add a system', icon: Plus, hint: 'One row, filled in by hand', onSelect: fn() },
      { label: 'Import a CSV', icon: Import, hint: 'A column per field', onSelect: fn() },
    ],
  },
  play: async ({ canvas, canvasElement, userEvent, args }) => {
    await expect(canvasElement.querySelector('[data-slot="empty-offers"]')).toHaveAttribute(
      'data-shape',
      'inline',
    )
    await expect(canvas.getByText('One row, filled in by hand')).toBeVisible()

    // No `to`, so each offer is a button that reports rather than navigates.
    await userEvent.click(canvas.getByRole('button', { name: /add a system/i }))
    await expect(args.offers?.[0]?.onSelect).toHaveBeenCalled()
  },
}

/**
 * The whole screen: tiles stacked one per line, inside a bounded panel.
 */
export const OffersStacked: Story = {
  name: 'The whole screen \u2014 stacked and bounded',
  args: {
    icon: FileText,
    title: 'No cases yet',
    detail: 'Start one, or open the example to see the shape of a finished case.',
    offerShape: 'stack',
    bounded: true,
    offers: [
      { label: 'Start a case', icon: Plus, hint: 'From a template, or empty', to: '/cases/new' },
      { label: 'Import a case', icon: Import, hint: 'An .iccase file', to: '/cases/import' },
      {
        label: 'Open the demo case',
        icon: FlaskConical,
        hint: 'A finished investigation to look through',
        to: '/cases/demo',
        apart: true,
      },
    ],
  },
  play: async ({ canvas, canvasElement, args }) => {
    await expect(canvasElement.querySelector('[data-slot="empty-offers"]')).toHaveAttribute(
      'data-shape',
      'stack',
    )
    // Every offer has a `to`, so every one is a link rather than a button.
    await expect(canvas.getAllByRole('link')).toHaveLength(args.offers?.length ?? 0)
    await expect(canvasElement.querySelectorAll('[data-slot="empty-offers-rule"]')).toHaveLength(1)
  },
}

/**
 * An empty `offers` list is absent rather than empty.
 */
export const NoOffers: Story = {
  name: 'An offers list with nothing in it',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
    offers: [],
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-slot="empty-offers"]')).toBeNull()
  },
}

/**
 * Both at once, for a screen whose primary way in is not one of its
 * alternatives.
 */
export const BothAtOnce: Story = {
  name: 'A primary control above the alternatives',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
    action: (
      <Button variant="outline">
        <Plus />
        Add a system
      </Button>
    ),
    offers: [
      { label: 'Import a CSV', icon: Import, hint: 'A column per field', onSelect: fn() },
      { label: 'Open the demo case', icon: FlaskConical, hint: 'To look through', to: '/cases/demo' },
    ],
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('button', { name: /add a system/i })).toBeVisible()
    await expect(canvasElement.querySelector('[data-slot="empty-offers"]')).not.toBeNull()
    // The offer with a route is a link; the one without is a button.
    await expect(canvas.getByRole('link', { name: /open the demo case/i })).toBeVisible()
    await expect(canvas.getByRole('button', { name: /import a csv/i })).toBeVisible()
  },
}

/**
 * `apart` on the first offer draws no rule, because there is nothing above it
 * to be held apart from.
 */
export const ApartOnTheFirst: Story = {
  name: 'A rule asked for above the first offer',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
    offers: [
      { label: 'Add a system', icon: Plus, hint: 'By hand', onSelect: fn(), apart: true },
      { label: 'Import a CSV', icon: Import, hint: 'A column per field', onSelect: fn(), apart: true },
    ],
  },
  play: async ({ canvasElement }) => {
    // One rule, between the two -- not two, and not one above the first.
    await expect(canvasElement.querySelectorAll('[data-slot="empty-offers-rule"]')).toHaveLength(1)
  },
}

/**
 * The longest title, detail and hint an install would put on an empty screen.
 */
export const TheLongestText: Story = {
  name: 'Words longer than the panel',
  args: {
    icon: Table2,
    title: 'No systems have been added to this case by anybody yet',
    detail:
      'Systems added to this case appear here, including everything the '
      + 'importer matched against an asset register and everything an analyst '
      + 'added by hand while working through the timeline.',
    offers: [
      {
        label: 'Add a system by hand, one row at a time',
        icon: Plus,
        hint: 'For a host nobody has an export for, or one found while reading the timeline',
        onSelect: fn(),
      },
    ],
  },
  render: (args) => (
    <div style={{ width: 560 }} data-testid="bounded">
      <EmptyState {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bound = canvasElement
      .querySelector('[data-testid="bounded"]')!
      .getBoundingClientRect()
    for (const el of canvasElement.querySelectorAll('p, button, h1, h2, h3')) {
      await expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(bound.right + 1)
    }
  },
}

/**
 * More ways in than a screen would offer, which is where the tiles stop being
 * alternatives and become a list.
 */
export const TooMuchData: Story = {
  name: 'Twelve ways in',
  args: {
    icon: Table2,
    title: 'No systems yet',
    detail: 'Systems added to this case appear here.',
    offerShape: 'stack',
    offers: Array.from({ length: 12 }, (_, i) => ({
      label: `Import from source ${String(i)}`,
      icon: Import,
      hint: 'A column per field',
      onSelect: fn(),
    })),
  },
  play: async ({ canvas }) => {
    const tiles = canvas.getAllByRole('button')
    await expect(tiles).toHaveLength(12)

    // Stacked one per line, all the way down rather than the first few only.
    const gap = (a: number, b: number) =>
      tiles[b]!.getBoundingClientRect().top - tiles[a]!.getBoundingClientRect().top
    await expect(gap(9, 10)).toBeCloseTo(gap(1, 2), 0)
  },
}
