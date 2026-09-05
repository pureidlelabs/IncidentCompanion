import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ReactNode } from 'react'
import { expect } from 'storybook/test'
import { MemoryRouter } from 'react-router-dom'

import { keys } from '@/api/queryKeys'
import type { MalwareEntry, SystemEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import {
  BooleanCell,
  ReferenceCell,
  SelectCell,
  TextCell,
} from '@/components/blocks/data-cell'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import {
  useEntityTable,
  type EntityColumn,
  type EntityRow,
  type EntityTable,
} from '@/components/blocks/entity-table'

/**
 * The four cell views a column picks from, over a real table.
 *
 * Every story builds its rows with `useEntityTable`, so `row` and `table` are
 * the objects a column receives in the app rather than stand-ins.
 */

const CASE_ID = 'DEMO-CAMPAIGN'

const malware = campaignCase.malware.slice(0, 3)
const systems = campaignCase.systems.slice(0, 3)

/** id -> account name, the map a reference column builds once per table. */
const accountOptions = new Map(
  campaignCase.accounts.map((account) => [account.id, account.accountName]),
)

function seededClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
  client.setQueryData(keys.specs(), specsFixture)
  client.setQueryData(keys.collection(CASE_ID, 'accounts'), campaignCase.accounts)
  client.setQueryData(keys.collection(CASE_ID, 'systems'), campaignCase.systems)
  return client
}

/** A router and a query client, which is what the reference cell's card wants. */
function Grounded({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={seededClient()}>
      <MemoryRouter initialEntries={[`/cases/${CASE_ID}/malware`]}>
        <EntityCardProvider caseId={CASE_ID}>{children}</EntityCardProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** A two-column list of `label: cell`, so several views read side by side. */
function CellList({ children }: { children: ReactNode }) {
  return (
    <dl className="grid w-96 grid-cols-[10rem_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
      {children}
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="truncate text-xs uppercase text-ink-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

const malwareColumns: EntityColumn<MalwareEntry>[] = [
  { accessorKey: 'filename', header: 'File' },
]

const systemColumns: EntityColumn<SystemEntry>[] = [
  { accessorKey: 'hostname', header: 'Host' },
]

/**
 * The malware table, handed to a render function as its first row and itself.
 *
 * `pending` puts the row's id in `pendingIds`, which is what dims every cell.
 */
function MalwareCells({
  pending = false,
  children,
}: {
  pending?: boolean
  children: (row: EntityRow<MalwareEntry>, table: EntityTable<MalwareEntry>) => ReactNode
}) {
  const first = malware[0]!
  const table = useEntityTable<MalwareEntry>({
    data: malware,
    columns: malwareColumns,
    meta: {
      pendingIds: pending ? new Set([first.id]) : new Set<string>(),
      commit: () => undefined,
    },
  })
  const row = table.getRowModel().rows[0]!
  return <>{children(row, table)}</>
}

function SystemCells({
  children,
}: {
  children: (row: EntityRow<SystemEntry>, table: EntityTable<SystemEntry>) => ReactNode
}) {
  const table = useEntityTable<SystemEntry>({
    data: systems,
    columns: systemColumns,
    meta: { pendingIds: new Set<string>(), commit: () => undefined },
  })
  const row = table.getRowModel().rows[0]!
  return <>{children(row, table)}</>
}

/** The table's cell renderers on the React Aria kit: text, a select value, a resolved reference and a boolean. */
const meta = {
  title: 'Blocks/Table/Data cell',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Text, a select value, and a hash set wide enough to wrap. */
export const Text: Story = {
  name: 'Text, select and a wrapped value',
  render: () => (
    <Grounded>
      <MalwareCells>
        {(row, table) => (
          <CellList>
            <Row label="Filename">
              <TextCell row={row} table={table} field="filename" label="Filename" />
            </Row>
            <Row label="Verdict">
              <SelectCell row={row} table={table} field="verdict" label="Verdict" />
            </Row>
            <Row label="Hash">
              <TextCell row={row} table={table} field="hash" label="Hash" wrap />
            </Row>
            <Row label="Family">
              <TextCell row={row} table={table} field="family" label="Family" />
            </Row>
          </CellList>
        )}
      </MalwareCells>
    </Grounded>
  ),
  play: async ({ canvas }) => {
    const first = malware[0]!
    await expect(canvas.getByText(first.filename)).toBeVisible()
    await expect(canvas.getByText(first.verdict)).toBeVisible()

    // `wrap` is the difference between a hash an analyst can read and one
    // truncated to its first dozen characters, which is the half every hash
    // in a case has in common.
    await expect(canvas.getByText(first.hash)).toBeVisible()
  },
}

/** An empty value falls back to a dash, or to the placeholder a column names. */
export const Empty: Story = {
  name: 'An empty value',
  render: () => (
    <Grounded>
      <MalwareCells>
        {(row, table) => (
          <CellList>
            <Row label="Default">
              <TextCell row={row} table={table} field="methodId" label="Method" />
            </Row>
            <Row label="Named placeholder">
              <TextCell
                row={row}
                table={table}
                field="methodId"
                label="Method"
                placeholder="No method"
              />
            </Row>
          </CellList>
        )}
      </MalwareCells>
    </Grounded>
  ),
  play: async ({ canvas }) => {
    // An empty cell is a mark rather than nothing at all: an empty cell and a
    // cell that failed to render read the same down a column.
    await expect(canvas.getByText('\u2014')).toBeVisible()

    // Named, the mark carries the field with it, for a cell read out of its
    // column -- on a card, or by a screen reader moving cell to cell.
    await expect(canvas.getByText('No method \u2014')).toBeVisible()
  },
}

/** A boolean reads as a word. A checkbox would read as something to press. */
export const YesOrNo: Story = {
  name: 'A boolean',
  render: () => (
    <Grounded>
      <SystemCells>
        {(row, table) => (
          <CellList>
            <Row label="Isolated">
              <BooleanCell row={row} table={table} field="isolated" label="Isolated" />
            </Row>
            <Row label="Hostname">
              <TextCell row={row} table={table} field="hostname" label="Hostname" />
            </Row>
          </CellList>
        )}
      </SystemCells>
    </Grounded>
  ),
  play: async ({ canvas }) => {
    // A word, not a box: a checkbox in a read-only cell reads as something to
    // press, and pressing it would do nothing.
    await expect(canvas.queryByRole('checkbox')).toBeNull()

    // The word alone is `yes` or `no` with nothing saying what of, so the
    // field travels in the label -- which is all a screen reader gets.
    await expect(canvas.getByLabelText(/^Isolated: (yes|no)$/)).toBeVisible()
  },
}

/**
 * A reference, resolved to a name and carrying its hover card. The last row
 * points at an id the case does not hold.
 */
export const Reference: Story = {
  name: 'A reference',
  render: () => (
    <Grounded>
      <MalwareCells>
        {(row, table) => (
          <CellList>
            <Row label="Account">
              <ReferenceCell
                row={row}
                table={table}
                field="accountId"
                label="Account"
                target="account"
                options={accountOptions}
              />
            </Row>
            <Row label="Nothing resolves">
              <ReferenceCell
                row={row}
                table={table}
                field="accountId"
                label="Account"
                target="account"
                options={new Map()}
              />
            </Row>
          </CellList>
        )}
      </MalwareCells>
    </Grounded>
  ),
  play: async ({ canvas }) => {
    const account = campaignCase.accounts.find(
      (one) => one.id === malware[0]!.accountId,
    )

    // The name, not the id: the id is what the PATCH sends and what nobody
    // recognises. A cell showing it would look populated and say nothing.
    await expect(canvas.getByRole('link', { name: account!.accountName })).toBeVisible()

    // The same id against an empty map. An id pointing at a row the case does
    // not hold is a broken reference, and a cell that fell back to drawing
    // the id would make it look like an ordinary value.
    await expect(canvas.getByText(/missing reference/)).toBeVisible()
  },
}

/** A row with a write in flight. Every view in it dims together. */
export const Pending: Story = {
  name: 'A row with a write in flight',
  render: () => (
    <Grounded>
      <MalwareCells pending>
        {(row, table) => (
          <CellList>
            <Row label="Filename">
              <TextCell row={row} table={table} field="filename" label="Filename" />
            </Row>
            <Row label="Account">
              <ReferenceCell
                row={row}
                table={table}
                field="accountId"
                label="Account"
                target="account"
                options={accountOptions}
              />
            </Row>
          </CellList>
        )}
      </MalwareCells>
    </Grounded>
  ),
  play: async ({ canvas }) => {
    // Every view in the row dims, not only the one being written: which field
    // the PATCH carries is not something the row knows, and dimming one cell
    // would say the rest are settled when they are the same request.
    const first = malware[0]!
    const filename = canvas.getByText(first.filename)
    const reference = canvas.getByRole('link').closest('[data-slot="data-cell-reference"]')
    await expect(Number(getComputedStyle(filename).opacity)).toBeLessThan(1)
    await expect(Number(getComputedStyle(reference!).opacity)).toBeLessThan(1)
  },
}
