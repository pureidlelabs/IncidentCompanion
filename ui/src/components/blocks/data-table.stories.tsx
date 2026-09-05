import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, waitFor, within } from 'storybook/test'

import type { SystemEntry, TimelineEntry } from '@/api/model'
import {
  DataTable,
  actionsColumn,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { EmptyState } from '@/components/blocks/empty-state'
import { FieldToneBadge } from '@/components/blocks/severity-badge'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { cn } from '@/lib/cn'

/**
 * `DataTable` on the React Aria kit, over two unrelated row types.
 */
// Not `satisfies Meta<typeof DataTable>`: the table is built by a hook, so
// every story renders a harness rather than passing `table` as an arg.
const meta: Meta = {
  title: 'Blocks/Table/Data table',
  component: DataTable,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

/** The served tones for the systems verdict, read the way a screen reads them. */
const verdictTones = specsFixture.fieldTones.verdict ?? {}

/** A harness standing in for the section: it holds the rows and applies the
 *  commit itself, which is what `useEntryMutation`'s `onMutate` does. */
function useLocalRows<T extends { id: string }>(initial: T[]) {
  const [rows, setRows] = useState(initial)
  return {
    rows,
    commit: (id: string, fields: Partial<T>) => {
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...fields } : row)))
    },
    remove: (id: string) => {
      setRows((current) => current.filter((row) => row.id !== id))
    },
  }
}

const timelineColumns: EntityColumn<TimelineEntry>[] = [
  selectionColumn<TimelineEntry>(),
  { accessorKey: 'time', header: 'Time', meta: { className: 'w-40' } },
  { accessorKey: 'description', header: 'Description' },
]

const systemColumns: EntityColumn<SystemEntry>[] = [
  selectionColumn<SystemEntry>((row) => `Select ${row.hostname}`),
  {
    accessorKey: 'hostname',
    header: 'Hostname',
    cell: ({ row, table }) => (
      <span
        className={cn(
          'truncate',
          table.options.meta?.pendingIds.has(row.id) === true && 'opacity-50',
        )}
      >
        {row.original.hostname}
      </span>
    ),
  },
  { accessorKey: 'systemType', header: 'Asset type', meta: { className: 'w-40' } },
  {
    accessorKey: 'verdict',
    header: 'Verdict',
    meta: { className: 'w-36' },
    cell: ({ row }) => (
      <FieldToneBadge value={row.original.verdict} tone={verdictTones[row.original.verdict]} />
    ),
  },
  { accessorKey: 'zone', header: 'Zone', meta: { className: 'w-32' } },
  actionsColumn<SystemEntry>((row) => row.hostname),
]

/**
 * 30 systems, every row in the DOM.
 */
export const Rows: Story = {
  name: '30 systems',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems)
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        initialSorting: [{ id: 'hostname', desc: false }],
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      return <DataTable table={table} label="Systems" />
    }
    return <Harness />
  },
  play: async ({ canvas, step }) => {
    await step('Every row is drawn, not a window over them', async () => {
      await expect(canvas.getAllByRole('row').length).toBeGreaterThan(campaignCase.systems.length)
    })

    await step('And the sort it opened with holds', async () => {
      const hosts = canvas
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelectorAll('td')[1]?.textContent ?? '')
        .filter(Boolean)
      await expect([...hosts]).toEqual([...hosts].sort((a, b) => a.localeCompare(b)))
    })
  },
}

/**
 * The `empty` prop replaces the table outright.
 */
export const Empty: Story = {
  name: 'No rows at all',
  render: () => {
    const Harness = () => {
      const table = useEntityTable<SystemEntry>({
        data: [],
        columns: systemColumns,
        meta: { pendingIds: new Set(), commit: () => undefined, remove: () => undefined },
      })
      return (
        <DataTable table={table} label="Systems" empty={<EmptyState title="No systems yet" />} />
      )
    }
    return <Harness />
  },
  play: async ({ canvas, step }) => {
    await step('The empty state is what is drawn', async () => {
      await expect(canvas.getByText('No systems yet')).toBeInTheDocument()
    })

    await step('And the column headings went with the rows', async () => {
      await expect(canvas.queryByRole('columnheader')).not.toBeInTheDocument()
      await expect(canvas.queryByRole('grid')).not.toBeInTheDocument()
    })
  },
}

/**
 * Two rows ticked. The selection is the TanStack table's, not React Aria's.
 */
export const Selection: Story = {
  name: 'Two rows ticked',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems.slice(0, 6))
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      // Seeded from an effect rather than during render: `setRowSelection`
      // called on the way through is dropped, and the story drew a table with
      // nothing ticked under the name `Two rows ticked`.
      const model = table.getRowModel().rows
      useEffect(() => {
        for (const row of model.slice(0, 2)) row.toggleSelected(true)
        // Once, at mount. Ticking a box afterwards is the analyst's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [])
      return <DataTable table={table} label="Systems" />
    }
    return <Harness />
  },
  play: async ({ canvas, step }) => {
    await step('Two of the six are ticked', async () => {
      const ticked = canvas
        .getAllByRole('checkbox')
        .filter((box) => (box as HTMLInputElement).checked)
      await expect(ticked).toHaveLength(2)
    })

    // `data-state`, not `aria-selected`: the selection is the table's rather
    // than the grid's, so the row is marked for the stylesheet and the checkbox
    // is what reports it to a reader.
    await step('And the rows they belong to are marked', async () => {
      const marked = canvas
        .getAllByRole('row')
        .filter((row) => row.getAttribute('data-state') === 'selected')
      await expect(marked).toHaveLength(2)
    })
  },
}

/**
 * One row has a write in flight, so its cells dim.
 */
export const PendingRow: Story = {
  name: 'A row with a write in flight',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems.slice(0, 6))
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        meta: {
          pendingIds: new Set([local.rows[0]?.id ?? '']),
          commit: local.commit,
          remove: local.remove,
        },
      })
      return <DataTable table={table} label="Systems" />
    }
    return <Harness />
  },
  play: async ({ canvas, step }) => {
    const rows = canvas.getAllByRole('row').slice(1)

    // The dimming is on the value inside the cell rather than on the row or the
    // cell, so a reading taken from either comes back at full strength.
    await step('The value in flight is dimmed', async () => {
      const value = rows[0]!.querySelectorAll('td')[1]!.querySelector('span')!
      await expect(Number.parseFloat(getComputedStyle(value).opacity)).toBeLessThan(1)
    })

    await step('And the rows around it are not', async () => {
      for (const row of rows.slice(1)) {
        const value = row.querySelectorAll('td')[1]!.querySelector('span')!
        await expect(getComputedStyle(value).opacity).toBe('1')
      }
    })
  },
}

/**
 * 88 timeline entries, and only the ones in view are in the DOM.
 */
export const LargeSet: Story = {
  name: '88 entries, windowed',
  play: async ({ canvasElement }) => {
    const drawn = await waitFor(async () => {
      const rows = canvasElement.querySelectorAll('[data-slot="table"] [role="row"]')
      await expect(rows.length).toBeGreaterThan(1)
      return rows.length
    })
    // 89 is the header plus all 88 entries. A window is the header, the rows
    // on screen, the overscan and the two spacers - far short of it.
    await expect(drawn).toBeLessThan(60)

    // The rows off the bottom are reachable, so the window moves rather than
    // the table simply being clipped - the two give the same count.
    const last = campaignCase.timeline.at(-1)?.id ?? ''
    const box = canvasElement.querySelector('[data-slot="table-scroll"]')
    if (!(box instanceof HTMLElement)) throw new Error('the table has no scroller')
    box.scrollTop = box.scrollHeight
    await waitFor(() => {
      if (canvasElement.querySelector(`[data-row-id="${CSS.escape(last)}"]`) === null) {
        throw new Error('the last entry is not drawn at the bottom of the scroll')
      }
    })
  },
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.timeline)
      const table = useEntityTable<TimelineEntry>({
        data: local.rows,
        columns: timelineColumns,
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      return <DataTable table={table} label="Timeline entries" />
    }
    return <Harness />
  },
}

/** One row open, with its detail panel spanning every column. */
export const Expanded: Story = {
  name: 'One row open',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems.slice(0, 4))
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        enableExpanding: true,
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      const [seeded, setSeeded] = useState(false)
      if (!seeded && local.rows.length > 0) {
        setSeeded(true)
        table.setExpanded({ [local.rows[0]!.id]: true })
      }
      return (
        <DataTable
          table={table}
          label="Systems"
          renderExpanded={(row) => (
            <div className="px-3 py-2 text-sm text-ink-muted">
              {row.original.hostname} is tagged {row.original.tags}
            </div>
          )}
        />
      )
    }
    return <Harness />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/is tagged/)).toBeInTheDocument()
  },
}

/** One row, which is where a table's chrome costs the most per row shown. */
export const OneRow: Story = {
  name: 'One row',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems.slice(0, 1))
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      return <DataTable table={table} label="Systems" />
    }
    return <Harness />
  },
}

/**
 * A description far wider than its column, and a hostname with no break in it.
 */
export const LongValues: Story = {
  name: 'Values too long for their columns',
  render: () => {
    const Harness = () => {
      const systems: SystemEntry[] = campaignCase.systems.slice(0, 3).map((row, at) =>
        at === 0
          ? {
              ...row,
              hostname:
                'WKS-FINANCE-RECONCILIATION-0417.corp.meridian-holdings.example.internal',
            }
          : row,
      )
      const entries: TimelineEntry[] = campaignCase.timeline.slice(0, 3).map((row, at) =>
        at === 0
          ? {
              ...row,
              description:
                'Bulk mailbox read against 9 Meridian mailboxes through the Graph API, from a session token minted 4 minutes earlier on an unenrolled device in a jurisdiction the tenant has never signed in from',
            }
          : row,
      )
      const hosts = useLocalRows(systems)
      const timeline = useLocalRows(entries)
      const systemTable = useEntityTable<SystemEntry>({
        data: hosts.rows,
        columns: systemColumns,
        meta: { pendingIds: new Set(), commit: hosts.commit, remove: hosts.remove },
      })
      const timelineTable = useEntityTable<TimelineEntry>({
        data: timeline.rows,
        columns: timelineColumns,
        meta: { pendingIds: new Set(), commit: timeline.commit, remove: timeline.remove },
      })
      return (
        <div className="flex flex-col gap-6">
          <DataTable table={systemTable} label="Systems" />
          <DataTable table={timelineTable} label="Timeline entries" />
        </div>
      )
    }
    return <Harness />
  },
}

/**
 * A row arrived at from elsewhere: the table scrolls to it and flashes it once.
 */
export const Highlighted: Story = {
  name: 'A row arrived at from elsewhere',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.timeline)
      const table = useEntityTable<TimelineEntry>({
        data: local.rows,
        columns: timelineColumns,
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      return (
        <DataTable
          table={table}
          label="Timeline entries"
          highlightId={campaignCase.timeline.at(60)?.id}
        />
      )
    }
    return <Harness />
  },
}

/**
 * The row's actions, with a screen's handlers behind them.
 */
export const RevealOnHover: Story = {
  name: 'A row with its actions',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems.slice(0, 5))
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        meta: {
          pendingIds: new Set(),
          commit: local.commit,
          remove: local.remove,
          edit: () => undefined,
        },
      })
      return <DataTable table={table} label="Systems" />
    }
    return <Harness />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const label = campaignCase.systems[0]?.hostname ?? ''
    await expect(canvas.getByRole('button', { name: `Edit ${label} in full` })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: `Delete ${label}` })).toBeInTheDocument()
  },
}

/**
 * A row with no verb at all: no expand, no edit, no delete.
 */
export const MenuOnlyRow: Story = {
  name: 'A row whose only offer is its menu',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems.slice(0, 5))
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        meta: { pendingIds: new Set(), commit: local.commit },
      })
      return <DataTable table={table} label="Systems" />
    }
    return <Harness />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const label = campaignCase.systems[0]?.hostname ?? ''
    await expect(canvas.getByRole('button', { name: `More for ${label}` })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: `Edit ${label} in full` })).toBeNull()
    await expect(canvas.queryByRole('button', { name: `Delete ${label}` })).toBeNull()
  },
}

/** A page-scrolled table in a box narrower than its own floor. */
export const NarrowerThanItsFloor: Story = {
  name: 'Narrower than its floor \u2014 the rows stay inside the border',
  render: () => {
    const Harness = () => {
      const local = useLocalRows(campaignCase.systems)
      const table = useEntityTable<SystemEntry>({
        data: local.rows,
        columns: systemColumns,
        meta: { pendingIds: new Set(), commit: local.commit, remove: local.remove },
      })
      return (
        <div style={{ width: 640 }}>
          <DataTable table={table} scroll="page" label="Systems" />
        </div>
      )
    }
    return <Harness />
  },
  play: async ({ canvasElement }) => {
    const box = canvasElement.querySelector('[data-slot="table-scroll"]')
    await expect(box).not.toBeNull()
    const table = box!.querySelector('table')
    await expect(table).not.toBeNull()
    await expect(table!.getBoundingClientRect().right).toBeLessThanOrEqual(
      box!.getBoundingClientRect().right + 1,
    )
  },
}
