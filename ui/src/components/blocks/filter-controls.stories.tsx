import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { TableToolbar } from '@/components/blocks/table-toolbar'
import { FilterControls } from '@/components/blocks/filter-controls'
import { useFilters, type FilterDimension } from '@/components/blocks/filter-set'
import { useState } from 'react'

/**
 * The filter concern for one table, declared rather than assembled.
 *
 * A screen names its dimensions and holds one value; the block draws the
 * popover, the tokens on the bar and the way back out of each of them.
 */
const meta = {
  title: 'Blocks/Table/Filter set',
  component: FilterControls,
  parameters: { layout: 'padded' },
  args: { dimensions: [], selection: {}, onChange: () => undefined },
} satisfies Meta<typeof FilterControls>

export default meta
type Story = StoryObj<typeof meta>

const KINDS: FilterDimension = {
  key: 'kind',
  label: 'Kind',
  options: [
    { value: 'Assets', count: 18 },
    { value: 'Accounts', count: 13 },
    { value: 'Network', count: 15 },
    { value: 'Malware', count: 9 },
    { value: 'Cloud Apps', count: 0 },
  ],
}

const ATTENTION: FilterDimension = {
  key: 'attention',
  label: 'Attention',
  mode: 'one',
  options: [
    { value: 'attention', label: 'Needs attention', count: 15 },
    { value: 'clear', label: 'Clear', count: 40 },
  ],
}

const CATEGORY: FilterDimension = {
  key: 'category',
  label: 'Category',
  as: 'picker',
  groupLabel: 'Data category',
  options: [
    { value: 'credentials', count: 4 },
    { value: 'financial records', count: 2 },
    { value: 'special category data', count: 1 },
    { value: 'operational or technical', count: 3 },
  ],
}

/** The whole thing on a toolbar, which is where a screen meets it. */
function OnAToolbar({ dimensions }: { dimensions: readonly FilterDimension[] }) {
  const [query, setQuery] = useState('')
  const filters = useFilters(dimensions)

  return (
    <TableToolbar
      searchColumn="Entity"
      placeholder="Name or value"
      value={query}
      onValue={setQuery}
      applied={filters.applied}
      narrowed={query.trim() !== '' || filters.narrowed}
      onClear={() => {
        setQuery('')
        filters.clear()
      }}
      filters={<FilterControls {...filters.controls} />}
    />
  )
}

/** Nothing on: the bar is the bar it was before tokens existed. */
export const Unfiltered: Story = {
  render: () => <OnAToolbar dimensions={[KINDS, ATTENTION, CATEGORY]} />,
}

/**
 * Two filters on, each removable on its own.
 *
 * The token names its filter in the remove button's label, so a screen reader
 * meeting six of them hears six different controls.
 */
export const Tokens: Story = {
  render: () => <OnAToolbar dimensions={[KINDS, ATTENTION, CATEGORY]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Filters' }))
    const pane = within(document.body)

    // Painted, not merely present: every assertion below passes at opacity 0.
    const panel = document.querySelector('[data-slot="popover"]')
    await expect(panel).not.toBeNull()
    await waitFor(async () => {
      await expect(Number(getComputedStyle(panel!).opacity)).toBeGreaterThan(0.9)
    })

    await userEvent.click(await pane.findByRole('button', { name: /^Assets/ }))
    await userEvent.click(await pane.findByRole('button', { name: /^Needs attention/ }))
    await userEvent.keyboard('{Escape}')

    await expect(
      canvas.getByRole('button', { name: 'Remove the Needs attention filter' }),
    ).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Remove the Assets filter' })).toBeInTheDocument()
  },
}

/** The popover's own contents: a column of groups, each flowing on one line. */
export const Controls: Story = {
  args: { dimensions: [KINDS, ATTENTION, CATEGORY] },
}

/**
 * A dimension the screen is offering nothing for draws no heading.
 *
 * Evidence hides Type in a case that holds none, and a heading over nothing
 * reads as a control that has stopped working.
 */
export const AnEmptyDimension: Story = {
  args: { dimensions: [KINDS, { ...ATTENTION, options: [] }] },
}
