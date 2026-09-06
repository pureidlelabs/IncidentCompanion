import type { Meta, StoryObj } from '@storybook/react-vite'
import { ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'

import type { SystemEntry } from '@/api/model'
import { Collection } from '@/components/blocks/collection'
import { selectionColumn, useEntityTable, type EntityColumn } from '@/components/blocks/data-table'
import { AddAction } from '@/components/blocks/section-head'
import { useFilters } from '@/components/blocks/filter-set'
import { campaignCase } from '@/fixtures/campaign'
import { Button } from '@/components/ui/button'

/**
 * A whole collection screen: the head and its count, the search and filter
 * row, the table, and the empty state underneath it.
 *
 * A screen hands over the table model, the two narrowing bindings and its own
 * words. What is narrowing the table, what `Clear` drops and what an empty
 * table says are all decided here, so every collection answers them the same
 * way.
 */
// Not `satisfies Meta<typeof Collection>`: the table comes from a hook, so
// every story renders a harness rather than passing `table` as an arg.
const meta: Meta = {
  title: 'Blocks/Table/Collection',
  component: Collection,
  parameters: { layout: 'padded' },
}

export default meta
type Story = StoryObj

const hosts = campaignCase.systems

const columns: EntityColumn<SystemEntry>[] = [
  selectionColumn<SystemEntry>((row) => `Select ${row.hostname}`),
  { accessorKey: 'hostname', header: 'Hostname' },
  { accessorKey: 'systemType', header: 'Asset type', meta: { className: 'w-40' } },
  { accessorKey: 'verdict', header: 'Verdict', meta: { className: 'w-36' } },
]

interface HarnessProps {
  /** What the search box opens with. */
  search?: string
  rows?: SystemEntry[]
  /** The warning above the table. */
  notice?: boolean
  /** The way in an empty collection offers. */
  offer?: boolean
  /** The row pinned under the table. */
  footer?: boolean
  /** The read behind the table, when the story is about one. */
  read?: { isPending: boolean; isError: boolean; error?: unknown; refetch?: () => void }
}

/** The screen's half: it holds the rows, the search text and the filter set. */
function Harness({ search = '', rows = hosts, notice, offer, footer, read }: HarnessProps) {
  const [query, setQuery] = useState(search)
  const kinds = [...new Set(rows.map((row) => row.systemType).filter(Boolean))].sort()

  const filters = useFilters([
    {
      key: 'type',
      label: 'Asset type',
      options: kinds.map((type) => ({
        value: type,
        count: rows.filter((row) => row.systemType === type).length,
      })),
    },
  ])
  const chosen = filters.chosen('type')

  const visible = rows.filter((row) => {
    if (query.trim() && !row.hostname.toLowerCase().includes(query.trim().toLowerCase())) {
      return false
    }
    if (chosen.length && !chosen.includes(row.systemType)) return false
    return true
  })

  const table = useEntityTable<SystemEntry>({
    data: visible,
    columns,
    meta: { pendingIds: new Set(), commit: () => undefined },
  })

  return (
    <Collection
      title="Assets"
      meta={`${String(rows.length)} hosts`}
      actions={<AddAction label="Add host" />}
      search={{
        column: 'Hostname',
        placeholder: "A host's name",
        value: query,
        onValue: setQuery,
      }}
      filters={filters}
      {...(read ? { read } : {})}
      table={{ table, label: 'Assets in this case' }}
      empty={{
        icon: ShieldAlert,
        title: 'No hosts recorded yet',
        detail: 'A host appears here once the incident is known to have reached it.',
        ...(offer ? { action: <Button variant="outline">Record the first host</Button> } : {}),
      }}
      {...(notice
        ? {
            notice: {
              title: 'Two hosts have no verdict',
              detail: 'The report leaves them out of the scope table until one is set.',
            },
          }
        : {})}
      {...(footer
        ? {
            footer: (
              <div className="flex items-center justify-end border-t border-border pt-3">
                <Button variant="outline" size="sm">
                  Export CSV
                </Button>
              </div>
            ),
          }
        : {})}
    />
  )
}

/** The shape every collection screen draws. */
export const Default: Story = { render: () => <Harness /> }

/**
 * The rows have not arrived yet.
 *
 * **The head, the search and the filter bar stay; the table is withheld.** The
 * controls are the screen's own and do not depend on the read, and blanking
 * them makes the page jump when the rows land. Withheld rather than empty,
 * because an empty table is a claim -- *this case has no assets* -- and a
 * pending read has not made it.
 */
export const Reading: Story = {
  name: 'The read is still running',
  render: () => <Harness read={{ isPending: true, isError: false }} />,
}

/**
 * The read failed, said where the rows would be.
 *
 * `refetch` is what draws *Try again*. Without one the failure is stated and
 * not offered, which is the honest shape for a read nobody can retry.
 */
export const ReadRefused: Story = {
  name: 'The read failed',
  render: () => (
    <Harness
      read={{
        isPending: false,
        isError: true,
        error: new Error('The case could not be read.'),
        refetch: () => undefined,
      }}
    />
  ),
}

/** A warning about the rows opens the body, above the table it is about. */
export const WithNotice: Story = { render: () => <Harness notice /> }

/** A pinned row under the table: the section takes the pane's height for it. */
export const WithFooter: Story = { render: () => <Harness footer /> }

/** Nothing recorded yet, so the empty state offers the way in. */
export const Empty: Story = { render: () => <Harness rows={[]} offer /> }

/**
 * A search that matches nothing.
 *
 * The words change and the way in is withheld: a filter hiding every row is
 * not an invitation to create the row it hid.
 */
export const NoMatch: Story = {
  render: () => <Harness rows={[]} offer search="zzz" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nothing matches')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Record the first host' })).toBeNull()
  },
}

/** `Clear` drops the search text and the filter chips together. */
export const Clearing: Story = {
  render: () => <Harness search="srv" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Filters' }))
    const pane = within(document.body)
    await userEvent.click(await pane.findByRole('button', { name: /^server/ }))
    await userEvent.keyboard('{Escape}')
    await expect(
      canvas.getByRole('button', { name: 'Remove the server filter' }),
    ).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: 'Clear' }))
    await expect(canvas.getByRole('textbox', { name: /hostname/i })).toHaveValue('')
    await expect(
      canvas.queryByRole('button', { name: 'Remove the server filter' }),
    ).toBeNull()
  },
}
