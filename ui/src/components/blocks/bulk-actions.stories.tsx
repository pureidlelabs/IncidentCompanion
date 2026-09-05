import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'

import { expect, userEvent, waitFor, within } from 'storybook/test'

import type { SystemEntry } from '@/api/model'
import { formSpec } from '@/api/specs'
import {
  BulkActionBar,
  BulkEditDialog,
  bulkFieldsFor,
  type BulkField,
} from '@/components/blocks/bulk-actions'
import {
  DataTable,
  selectionColumn,
  useEntityTable,
  type EntityColumn,
} from '@/components/blocks/data-table'
import { Button } from '@/components/ui/button'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

/** The same five fields the running Systems screen derives, from the same document. */
const SYSTEMS_BULK_FIELDS: readonly BulkField<SystemEntry>[] = bulkFieldsFor(
  formSpec<SystemEntry>(specsFixture, 'SYSTEM_FIELDS'),
)

/**
 * `BulkActionBar` on the React Aria kit, over fixture rows and the field list
 * the served spec produces.
 */
// Not `satisfies Meta<typeof BulkActionBar>`: the table comes from a hook, so
// every story renders a harness rather than passing `table` as an arg.
const meta: Meta = {
  title: 'Blocks/Table/Bulk actions',
  component: BulkActionBar,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

/**
 * The table the bar is really used over.
 */
const columns: EntityColumn<SystemEntry>[] = [
  selectionColumn<SystemEntry>((row) => `Select ${row.hostname}`),
  { accessorKey: 'hostname', header: 'Hostname' },
  { accessorKey: 'verdict', header: 'Verdict', meta: { className: 'w-40' } },
  {
    accessorKey: 'isolated',
    header: 'Isolated',
    meta: { className: 'w-24' },
    cell: ({ row }) => <span className="text-xs">{row.original.isolated ? 'Yes' : 'No'}</span>,
  },
]

function Harness({
  fields,
  selected = 3,
}: {
  fields: readonly BulkField<SystemEntry>[]
  /** How many rows the story opens with ticked. */
  selected?: number
}) {
  const [rows, setRows] = useState<SystemEntry[]>(campaignCase.systems.slice(0, 6))
  const table = useEntityTable<SystemEntry>({
    data: rows,
    columns,
    meta: {
      pendingIds: new Set<string>(),
      commit: () => undefined,
      remove: () => undefined,
    },
  })

  const model = table.getRowModel().rows
  useEffect(() => {
    for (const row of model.slice(0, selected)) {
      if (!row.getIsSelected()) row.toggleSelected(true)
    }
    // The opening selection, once. Ticking a box afterwards is the analyst's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-(--control-h-sm) items-center justify-between gap-3 px-1">
        <p className="text-xs text-ink-muted">{rows.length} systems</p>
        <BulkActionBar
          table={table}
          fields={fields}
          onApply={(ids, patch) => {
            setRows((current) =>
              current.map((row) => (ids.includes(row.id) ? { ...row, ...patch } : row)),
            )
          }}
          onRequestDelete={(ids) => {
            setRows((current) => current.filter((row) => !ids.includes(row.id)))
            table.resetRowSelection()
          }}
        />
      </div>
      <DataTable table={table} scroll="box" label="Systems" />
    </div>
  )
}

/**
 * The bar over a table with three rows ticked.
 */
export const Default: Story = {
  name: 'Rows ticked, with both controls',
  render: () => <Harness fields={SYSTEMS_BULK_FIELDS} />,
  play: async ({ canvas, step }) => {
    await step('The bar counts what the table has ticked', async () => {
      await expect(canvas.getByText(/3 selected/)).toBeVisible()
    })

    await step('And the select-all in the header moves that count', async () => {
      await userEvent.click(canvas.getByRole('checkbox', { name: 'Select every row' }))
      await waitFor(() => {
        void expect(canvas.getByText(/6 selected/)).toBeVisible()
      })
    })
  },
}

/**
 * A table whose fields are all free text gets no Edit button, not an empty
 * dialog.
 */
export const NoClosedVocabulary: Story = {
  name: 'A table with nothing bulk-settable',
  render: () => <Harness fields={[]} />,
  play: async ({ canvas, step }) => {
    await step('Rows are ticked and the bar is there', async () => {
      await expect(canvas.getByText(/3 selected/)).toBeVisible()
    })

    await step('But there is nothing to edit them with', async () => {
      await expect(canvas.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    })
  },
}

/**
 * Nothing ticked: the bar takes no space, so the header does not reflow.
 */
export const NothingSelected: Story = {
  name: 'Nothing selected',
  render: () => <Harness fields={SYSTEMS_BULK_FIELDS} selected={0} />,
  play: async ({ canvas, step }) => {
    await step('No count and no controls', async () => {
      await expect(canvas.queryByText(/selected/)).not.toBeInTheDocument()
      await expect(canvas.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    })

    await step('And the band is still its own height', async () => {
      const band = canvas.getByText(/6 systems/).parentElement!
      await expect(band.getBoundingClientRect().height).toBeGreaterThan(20)
    })
  },
}

/** One row: the counts read `1`, and the dialog names one row. */
export const OneRow: Story = {
  name: 'One row ticked',
  render: () => <Harness fields={SYSTEMS_BULK_FIELDS} selected={1} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/1 selected/)).toBeVisible()
    await expect(canvas.queryByText(/1 selecteds/)).not.toBeInTheDocument()
  },
}

/**
 * The dialog itself, on three rows. Apply refuses until a field moves.
 */
export const TheDialog: Story = {
  name: 'The edit dialog',
  parameters: { docs: { story: { inline: false, height: '620px' } } },
  render: function TheDialog() {
    const [ids, setIds] = useState<string[] | null>(['a', 'b', 'c'])
    return (
      <>
        <Button
          variant="outline"
          onPress={() => {
            setIds(['a', 'b', 'c'])
          }}
        >
          Edit three rows
        </Button>
        <BulkEditDialog
          ids={ids}
          fields={SYSTEMS_BULK_FIELDS}
          onOpenChange={(open) => {
            if (!open) setIds(null)
          }}
          onApply={() => undefined}
        />
      </>
    )
  },
  play: async ({ canvasElement, step }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = within(await body.findByRole('dialog'))

    await step('It names how many rows it is about to write', async () => {
      await expect(body.getByRole('dialog')).toHaveTextContent('Edit 3 selected')
    })

    // Every field opens at *leave unchanged* rather than at the value some row
    // happens to hold, so opening the dialog and shutting it again changes
    // nothing.
    await step('And every field opens at leave unchanged', async () => {
      const pickers = dialog
        .getAllByRole('button')
        .filter((button) => button.textContent.includes('leave unchanged'))
      await expect(pickers.length).toBeGreaterThan(2)
    })

    // The claim this dialog exists for. A bulk write firing on an untouched
    // form writes every row's current value back over itself, which is a
    // version bump on rows nobody edited.
    await step('Apply refuses while nothing has moved', async () => {
      await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled()
    })

    // The other half, without which the first is satisfied by an Apply that is
    // always dead.
    await step('And opens as soon as one does', async () => {
      const picker = dialog
        .getAllByRole('button')
        .find((button) => button.textContent.includes('leave unchanged'))!
      await userEvent.click(picker)
      await userEvent.click(await body.findByRole('option', { name: 'server' }))

      await waitFor(() => {
        void expect(dialog.getByRole('button', { name: 'Apply' })).toBeEnabled()
      })
    })
  },
}
