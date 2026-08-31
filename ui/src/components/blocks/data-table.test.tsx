import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { actionsColumn, DataTable, selectionColumn } from './data-table'
import { useEntityTable, type EntityColumn } from './entity-table'

/**
 * `selectionColumn` on the React Aria table, held at the one thing a screen
 * cannot see: whether the box that renders is the box the table is counting.
 *
 * Bulk actions, the export and the delete all read
 * `table.getSelectedRowModel()`, never the DOM - so a checkbox wired to
 * nothing draws, ticks, animates and reports an empty selection, and both
 * halves typecheck. Every assertion below therefore reads the table's own
 * answer beside the control's, never one without the other.
 *
 * **What this file cannot see: `slot={null}`.** Deleting it from either box
 * leaves all seven green, because the block renders React Aria's `Table`
 * without `selectionMode` and so publishes no selection context for a
 * `Checkbox` to bind to. The prop is a guard against the day the table gains
 * one, and nothing here can hold it.
 */

interface Widget {
  id: string
  name: string
  locked: boolean
}

const widgets: Widget[] = [
  { id: 'w0', name: 'widget 0', locked: false },
  { id: 'w1', name: 'widget 1', locked: false },
  { id: 'w2', name: 'widget 2', locked: true },
]

const columns: EntityColumn<Widget>[] = [
  selectionColumn<Widget>((row) => row.name),
  { accessorKey: 'name', header: 'Name' },
]

/** Prints what the *table* holds, which is what every bulk action reads. */
function Harness({ canSelect }: { canSelect?: (row: Widget) => boolean }) {
  const [data] = useState(widgets)
  const table = useEntityTable<Widget>({
    data,
    columns,
    ...(canSelect ? { canSelect } : {}),
    meta: { pendingIds: new Set(), commit: () => undefined },
  })
  const selected = table
    .getSelectedRowModel()
    .rows.map((row) => row.original.id)
    .join(',')
  return (
    <div>
      <p data-testid="selected">{selected}</p>
      <DataTable table={table} label="Widgets" />
    </div>
  )
}

const selectedIds = () => screen.getByTestId('selected').textContent

describe('the selection column reports what it draws', () => {
  it('puts the row it ticked into the table selection', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(selectedIds()).toBe('')

    await user.click(screen.getByRole('checkbox', { name: 'widget 1' }))

    expect(selectedIds()).toBe('w1')
    expect(screen.getByRole('checkbox', { name: 'widget 1' })).toBeChecked()
  })

  it('takes the row back out again', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = () => screen.getByRole('checkbox', { name: 'widget 1' })

    await user.click(box())
    await user.click(box())

    expect(selectedIds()).toBe('')
    expect(box()).not.toBeChecked()
  })

  it('selects every row from the header box, and clears every row from it', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const all = () => screen.getByRole('checkbox', { name: 'Select every row' })

    await user.click(all())
    expect(selectedIds()).toBe('w0,w1,w2')
    expect(screen.getByRole('checkbox', { name: 'widget 0' })).toBeChecked()

    await user.click(all())
    expect(selectedIds()).toBe('')
  })

  /**
   * The header's third state. `getIsSomeRowsSelected()` alone is true while
   * *every* row is selected too, so a header reading it without the
   * `&& !getIsAllRowsSelected()` guard is stuck indeterminate on a full
   * selection - which reads as "some" over a table where all are ticked.
   */
  it('reads indeterminate for a part selection and checked for a whole one', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const all = () => screen.getByRole('checkbox', { name: 'Select every row' })

    await user.click(screen.getByRole('checkbox', { name: 'widget 1' }))
    expect(all()).toBePartiallyChecked()
    expect(all()).not.toBeChecked()

    await user.click(screen.getByRole('checkbox', { name: 'widget 0' }))
    await user.click(screen.getByRole('checkbox', { name: 'widget 2' }))
    expect(all()).toBeChecked()
    expect(all()).not.toBePartiallyChecked()
  })

  /**
   * A row the table refuses draws a dead box rather than a live one, and the
   * refusal has to hold against the press as well as against the eye: a box
   * that looks disabled and still toggles is the import wizard's ceiling
   * silently not applying.
   */
  it('refuses a row the table will not select, by eye and by press', async () => {
    const user = userEvent.setup()
    render(<Harness canSelect={(row) => !row.locked} />)
    const locked = screen.getByRole('checkbox', { name: 'widget 2' })

    expect(locked).toBeDisabled()
    await user.click(locked)

    expect(selectedIds()).toBe('')
  })

  /** Select-all honours the same refusal; it is the same predicate. */
  it('leaves a refused row out of select-all', async () => {
    const user = userEvent.setup()
    render(<Harness canSelect={(row) => !row.locked} />)

    await user.click(screen.getByRole('checkbox', { name: 'Select every row' }))

    expect(selectedIds()).toBe('w0,w1')
  })

  /** The box names its row, so a screen reader announces which one it ticks. */
  it('names each box after its own row', () => {
    render(<Harness />)
    for (const widget of widgets) {
      expect(screen.getByRole('checkbox', { name: widget.name })).toBeInTheDocument()
    }
  })
})

/**
 * The row's own `onAction`. React Aria calls a row with one interactive, and
 * every hover-revealed control on it appears.
 *
 * **Whether anything is visible is asserted in `server/e2e/visual`, not
 * here.** jsdom has no CSS, so an opacity assertion in this tier reads `''`
 * for every element and a hover assertion is a pointer event nothing matched.
 * What this file can hold is the decision and its consequences: which handler
 * a press reaches, which row it names, and what a press must *not* do.
 */
describe('a row that can be pressed', () => {
  /** Records who was asked to do what, in order. */
  function ActionHarness({
    editable = true,
    deletable = true,
    expanding = false,
    can,
    log,
  }: {
    editable?: boolean
    deletable?: boolean
    expanding?: boolean
    can?: (row: Widget) => { edit?: boolean; delete?: boolean }
    log: string[]
  }) {
    const [data] = useState(widgets)
    const table = useEntityTable<Widget>({
      data,
      columns: [
        ...columns,
        actionsColumn<Widget>((row) => row.name, undefined, can),
      ],
      ...(expanding ? { enableExpanding: true } : {}),
      meta: {
        pendingIds: new Set(),
        commit: () => undefined,
        ...(deletable ? { remove: (id: string) => log.push(`remove:${id}`) } : {}),
        ...(editable ? { edit: (id: string) => log.push(`edit:${id}`) } : {}),
      },
    })
    const selected = table
      .getSelectedRowModel()
      .rows.map((row) => row.original.id)
      .join(',')
    return (
      <div>
        <p data-testid="selected">{selected}</p>
        <p data-testid="expanded">
          {table
            .getRowModel()
            .rows.filter((row) => row.getIsExpanded())
            .map((row) => row.id)
            .join(',')}
        </p>
        <DataTable
          table={table}
          label="Widgets"
          {...(expanding ? { renderExpanded: () => <p>detail</p> } : {})}
        />
      </div>
    )
  }

  /** The row's cell an analyst would press: its name, not its controls. */
  const rowNamed = (name: string) => screen.getByRole('rowheader', { name })

  it('edits the row that was pressed, and not the first one', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness log={log} />)

    await user.click(rowNamed('widget 2'))

    expect(log).toEqual(['edit:w2'])
  })

  /**
   * Selection is a separate gesture from the action, which is what
   * `selectionBehavior` toggle means: the box selects and the row acts.
   * Pressing a row into the selection would silently widen every bulk verb.
   */
  it('leaves the selection alone', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness log={log} />)

    await user.click(rowNamed('widget 1'))

    expect(selectedIds()).toBe('')
  })

  /**
   * And the box still selects without also firing the row's action.
   *
   * **This and the test below hold React Aria's guarantee, not this block's,
   * and both went green under a mutation that should have broken them.**
   * Measured: replacing the cluster's kit `Button` with a raw `<button>` --
   * which stops no propagation -- left all fourteen green, because React Aria
   * ignores a row press whose target is an interactive element of its own
   * accord. Delivering the action as a bubbling `onClick` instead of
   * `onAction` also left them green, that time because React Aria filters
   * `onClick` off the row and the action never ran at all.
   *
   * They are kept as the statement of what must stay true of the row, and the
   * gap is stated rather than left to be discovered: nothing here can fail on
   * a nested control that bubbles into the row's action.
   */
  it('does not act when the box inside it is ticked', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness log={log} />)

    await user.click(screen.getByRole('checkbox', { name: 'widget 1' }))

    expect(selectedIds()).toBe('w1')
    expect(log).toEqual([])
  })

  /**
   * The cluster's own buttons sit inside the row, so a press that bubbled
   * would run the row's action as well -- two dialogs from one click, or a
   * delete under an edit. See the gap recorded on the test above.
   */
  it('acts once when a control in the row is pressed, not twice', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness log={log} />)

    await user.click(screen.getByRole('button', { name: 'Edit widget 1 in full' }))
    expect(log).toEqual(['edit:w1'])

    await user.click(screen.getByRole('button', { name: 'Delete widget 1' }))
    expect(log).toEqual(['edit:w1', 'remove:w1'])
  })

  /**
   * Expand wins over edit where a row offers both: a stray press that
   * discloses a row costs nothing, and one that opens a dialog interrupts.
   */
  it('opens the detail rather than the dialog where the row can expand', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness expanding log={log} />)

    await user.click(rowNamed('widget 0'))

    expect(screen.getByTestId('expanded').textContent).toBe('w0')
    expect(log).toEqual([])
  })

  /**
   * A table that hands down no edit fires no verb from a row press.
   *
   * It is no longer inert -- the press opens the row's own menu, asserted
   * below -- but the verbs are still the menu's to run, not the press's.
   */
  it('runs no verb on a table with no edit and no expansion', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness editable={false} log={log} />)

    await user.click(rowNamed('widget 1'))

    expect(log).toEqual([])
  })

  /**
   * `rowCan` is what a table uses to refuse one row what the rest may do, and
   * the row press is a second door onto the same verb: a row that draws no
   * pencil must not be pressable into the dialog either.
   */
  it('honours the per-row refusal the actions column declares', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<ActionHarness can={(row) => ({ edit: !row.locked })} log={log} />)

    await user.click(rowNamed('widget 2'))
    expect(log).toEqual([])

    // The refused row falls through to its own menu, which is modal: the rest
    // of the table is `aria-hidden` until it is dismissed.
    await user.keyboard('{Escape}')
    await user.click(rowNamed('widget 1'))
    expect(log).toEqual(['edit:w1'])
  })
})

/**
 * A row whose only offer is its menu, which is the case the reveal could not
 * reach: React Aria gives `data-hovered` to a row with an `onAction` and to
 * no other, so a row with no verb had no hover state and its cluster stayed
 * at `opacity: 0` under a real pointer.
 *
 * **The opacity itself is asserted in `server/e2e/visual`, not here** -- jsdom
 * has no CSS. What this file holds is the mechanism the reveal now rests on:
 * which row's menu a press opens, that it opens exactly one, and that a row
 * with a verb is untouched.
 */
describe('a row whose only offer is its menu', () => {
  function MenuHarness({
    editable = false,
    deletable = false,
    expanding = false,
    withActions = true,
    can,
    log,
  }: {
    editable?: boolean
    deletable?: boolean
    expanding?: boolean
    withActions?: boolean
    can?: (row: Widget) => { edit?: boolean; delete?: boolean }
    log: string[]
  }) {
    const [data] = useState(widgets)
    const table = useEntityTable<Widget>({
      data,
      columns: withActions
        ? [...columns, actionsColumn<Widget>((row) => row.name, undefined, can)]
        : columns,
      ...(expanding ? { enableExpanding: true } : {}),
      meta: {
        pendingIds: new Set(),
        commit: () => undefined,
        ...(deletable ? { remove: (id: string) => log.push(`remove:${id}`) } : {}),
        ...(editable ? { edit: (id: string) => log.push(`edit:${id}`) } : {}),
      },
    })
    return (
      <div>
        <p data-testid="expanded">
          {table
            .getRowModel()
            .rows.filter((row) => row.getIsExpanded())
            .map((row) => row.id)
            .join(',')}
        </p>
        <DataTable
          table={table}
          label="Widgets"
          {...(expanding ? { renderExpanded: () => <p>detail</p> } : {})}
        />
      </div>
    )
  }

  const rowNamed = (name: string) => screen.getByRole('rowheader', { name })
  /**
   * The cluster, by `data-slot` rather than by role: an open menu is modal,
   * so every toolbar behind it is `aria-hidden` and unreachable by role at
   * the exact moment this has to be read.
   */
  const clusterFor = (name: string) => {
    const cluster = document.querySelector(`[aria-label="Actions for ${name}"]`)
    if (!cluster) throw new Error(`no cluster for ${name}`)
    return cluster
  }

  it('opens that row\u2019s own menu when the row is pressed', async () => {
    const user = userEvent.setup()
    render(<MenuHarness log={[]} />)
    expect(screen.queryByRole('menu')).toBeNull()

    await user.click(rowNamed('widget 1'))

    expect(screen.getByRole('menu')).toHaveAccessibleName('More for widget 1')
    expect(screen.getByRole('menuitem', { name: 'Copy widget 1' })).toBeInTheDocument()
  })

  /**
   * The row that was pressed, not the first one. A menu opened from a shared
   * piece of state that never learned the row id passes every assertion
   * above and offers the wrong row's verbs.
   */
  it('names the row that was pressed, not the first one', async () => {
    const user = userEvent.setup()
    render(<MenuHarness log={[]} />)

    await user.click(rowNamed('widget 2'))

    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu')).toHaveAccessibleName('More for widget 2')
  })

  /** One at a time: the second press must not leave the first menu standing. */
  it('leaves no second menu open when another row is pressed', async () => {
    const user = userEvent.setup()
    render(<MenuHarness log={[]} />)

    await user.click(rowNamed('widget 1'))
    await user.keyboard('{Escape}')
    await user.click(rowNamed('widget 2'))

    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu')).toHaveAccessibleName('More for widget 2')
  })

  /**
   * The cluster is what the menu is anchored to, so a menu open over a
   * cluster at `opacity: 0` is a popover hanging off nothing. The class is
   * the only half of this jsdom can see; the rendered opacity is the
   * Playwright tier's.
   */
  it('holds the cluster open while its menu is', async () => {
    const user = userEvent.setup()
    render(<MenuHarness log={[]} />)
    expect(clusterFor('widget 1').className).toContain('opacity-0')

    await user.click(rowNamed('widget 1'))

    expect(clusterFor('widget 1').className).toContain('opacity-100')
    expect(clusterFor('widget 1').className).not.toContain('opacity-0')
    // And only that row's.
    expect(clusterFor('widget 2').className).toContain('opacity-0')
  })

  /** Expand still wins: a row that can disclose does that, not this. */
  it('leaves an expandable row expanding', async () => {
    const user = userEvent.setup()
    render(<MenuHarness expanding log={[]} />)

    await user.click(rowNamed('widget 0'))

    expect(screen.getByTestId('expanded').textContent).toBe('w0')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  /** And edit still wins over the menu where the table hands one down. */
  it('leaves an editable row editing', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<MenuHarness editable log={log} />)

    await user.click(rowNamed('widget 1'))

    expect(log).toEqual(['edit:w1'])
    expect(screen.queryByRole('menu')).toBeNull()
  })

  /**
   * Pressing the overflow itself is the gesture that was already there. It
   * must open the menu once -- a controlled trigger that also took the row's
   * action would toggle twice and close on the same press -- and must run no
   * verb.
   */
  it('opens once from the overflow button, and fires no row action', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<MenuHarness deletable log={log} />)

    await user.click(screen.getByRole('button', { name: 'More for widget 1' }))

    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu')).toHaveAccessibleName('More for widget 1')
    expect(log).toEqual([])
  })

  /**
   * A refused verb is refused on both doors. `rowCan` withholds the pencil,
   * and the menu the press opens must not carry `Edit in full` either.
   */
  it('opens a menu that carries only the verbs this row is allowed', async () => {
    const user = userEvent.setup()
    const log: string[] = []
    render(<MenuHarness editable deletable can={(row) => ({ edit: !row.locked })} log={log} />)

    await user.click(rowNamed('widget 2'))

    expect(screen.getByRole('menu')).toHaveAccessibleName('More for widget 2')
    expect(screen.queryByRole('menuitem', { name: 'Edit in full' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    expect(log).toEqual([])
  })

  /**
   * A table with no actions column has no name for a row and so no menu, and
   * must stay inert rather than gain an action that opens nothing. This is
   * the one row shape that is still allowed to do nothing at all.
   *
   * **The absent menu is not what this holds.** Measured: deleting the
   * empty-menu guard from `rowAction` left every test in this file green,
   * because a table with no actions column draws no cluster either, so the
   * action fires and there is no `MenuTrigger` for it to open. What the
   * mutation really changes is the row: React Aria marks a row with an
   * `onAction` pressable, and a row that is pressable is also given
   * `data-hovered`, a pointer cursor and a place in the tab order for a
   * gesture that does nothing at all. The attribute is what separates the two.
   */
  it('leaves a table with no actions column unpressable', async () => {
    const user = userEvent.setup()
    const { container } = render(<MenuHarness withActions={false} log={[]} />)

    const row = container.querySelector('[data-row-id]')
    expect(row).not.toBeNull()
    expect(row).not.toHaveAttribute('data-react-aria-pressable')

    await user.click(rowNamed('widget 1'))

    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  /**
   * And the other side of it: a row whose only offer is a menu *is* pressable,
   * which is the whole of the fix. React Aria hands `data-hovered` to a
   * pressable row and to no other, and `group-hover/row:opacity-100` compiles
   * to a selector that reads that attribute for a `data-rac` element.
   *
   * **This is as close as jsdom gets.** It cannot see `data-hovered` itself,
   * which needs a real pointer, nor the opacity, which needs CSS. Both are in
   * `server/e2e/visual/row-actions-reveal.storybook.spec.ts`.
   */
  it('marks a menu-only row pressable, which is what the reveal reads', () => {
    const { container } = render(<MenuHarness log={[]} />)

    const row = container.querySelector('[data-row-id]')
    expect(row).toHaveAttribute('data-react-aria-pressable', 'true')
  })
})
