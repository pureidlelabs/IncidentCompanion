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
 * `rows` is not a prop of `Table` - the rows are children.
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
