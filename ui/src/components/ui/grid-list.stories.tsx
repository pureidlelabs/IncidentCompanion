import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor } from 'storybook/test'

import { Button } from './button'
import { GridList, GridListItem } from './grid-list'

/**
 * A list whose rows may hold their own controls.
 *
 * **That is the whole reason to reach for this over `ListBox`.** A row is a grid
 * cell, so the arrow keys move between rows and Tab moves into the controls a
 * row carries -- a button inside a list box row is unreachable.
 *
 * The kit's own layer is three things: the `variant` chrome, the checkbox a row
 * draws itself under `selectionBehavior="toggle"`, and the rail that travels
 * under `selectionMode="single"`.
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
 *
 * The `play` walks the path a keyboard takes: down-arrow to the row, then
 * **right-arrow into it**. A list box row would end that walk at the row.
 *
 * The sideways arrow is the default and not Tab, measured -- Tab reaches the
 * button here too, and `keyboardNavigationBehavior="tab"` makes it the
 * documented path. A list dense enough to page through wants the arrow, since
 * Tab then has to walk every control on the way out.
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
 *
 * **`selectionBehavior` defaults to `toggle`, not `replace`.** The row decides
 * on `selectionMode` for that reason -- a guard on the behaviour alone draws a
 * checkbox here, which is what it did until this was measured.
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
 * **The rail travels.** Click one row and then another: the mark on the
 * leading edge is one element moving between them, not two fading, because
 * every row draws it under the same `layoutId` and only one row is ever
 * selected under `single`.
 *
 * Rows of unequal height are the case worth looking at - the rail changes
 * length as it goes, which is a size Motion measures rather than a value
 * anything here declares.
 *
 * What the `play` can settle is the count and the place: **one rail in the whole
 * list, inside whichever row is selected.** Two rails would mean two elements
 * fading rather than one travelling, and the travel itself is a thing to look
 * at rather than to assert.
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
 * `multiple` draws no rail. Several rows stand selected at once, so there is
 * nothing for one element to travel between, and the checkbox each row already
 * carries is the indicator.
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
 * Each list mints its own `layoutId`, so a rail belongs to the list that drew
 * it rather than flying across the gap when a row is picked on either side.
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
