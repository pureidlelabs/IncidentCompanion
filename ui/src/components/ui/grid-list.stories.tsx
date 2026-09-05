import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'

import { Button } from './button'
import { GridList, GridListItem } from './grid-list'

/**
 * A list whose rows may hold their own controls.
 */
const meta = {
  title: 'Components/GridList',
  component: GridList,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof GridList<object>>

export default meta
type Story = StoryObj<typeof meta>

/**
 * No `selectionMode`, so the rows only hold their own controls.
 */
export const Default: Story = {
  play: async ({ canvas, step }) => {
    const rows = canvas.getAllByRole('row')

    await step('The arrows move between rows', async () => {
      rows[0]!.focus()
      await userEvent.keyboard('{ArrowDown}')
      await expect(rows[1]).toHaveFocus()
    })

    await step('And the right arrow moves into the control that row carries', async () => {
      await userEvent.keyboard('{ArrowRight}')
      await expect(canvas.getAllByRole('button', { name: 'Open' })[1]).toHaveFocus()
    })
  },
  render: () => (
    <GridList aria-label="Artefacts" className="w-72">
      <GridListItem id="a" textValue="invoice.xlsm">
        <span className="flex-1 truncate">invoice.xlsm</span>
        <Button size="xs" variant="ghost">
          Open
        </Button>
      </GridListItem>
      <GridListItem id="b" textValue="update.ps1">
        <span className="flex-1 truncate">update.ps1</span>
        <Button size="xs" variant="ghost">
          Open
        </Button>
      </GridListItem>
    </GridList>
  ),
}

/**
 * One row at a time, and no checkbox: a checkbox adds a row to a set, and here
 * there is no set. The rail says which row it is.
 */
export const SingleSelection: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('checkbox')).not.toBeInTheDocument()
    await expect(
      canvas.getByRole('row', { name: 'Mailbox rule created' }),
    ).toHaveAttribute('aria-selected', 'true')
  },
  render: () => (
    <GridList
      aria-label="Findings"
      selectionMode="single"
      defaultSelectedKeys={['b']}
      className="w-72"
    >
      <GridListItem id="a">Credential dumping on DC01</GridListItem>
      <GridListItem id="b">Mailbox rule created</GridListItem>
      <GridListItem id="c">Archive staged in Temp</GridListItem>
    </GridList>
  ),
}

/**
 * `multiple` is what puts the checkbox in each row -- the row draws it, so a
 * caller never composes one.
 */
export const MultipleSelection: Story = {
  play: async ({ canvas, step }) => {
    await step('One checkbox per row, and it reports the selection', async () => {
      const boxes = canvas.getAllByRole('checkbox')
      await expect(boxes).toHaveLength(3)
      await expect(boxes.filter((box) => (box as HTMLInputElement).checked)).toHaveLength(1)
    })

    await step('Toggling adds rather than replaces', async () => {
      await userEvent.click(canvas.getAllByRole('checkbox')[1]!)
      await expect(
        canvas.getAllByRole('row').filter((row) => row.ariaSelected === 'true'),
      ).toHaveLength(2)
    })
  },
  render: () => (
    <GridList
      aria-label="Findings"
      selectionMode="multiple"
      defaultSelectedKeys={['a']}
      className="w-72"
    >
      <GridListItem id="a">Credential dumping on DC01</GridListItem>
      <GridListItem id="b">Mailbox rule created</GridListItem>
      <GridListItem id="c">Archive staged in Temp</GridListItem>
    </GridList>
  ),
}

/** `disabledKeys` on the list. A disabled row is skipped by the arrow keys. */
export const DisabledItems: Story = {
  render: () => (
    <GridList
      aria-label="Findings"
      selectionMode="multiple"
      disabledKeys={['c']}
      className="w-72"
    >
      <GridListItem id="a">Credential dumping on DC01</GridListItem>
      <GridListItem id="b">Mailbox rule created</GridListItem>
      <GridListItem id="c">Archive staged in Temp</GridListItem>
    </GridList>
  ),
}

/**
 * `renderEmptyState` fills the list when there is nothing to show, and the
 * `isEmpty` chrome centres it -- so an empty list reads as a list that found
 * nothing rather than as a component that failed to draw.
 */
export const Empty: Story = {
  play: async ({ canvas }) => {
    const list = canvas.getByRole('grid')
    await expect(list).toHaveTextContent('No findings yet')
    await expect(getComputedStyle(list).justifyContent).toBe('center')
  },
  render: () => (
    <GridList aria-label="Findings" className="w-72" renderEmptyState={() => 'No findings yet'}>
      {[]}
    </GridList>
  ),
}

/**
 * **The rail travels.**
 */
export const TravellingSelection: Story = {
  render: () => (
    <GridList
      aria-label="Findings"
      selectionMode="single"
      defaultSelectedKeys={['a']}
      className="w-80"
    >
      <GridListItem id="a">Credential dumping on DC01</GridListItem>
      <GridListItem id="b" textValue="Mailbox rule created">
        <span className="flex flex-col gap-1">
          <span>Mailbox rule created</span>
          <span className="text-xs text-ink-muted">
            Anything matching the invoice thread forwarded to an external address, then the rule
            deleted from the web client.
          </span>
        </span>
      </GridListItem>
      <GridListItem id="c">Archive staged in Temp</GridListItem>
      <GridListItem id="d">Egress to 185.220.101.34</GridListItem>
    </GridList>
  ),
  play: async ({ canvas, step }) => {
    const railsIn = (row: HTMLElement) =>
      row.querySelectorAll('[data-slot="grid-list-item-rail"]')
    const rows = canvas.getAllByRole('row')

    await step('One rail, on the row that is selected', async () => {
      await expect(canvas.getAllByRole('row').flatMap((row) => [...railsIn(row)])).toHaveLength(1)
      await expect(railsIn(rows[0]!)).toHaveLength(1)
    })

    await step('It is the tall row it has to grow for', async () => {
      await userEvent.click(rows[1]!)
      await waitFor(() => {
        void expect(railsIn(rows[1]!)).toHaveLength(1)
      })
      await expect(railsIn(rows[0]!)).toHaveLength(0)
    })
  },
}

/**
 * `multiple` draws no rail.
 */
export const MultipleDrawsNoRail: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('grid').querySelectorAll('[data-slot="grid-list-item-rail"]'),
    ).toHaveLength(0)
  },
  render: () => (
    <GridList
      aria-label="Findings"
      selectionMode="multiple"
      defaultSelectedKeys={['a', 'c']}
      className="w-80"
    >
      <GridListItem id="a">Credential dumping on DC01</GridListItem>
      <GridListItem id="b">Mailbox rule created</GridListItem>
      <GridListItem id="c">Archive staged in Temp</GridListItem>
    </GridList>
  ),
}

/**
 * Two lists on one screen, each with a selection.
 *
 * **That identity is not assertable here, measured rather than assumed.**
 * Collapsing both lists onto one shared id leaves both rails standing in the
 * page -- Motion animates between them rather than dropping one -- so a count
 * proves the guard that draws a rail and says nothing about which list owns it.
 * What the story holds is the arrangement: two lists, a selection in each, and a
 * reader who can see whether the mark stays where it was put.
 */
export const TwoLists: Story = {
  render: () => (
    <div className="flex gap-4">
      <GridList aria-label="Endpoint" selectionMode="single" defaultSelectedKeys={['a']} className="w-56">
        <GridListItem id="a">Credential dumping</GridListItem>
        <GridListItem id="b">Archive staged</GridListItem>
      </GridList>
      <GridList aria-label="Identity" selectionMode="single" defaultSelectedKeys={['d']} className="w-56">
        <GridListItem id="c">Impossible travel</GridListItem>
        <GridListItem id="d">Mailbox rule created</GridListItem>
      </GridList>
    </div>
  ),
  play: async ({ canvas }) => {
    const rails = canvas
      .getAllByRole('grid')
      .map((list) => list.querySelectorAll('[data-slot="grid-list-item-rail"]').length)

    await expect(rails).toEqual([1, 1])
  },
}
