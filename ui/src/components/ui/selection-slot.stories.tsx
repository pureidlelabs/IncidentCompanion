import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import type { SystemEntry } from '@/api/model'
import {
  DataTable,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import {
  SelectionActions,
  SelectionSlotProvider,
  useSelectionSlotHost,
} from '@/components/ui/selection-slot'
import { Button } from '@/components/ui/button'
import { campaignCase } from '@/fixtures/campaign'

/**
 * Where a table's selection actions are drawn, decided by the screen rather
 * than by the table.
 */
const meta = {
  title: 'Utilities/Selection slot',
  component: SelectionActions,
  parameters: { layout: 'padded' },
  // Every story drives a real `useEntityTable`, so the count is the table's and
  // these reach nothing.
  args: { count: 0, children: null },
} satisfies Meta<typeof SelectionActions>

export default meta
type Story = StoryObj<typeof meta>

const columns: EntityColumn<SystemEntry>[] = [
  selectionColumn<SystemEntry>((row) => `Select ${row.hostname}`),
  { accessorKey: 'hostname', header: 'Hostname' },
  { accessorKey: 'systemType', header: 'Asset type', meta: { className: 'w-40' } },
  { accessorKey: 'zone', header: 'Zone', meta: { className: 'w-48' } },
]

/** The two controls a scoped entity table offers over a selection. */
function Actions({ count }: { count: number }) {
  return (
    <>
      <span className="text-xs text-ink-muted tabular-nums">{count} selected</span>
      <Button variant="outline" size="sm">
        Set verdict
      </Button>
      <Button variant="destructive" size="sm">
        Delete
      </Button>
    </>
  )
}

/** Fixture rows in a real table, with the first `selected` of them ticked. */
function useSystems(rows: number, selected: number) {
  const [data] = useState(() => campaignCase.systems.slice(0, rows))
  const table = useEntityTable<SystemEntry>({
    data,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined, remove: () => undefined },
  })
  const [seeded, setSeeded] = useState(false)
  if (!seeded) {
    setSeeded(true)
    table.setRowSelection(Object.fromEntries(data.slice(0, selected).map((row) => [row.id, true])))
  }
  return table
}

/**
 * The screen hosts the slot in its filter row, so the actions render there
 * while the table below stays where it is.
 */
function Hosted({ rows = 6, selected }: { rows?: number; selected: number }) {
  const [node, setNode] = useSelectionSlotHost()
  const table = useSystems(rows, selected)
  const count = table.getSelectedRowModel().rows.length
  return (
    <SelectionSlotProvider container={node}>
      <div className="flex flex-col gap-3">
        <div className="flex min-h-(--control-h-sm) items-center gap-2 rounded-md border px-2 py-1.5">
          <span className="text-xs text-ink-muted">Filter row</span>
          <div ref={setNode} className="ml-auto flex items-center gap-2" />
        </div>
        <SelectionActions count={count}>
          <Actions count={count} />
        </SelectionActions>
        <DataTable table={table} label="Systems" />
      </div>
    </SelectionSlotProvider>
  )
}

/**
 * Rows are ticked and a slot is mounted, so the bar sits in the filter row.
 */
export const IntoASlot: Story = {
  name: 'Portalled into the filter row',
  render: () => <Hosted selected={2} />,
  play: async ({ canvas, step }) => {
    const filterRow = canvas.getByText('Filter row').parentElement!
    const verdict = canvas.getByRole('button', { name: 'Set verdict' })

    await step('The count is the table\u2019s own', async () => {
      await expect(canvas.getByText('2 selected')).toBeVisible()
    })

    await step('And the actions landed inside the filter row', async () => {
      await expect(filterRow.contains(verdict)).toBe(true)
    })

    await step('Above the table rather than between it and the row', async () => {
      const table = canvas.getByRole('grid').getBoundingClientRect()
      await expect(verdict.getBoundingClientRect().bottom).toBeLessThanOrEqual(table.top + 1)
    })
  },
}

/**
 * Nothing is ticked, so the actions render nothing at all and nothing reflows.
 */
export const NothingSelected: Story = {
  name: 'Nothing selected',
  render: () => <Hosted selected={0} />,
  play: async ({ canvas, step }) => {
    await step('No controls and no count', async () => {
      await expect(canvas.queryByRole('button', { name: 'Set verdict' })).not.toBeInTheDocument()
      await expect(canvas.queryByText(/selected/)).not.toBeInTheDocument()
    })

    await step('And the filter row is still its own height', async () => {
      const row = canvas.getByText('Filter row').parentElement!
      await expect(row.getBoundingClientRect().height).toBeGreaterThan(20)
    })
  },
}

/**
 * One row: the count reads `1`, and the slot holds the same two controls.
 */
export const OneRow: Story = {
  name: 'One row ticked',
  render: () => <Hosted selected={1} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('1 selected')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Set verdict' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Delete' })).toBeVisible()
  },
}

/**
 * Every row ticked over a table long enough to scroll. The bar is in the filter
 * row above, so it stays put while the rows move under it.
 */
export const WholeTable: Story = {
  name: 'Every row ticked',
  render: () => <Hosted rows={30} selected={30} />,
  play: async ({ canvas, step }) => {
    await step('Thirty rows, and the count says so', async () => {
      await expect(canvas.getByText('30 selected')).toBeVisible()
    })

    // The reason to portal at all: the bar is in the band above rather than in
    // the scrolling region, so it does not leave the screen with the rows.
    await step('And the bar is above the table, not inside it', async () => {
      const table = canvas.getByRole('grid')
      const verdict = canvas.getByRole('button', { name: 'Set verdict' })
      await expect(table.contains(verdict)).toBe(false)
      await expect(verdict.getBoundingClientRect().top).toBeLessThan(
        table.getBoundingClientRect().top,
      )
    })
  },
}

/**
 * No slot is mounted, so the same actions render in place, above the table.
 */
export const NoSlot: Story = {
  name: 'With no slot mounted',
  render: function NoSlot() {
    const table = useSystems(6, 2)
    const count = table.getSelectedRowModel().rows.length
    return (
      <div className="flex flex-col gap-3">
        <SelectionActions count={count}>
          <Actions count={count} />
        </SelectionActions>
        <DataTable table={table} label="Systems" />
      </div>
    )
  },
  play: async ({ canvas, step }) => {
    await step('The actions are there without a slot to hold them', async () => {
      await expect(canvas.getByText('2 selected')).toBeVisible()
      await expect(canvas.getByRole('button', { name: 'Set verdict' })).toBeVisible()
    })

    await step('And there is no filter row for them to be in', async () => {
      await expect(canvas.queryByText('Filter row')).not.toBeInTheDocument()
    })
  },
}

/**
 * Ticking a row in the table fills the slot; unticking it empties the slot
 * again.
 */
export const Ticking: Story = {
  name: 'Ticking a row fills the slot',
  render: () => <Hosted selected={0} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', { name: 'Select DC-01' })
    await userEvent.click(box)
    await waitFor(async () => {
      await expect(canvas.getByText('1 selected')).toBeVisible()
    })
    await userEvent.click(box)
    await waitFor(async () => {
      await expect(canvas.queryByText('1 selected')).toBeNull()
    })
  },
}
