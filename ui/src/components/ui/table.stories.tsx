import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import type { SortDescriptor } from 'react-aria-components'
import { expect, within } from 'storybook/test'

import { Skeleton } from './skeleton'
import {
  Cell,
  Column,
  ResizableTableContainer,
  Row,
  Table,
  TableBody,
  TableHeader,
} from './table'

interface Host {
  id: string
  host: string
  owner: string
  severity: string
  seen: string
}

/**
 * `rows` is not a prop of `Table` - the rows are children. Declaring it as a
 * story arg is what lets one `render` serve every story below, so each story
 * says only what it is about and the eight near-identical copies of this markup
 * are gone.
 */
type StoryArgs = ComponentProps<typeof Table> & { rows: readonly Host[] }

/** Fixed rows. Nothing here is random or read from the clock. */
const HOSTS: readonly Host[] = [
  { id: 'dc01', host: 'DC01', owner: 'Infrastructure', severity: 'critical', seen: '09:14' },
  { id: 'ws112', host: 'WS-112', owner: 'Finance', severity: 'high', seen: '09:41' },
  { id: 'ws207', host: 'WS-207', owner: 'Finance', severity: 'medium', seen: '10:02' },
  { id: 'srv-mail', host: 'SRV-MAIL', owner: 'Messaging', severity: 'low', seen: '11:26' },
]

/**
 * A table. It draws no chrome, holds no data and fetches nothing.
 *
 * The caller wraps it in `ResizableTableContainer`, names it with `aria-label`,
 * marks one column `isRowHeader`, and owns the height and the overflow: every
 * row given is rendered, and there is no windowing here.
 *
 * `allowsSorting` makes a header operable and sets `aria-sort`; the caller
 * sorts the data from `onSortChange`. `disabledKeys` on the table and
 * `isDisabled` on a row both refuse selection while keeping the row readable.
 *
 * Loading and failed are not states of this component. A loading table renders
 * placeholder rows in the shape of the real ones; a failed one is not drawn.
 */
const meta = {
  title: 'Components/Table',
  component: Table,
  parameters: { layout: 'centered' },
  args: { 'aria-label': 'Affected hosts', rows: HOSTS },
  render: ({ rows, ...args }) => (
    <ResizableTableContainer className="w-[38rem]">
      <Table {...args}>
        <TableHeader>
          <Column id="host" isRowHeader>
            Host
          </Column>
          <Column id="owner">Owner</Column>
          <Column id="severity">Severity</Column>
          <Column id="seen">First seen</Column>
        </TableHeader>
        <TableBody
          items={rows}
          renderEmptyState={() => 'No host has been added to this case yet'}
        >
          {(item) => (
            <Row id={item.id}>
              <Cell>{item.host}</Cell>
              <Cell>{item.owner}</Cell>
              <Cell>{item.severity}</Cell>
              <Cell>{item.seen}</Cell>
            </Row>
          )}
        </TableBody>
      </Table>
    </ResizableTableContainer>
  ),
} satisfies Meta<StoryArgs>

export default meta
type Story = StoryObj<typeof meta>

/** No `selectionMode`, so the table only navigates. */
export const Default: Story = {}

/**
 * One row at a time. `selectionBehavior` stays `replace`, so no checkbox column
 * appears and a click moves the selection rather than adding to it.
 */
export const SingleSelection: Story = {
  args: { selectionMode: 'single', defaultSelectedKeys: ['ws112'] },
  play: async ({ canvas, step, userEvent }) => {
    await step('The row named as selected is the one marked', async () => {
      await expect(canvas.getByRole('row', { name: /WS-112/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    await step('Clicking another row moves the selection rather than adding', async () => {
      await userEvent.click(canvas.getByRole('row', { name: /DC01/ }))
      await expect(canvas.getByRole('row', { name: /DC01/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expect(canvas.getByRole('row', { name: /WS-112/ })).toHaveAttribute(
        'aria-selected',
        'false',
      )
    })
  },
}

/**
 * `selectionBehavior="toggle"` is what puts the checkbox column in, and with it
 * a select-all checkbox in the header.
 */
export const MultipleSelection: Story = {
  args: {
    selectionMode: 'multiple',
    selectionBehavior: 'toggle',
    defaultSelectedKeys: ['dc01', 'ws207'],
  },
  play: async ({ canvas, step, userEvent }) => {
    await step('A click adds to the selection instead of replacing it', async () => {
      await userEvent.click(canvas.getByRole('row', { name: /WS-112/ }))
      for (const host of ['DC01', 'WS-207', 'WS-112']) {
        await expect(canvas.getByRole('row', { name: new RegExp(host) })).toHaveAttribute(
          'aria-selected',
          'true',
        )
      }
    })

    await step('The header checkbox completes the selection', async () => {
      // Three of four are selected, so it fills rather than clears - the
      // partially-selected state resolves upward, which is what stops a
      // half-selected table from being emptied by one press.
      const [selectAll] = canvas.getAllByRole('checkbox')
      await userEvent.click(selectAll!)
      for (const row of canvas.getAllByRole('row').slice(1)) {
        await expect(row).toHaveAttribute('aria-selected', 'true')
      }
    })

    await step('Pressing it again clears every row', async () => {
      const [selectAll] = canvas.getAllByRole('checkbox')
      await userEvent.click(selectAll!)
      for (const row of canvas.getAllByRole('row').slice(1)) {
        await expect(row).toHaveAttribute('aria-selected', 'false')
      }
    })
  },
}

/**
 * **`disabledKeys` refuses the row, and refusing is the point.**
 *
 * A disabled row keeps its place and its readable content - the analyst can
 * still see what is there - and cannot be selected or actioned. The `play`
 * clicks one and asserts nothing was selected, which is the guarantee a bulk
 * action depends on.
 */
export const DisabledRows: Story = {
  args: {
    selectionMode: 'multiple',
    selectionBehavior: 'toggle',
    disabledKeys: ['ws207', 'srv-mail'],
  },
  play: async ({ canvas, step, userEvent }) => {
    const disabled = canvas.getByRole('row', { name: /WS-207/ })

    await step('Clicking a disabled row selects nothing', async () => {
      await userEvent.click(disabled)
      await expect(disabled).toHaveAttribute('aria-selected', 'false')
    })

    await step('An enabled row in the same table still selects', async () => {
      await userEvent.click(canvas.getByRole('row', { name: /DC01/ }))
      await expect(canvas.getByRole('row', { name: /DC01/ })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })
  },
}

/**
 * **Arrow keys move between rows, and the table takes one tab stop.**
 *
 * The whole grid is a single stop in the tab order, so an analyst tabbing
 * through a screen passes the table rather than walking every row of it. Inside
 * it, the arrow keys move.
 */
export const KeyboardNavigation: Story = {
  args: { selectionMode: 'single' },
  play: async ({ canvas, step, userEvent }) => {
    await step('Focus enters the grid at the first row', async () => {
      await userEvent.tab()
      await expect(canvas.getByRole('row', { name: /DC01/ })).toHaveFocus()
    })

    await step('Arrow down moves to the next row', async () => {
      await userEvent.keyboard('{ArrowDown}')
      await expect(canvas.getByRole('row', { name: /WS-112/ })).toHaveFocus()
    })
  },
}

/**
 * `renderEmptyState` fills the body when there is nothing to show.
 *
 * **The header stays.** An analyst who has filtered a table to nothing needs to
 * see which columns they were looking at, and a table that collapses to a
 * sentence reads as a different screen.
 */
export const Empty: Story = {
  args: { rows: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('No host has been added to this case yet')).toBeInTheDocument()
    await expect(canvas.getByRole('columnheader', { name: 'Host' })).toBeInTheDocument()
  },
}

/** One row, which is where a column's width stops being decided by its content. */
export const OneRow: Story = {
  args: { rows: HOSTS.slice(0, 1) },
}

/**
 * **Far more rows than fit**, which is the state nobody reaches by using the
 * application normally and therefore the one nobody has looked at.
 *
 * The table renders every row it is given: there is no windowing here, and the
 * scroller belongs to whatever wraps it. A caller with a row count like this
 * owns the height, the overflow and the decision to page instead.
 */
export const TooManyRows: Story = {
  args: {
    rows: Array.from({ length: 250 }, (_, index) => ({
      id: `host-${String(index)}`,
      host: `WS-${String(index).padStart(4, '0')}`,
      owner: ['Finance', 'Infrastructure', 'Messaging', 'Retail'][index % 4] ?? 'Finance',
      severity: ['critical', 'high', 'medium', 'low'][index % 4] ?? 'low',
      seen: `${String(index % 24).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}`,
    })),
  },
}

/**
 * **The longest value a real analyst would put here.**
 *
 * A cell wraps rather than truncating, so a long value makes its row taller and
 * every other row keeps its height. A caller wanting one line per row sets that
 * on the cell rather than expecting the table to decide it.
 */
export const LongCellValues: Story = {
  args: {
    rows: [
      {
        id: 'long',
        host: 'srv-fileshare-prod-eastus2-cluster-node-14.corp.internal.example.org',
        owner: 'Finance, Treasury, and Group Reporting (shared custodianship)',
        severity: 'critical',
        seen: '2026-08-29T04:12:55Z',
      },
      ...HOSTS,
    ],
  },
}

/**
 * **The table has no loading state of its own.** A caller builds one like this.
 *
 * Rows are children, so a caller waiting on data renders placeholder rows in the
 * shape of the real ones. That keeps the header, the column widths and the
 * scroll position, so the table does not jump when the data lands - which a
 * spinner replacing the whole table cannot do.
 *
 * Failed is the same argument in the other direction and is not a table state at
 * all: nothing was loaded, so there is no table to draw. The caller shows
 * `Problem` in the table's place.
 */
export const LoadingRows: Story = {
  render: ({ rows: _rows, ...args }) => (
    <ResizableTableContainer className="w-[38rem]">
      <Table {...args}>
        <TableHeader>
          <Column id="host" isRowHeader>
            Host
          </Column>
          <Column id="owner">Owner</Column>
          <Column id="severity">Severity</Column>
          <Column id="seen">First seen</Column>
        </TableHeader>
        <TableBody>
          {[0, 1, 2, 3].map((index) => (
            <Row key={index} id={`placeholder-${String(index)}`}>
              <Cell>
                <Skeleton className="h-4 w-24" />
              </Cell>
              <Cell>
                <Skeleton className="h-4 w-28" />
              </Cell>
              <Cell>
                <Skeleton className="h-4 w-16" />
              </Cell>
              <Cell>
                <Skeleton className="h-4 w-12" />
              </Cell>
            </Row>
          ))}
        </TableBody>
      </Table>
    </ResizableTableContainer>
  ),
}

function SortableHosts() {
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: 'host',
    direction: 'ascending',
  })

  const rows = [...HOSTS].sort((a, b) => {
    const key = sortDescriptor.column as keyof Host
    const order = a[key].localeCompare(b[key])
    return sortDescriptor.direction === 'descending' ? -order : order
  })

  return (
    <ResizableTableContainer className="w-[38rem]">
      <Table
        aria-label="Affected hosts"
        sortDescriptor={sortDescriptor}
        onSortChange={setSortDescriptor}
      >
        <TableHeader>
          <Column id="host" isRowHeader allowsSorting>
            Host
          </Column>
          <Column id="owner" allowsSorting>
            Owner
          </Column>
          <Column id="severity" allowsSorting>
            Severity
          </Column>
          <Column id="seen">First seen</Column>
        </TableHeader>
        <TableBody items={rows}>
          {(item) => (
            <Row id={item.id}>
              <Cell>{item.host}</Cell>
              <Cell>{item.owner}</Cell>
              <Cell>{item.severity}</Cell>
              <Cell>{item.seen}</Cell>
            </Row>
          )}
        </TableBody>
      </Table>
    </ResizableTableContainer>
  )
}

/**
 * **The table reports the descriptor and the caller sorts.**
 *
 * `allowsSorting` on a column makes its header operable and sets `aria-sort`;
 * nothing reorders until the caller acts on `onSortChange`. Binding the
 * descriptor and forgetting to sort gives a header that flips with rows that
 * never move, so the `play` asserts both.
 */
export const Sorting: Story = {
  render: () => <SortableHosts />,
  play: async ({ canvasElement, step, userEvent }) => {
    const canvas = within(canvasElement)

    await step('It starts ascending on Host', async () => {
      await expect(canvas.getByRole('columnheader', { name: /Host/ })).toHaveAttribute(
        'aria-sort',
        'ascending',
      )
      await expect(canvas.getAllByRole('row')[1]).toHaveTextContent('DC01')
    })

    await step('Pressing the header flips the direction and the rows follow', async () => {
      await userEvent.click(canvas.getByRole('columnheader', { name: /Host/ }))
      await expect(canvas.getByRole('columnheader', { name: /Host/ })).toHaveAttribute(
        'aria-sort',
        'descending',
      )
      await expect(canvas.getAllByRole('row')[1]).toHaveTextContent('WS-207')
    })
  },
}

/**
 * `allowsResizing` draws the handle. The last column takes what is left, so it
 * has none.
 */
export const Resizing: Story = {
  render: ({ rows, ...args }) => (
    <ResizableTableContainer className="w-[38rem]">
      <Table {...args}>
        <TableHeader>
          <Column id="host" isRowHeader allowsResizing defaultWidth="2fr" minWidth={96}>
            Host
          </Column>
          <Column id="owner" allowsResizing minWidth={96}>
            Owner
          </Column>
          <Column id="severity">Severity</Column>
        </TableHeader>
        <TableBody items={rows}>
          {(item) => (
            <Row id={item.id}>
              <Cell>{item.host}</Cell>
              <Cell>{item.owner}</Cell>
              <Cell>{item.severity}</Cell>
            </Row>
          )}
        </TableBody>
      </Table>
    </ResizableTableContainer>
  ),
}

/**
 * Rows written out rather than mapped, and a single row disabled on itself with
 * `isDisabled` instead of by key on the table.
 *
 * Use this where the rows are a fixed, short list the code already knows.
 */
export const StaticRows: Story = {
  args: { 'aria-label': 'Artefacts', selectionMode: 'multiple', selectionBehavior: 'toggle' },
  render: ({ rows: _rows, ...args }) => (
    <ResizableTableContainer className="w-[38rem]">
      <Table {...args}>
        <TableHeader>
          <Column id="name" isRowHeader>
            Name
          </Column>
          <Column id="kind">Kind</Column>
          <Column id="size">Size</Column>
        </TableHeader>
        <TableBody>
          <Row id="a">
            <Cell>invoice.xlsm</Cell>
            <Cell>Macro workbook</Cell>
            <Cell>184 kB</Cell>
          </Row>
          <Row id="b">
            <Cell>update.ps1</Cell>
            <Cell>Script</Cell>
            <Cell>6 kB</Cell>
          </Row>
          <Row id="c" isDisabled>
            <Cell>memory.raw</Cell>
            <Cell>Image</Cell>
            <Cell>8 GB</Cell>
          </Row>
        </TableBody>
      </Table>
    </ResizableTableContainer>
  ),
}
