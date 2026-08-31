import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'

import { DataTable, actionsColumn, selectionColumn } from '@/components/blocks/data-table'
import {
  ESTIMATED_ROW_HEIGHT,
  VIRTUALIZE_FROM,
  metaOf,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/entity-table'

/**
 * The table's *model*: the feature bundle, the column and meta types, and the
 * hook every screen builds its table with. It holds no primitive and imports
 * no component tier, so both table renderers run one TanStack table rather
 * than two.
 *
 * **So this file draws nothing, and its stories are about what the hook
 * decides.** Each one is a defect the hook exists to prevent, made visible:
 *
 * - `Paginated` -- the bundle registers a paginated row model and it is not
 *   inert. Without `manualPagination`, every table in the app shows its first
 *   ten rows and stops. `Sorted` has more than ten rows, so a regression here
 *   is visible rather than argued about.
 * - `ExpansionSurvivesARefetch` -- expansion resets whenever `data` changes
 *   identity, which for a query result is every render. Press *Refetch* with a
 *   row open.
 * - `SelectionIsKeyedById` -- without `getRowId`, TanStack keys selection and
 *   expansion by array index, so a sort moves the tick to a different row.
 *   Tick a row, then sort.
 * - `SomeRowsCannotBeTicked` -- `canSelect` takes the row's own data, because
 *   "may this row be selected" is a table-level question some tables answer.
 *
 * `DataTable` owns everything you can see here; this owns what it is fed.
 */
const meta: Meta = {
  title: 'Blocks/Table/Entity table model',
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

interface System {
  id: string
  hostname: string
  role: string
  verdict: string
}

const ROLES = ['Workstation', 'Domain controller', 'Mail gateway', 'File server']
const VERDICTS = ['Compromised', 'Clean', 'Unreviewed']

const SYSTEMS: System[] = Array.from({ length: 14 }, (_, index) => ({
  id: `sys-${String(index + 1).padStart(2, '0')}`,
  hostname: `FIN-WS-${String(index + 1).padStart(2, '0')}`,
  role: ROLES[index % ROLES.length]!,
  verdict: VERDICTS[index % VERDICTS.length]!,
}))

const columns: EntityColumn<System>[] = [
  { accessorKey: 'hostname', header: 'Host', meta: { className: 'w-48' } },
  { accessorKey: 'role', header: 'Role' },
  { accessorKey: 'verdict', header: 'Verdict', meta: { className: 'w-40' } },
]

/** The screen's half: it holds the rows and applies a commit itself. */
function useRows(initial: System[]) {
  const [rows, setRows] = useState(initial)
  const [generation, setGeneration] = useState(0)
  return {
    // A new array identity per refetch, which is what a query result gives.
    rows: generation === 0 ? rows : [...rows],
    refetch: () => { setGeneration((was) => was + 1) },
    commit: (id: string, fields: Partial<System>) => {
      setRows((current) => current.map((row) => (row.id === id ? { ...row, ...fields } : row)))
    },
    remove: (id: string) => { setRows((current) => current.filter((row) => row.id !== id)) },
  }
}

/**
 * Fourteen rows, all fourteen drawn, sortable by every column. Ten would be the
 * count if `manualPagination` were dropped.
 */
export const Paginated: Story = {
  render: () => {
    const Rendered = () => {
      const held = useRows(SYSTEMS)
      const table = useEntityTable<System>({
        data: held.rows,
        columns,
        meta: { pendingIds: new Set(), commit: held.commit, remove: held.remove },
        initialSorting: [{ id: 'hostname', desc: false }],
      })
      return (
        <>
          <DataTable table={table} label="Systems" />
          <p className="mt-2 font-mono text-2xs text-ink-muted">
            rows drawn: {table.getRowModel().rows.length} of {held.rows.length}
          </p>
        </>
      )
    }
    return <Rendered />
  },
  play: async ({ canvas }) => {
    // Ten is the number this fails at: TanStack's default page size, which is
    // what every table in the app would show if the bundle stopped registering
    // `manualPagination`. Fourteen rows is enough to tell the two apart.
    await expect(canvas.getAllByRole('row')).toHaveLength(SYSTEMS.length + 1)
    await expect(canvas.getByText('rows drawn: 14 of 14')).toBeVisible()
  },
}

/** Sorted on arrival, which `initialSorting` is for: the header shows the direction. */
export const Sorted: Story = {
  render: () => {
    const Rendered = () => {
      const held = useRows(SYSTEMS)
      const table = useEntityTable<System>({
        data: held.rows,
        columns,
        meta: { pendingIds: new Set(), commit: held.commit },
        initialSorting: [{ id: 'verdict', desc: true }],
      })
      return <DataTable table={table} label="Systems by verdict" />
    }
    return <Rendered />
  },
  play: async ({ canvas }) => {
    // Descending on a word column is alphabetical, so Unreviewed leads and
    // Clean trails. A table that ignored `initialSorting` would open on the
    // arrival order, where the first verdict is Compromised.
    const [, first] = canvas.getAllByRole('row')
    await expect(first).toHaveTextContent('Unreviewed')
    await expect(canvas.getAllByRole('row').at(-1)).toHaveTextContent('Clean')
  },
}

/**
 * Open a row, then press *Refetch*. The panel stays open, because
 * `autoResetExpanded` is off -- on, the open row would close on every render
 * a query produced.
 */
export const ExpansionSurvivesARefetch: Story = {
  render: () => {
    const Rendered = () => {
      const held = useRows(SYSTEMS.slice(0, 6))
      const table = useEntityTable<System>({
        data: held.rows,
        columns,
        meta: { pendingIds: new Set(), commit: held.commit },
        enableExpanding: true,
      })
      return (
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            className="rounded-sm border px-2 py-1 text-sm"
            onClick={held.refetch}
          >
            Refetch
          </button>
          <DataTable
            table={table}
            label="Systems"
            renderExpanded={(row) => (
              <p className="px-2 py-1 text-sm text-ink-muted">
                {row.original.hostname} &mdash; {row.original.role}
              </p>
            )}
          />
        </div>
      )
    }
    return <Rendered />
  },
  play: async ({ canvas, step }) => {
    await step('a row opens', async () => {
      // No actions column here, so the row itself is the affordance.
      await userEvent.click(canvas.getByText('FIN-WS-01'))
      await expect(canvas.getByText(/FIN-WS-01 . Workstation/)).toBeVisible()
    })
    await step('and survives a refetch', async () => {
      // The refetch hands the table a new array with the same contents, which
      // is what a query result does on every render. With `autoResetExpanded`
      // left on, the open row would close here and nothing would say why.
      await userEvent.click(canvas.getByRole('button', { name: 'Refetch' }))
      await expect(canvas.getByText(/FIN-WS-01 . Workstation/)).toBeVisible()
    })
  },
}

/**
 * Tick a row, then sort by another column. The tick follows its row, because
 * `getRowId` keys selection by id rather than by array index.
 */
export const SelectionIsKeyedById: Story = {
  render: () => {
    const Rendered = () => {
      const held = useRows(SYSTEMS.slice(0, 6))
      const table = useEntityTable<System>({
        data: held.rows,
        columns: [selectionColumn<System>(), ...columns],
        meta: { pendingIds: new Set(), commit: held.commit },
      })
      return (
        <>
          <DataTable table={table} label="Systems" />
          <p className="mt-2 font-mono text-2xs text-ink-muted">
            ticked:{' '}
            {table
              .getSelectedRowModel()
              .rows.map((row) => row.original.hostname)
              .join(', ') || '(none)'}
          </p>
        </>
      )
    }
    return <Rendered />
  },
  play: async ({ canvas, step }) => {
    await step('a row is ticked', async () => {
      await userEvent.click(canvas.getByRole('checkbox', { name: 'Select row sys-01' }))
      await expect(canvas.getByText('ticked: FIN-WS-01')).toBeVisible()
    })
    await step('and sorting does not move the tick to its neighbour', async () => {
      // Keyed by array index, the tick would stay on whatever row landed
      // first after the sort, which is a different host with no sign of the
      // swap. Role sorts FIN-WS-03 to the top.
      await userEvent.click(canvas.getByRole('button', { name: /Role/ }))
      await expect(canvas.getByText('ticked: FIN-WS-01')).toBeVisible()
    })
  },
}

/**
 * Only the compromised rows may be ticked.
 *
 * The rest keep their box and it is drawn disabled, so the column stays one
 * column wide down the table and the rows that refuse the tick say so where
 * the tick would have gone.
 */
export const SomeRowsCannotBeTicked: Story = {
  render: () => {
    const Rendered = () => {
      const held = useRows(SYSTEMS.slice(0, 6))
      const table = useEntityTable<System>({
        data: held.rows,
        columns: [selectionColumn<System>(), ...columns],
        meta: { pendingIds: new Set(), commit: held.commit },
        canSelect: (row) => row.verdict === 'Compromised',
      })
      return <DataTable table={table} label="Systems" />
    }
    return <Rendered />
  },
  play: async ({ canvas }) => {
    // Every row keeps its box, header included: seven for six rows.
    await expect(canvas.getAllByRole('checkbox')).toHaveLength(7)

    // Two of the six are compromised. `canSelect` reads the row's own data,
    // so which rows refuse the tick is a question about the verdict rather
    // than about the position -- an implementation keyed by index would
    // disable the same three slots whatever the table held.
    await expect(canvas.getByRole('checkbox', { name: 'Select row sys-01' })).toBeEnabled()
    await expect(canvas.getByRole('checkbox', { name: 'Select row sys-04' })).toBeEnabled()
    await expect(canvas.getByRole('checkbox', { name: 'Select row sys-02' })).toBeDisabled()
    await expect(canvas.getByRole('checkbox', { name: 'Select row sys-03' })).toBeDisabled()
  },
}

/**
 * A row mid-write. `pendingIds` is the one piece of meta a screen must keep
 * current, and `metaOf` throws by name at any table that was not built here.
 */
export const RowsBeingWritten: Story = {
  render: () => {
    const Rendered = () => {
      const held = useRows(SYSTEMS.slice(0, 6))
      const table = useEntityTable<System>({
        data: held.rows,
        columns: [...columns, actionsColumn<System>((row) => row.hostname)],
        meta: {
          pendingIds: new Set(['sys-02', 'sys-04']),
          commit: held.commit,
          remove: held.remove,
          edit: () => undefined,
        },
      })
      return (
        <>
          <DataTable table={table} label="Systems" />
          <p className="mt-2 font-mono text-2xs text-ink-muted">
            pending: {[...metaOf(table).pendingIds].join(', ')}
          </p>
        </>
      )
    }
    return <Rendered />
  },
  play: async ({ canvas }) => {
    // `metaOf` is the only reader of `pendingIds`, and it throws by name at a
    // table built anywhere but the hook. Reading the two ids back out of it
    // is what says the meta survived the bundle.
    await expect(canvas.getByText('pending: sys-02, sys-04')).toBeVisible()
  },
}

/**
 * Past `VIRTUALIZE_FROM` rows the table windows itself, and only the
 * scrollbar sees `ESTIMATED_ROW_HEIGHT` -- `measureElement` corrects it on
 * first paint.
 */
export const Windowed: Story = {
  render: () => {
    const Rendered = () => {
      const many = Array.from({ length: 300 }, (_, index) => ({
        id: `sys-${String(index)}`,
        hostname: `FIN-WS-${String(index).padStart(3, '0')}`,
        role: ROLES[index % ROLES.length]!,
        verdict: VERDICTS[index % VERDICTS.length]!,
      }))
      const held = useRows(many)
      const table = useEntityTable<System>({
        data: held.rows,
        columns,
        meta: { pendingIds: new Set(), commit: held.commit },
      })
      return (
        <>
          <DataTable table={table} label="Systems" scroll="box" />
          <p className="mt-2 font-mono text-2xs text-ink-muted">
            {held.rows.length} rows, windowed from {VIRTUALIZE_FROM}, estimated{' '}
            {ESTIMATED_ROW_HEIGHT}px
          </p>
        </>
      )
    }
    return <Rendered />
  },
  play: async ({ canvas }) => {
    // Windowing is the whole claim: three hundred rows in the model and a
    // fraction of them in the document. A table that drew all three hundred
    // would look identical and cost a second of layout per keystroke.
    const drawn = canvas.getAllByRole('row').length
    await expect(drawn).toBeGreaterThan(1)
    await expect(drawn).toBeLessThan(300)
    await expect(canvas.getByText(/300 rows, windowed from/)).toBeVisible()
  },
}
