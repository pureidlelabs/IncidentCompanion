import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import {
  defaultRowMenu,
  RowContextMenu,
  RowMenuItems,
  type RowMenuGroup,
} from '@/components/blocks/row-menu'
import {
  useEntityTable,
  type EntityColumn,
  type EntityTableMeta,
} from '@/components/blocks/entity-table'
import { Button } from '@/components/ui/button'
import { ContextMenuTarget, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Menu, MenuTrigger } from '@/components/ui/menu'

/**
 * `RowMenuItems` on the React Aria kit: the same groups in the row's `...` and
 * in the right-click menu, plus what `defaultRowMenu` builds from a table row.
 */
const meta = {
  title: 'Blocks/Table/Row menu',
  component: RowMenuItems,
  parameters: { layout: 'centered' },
  args: { as: 'dropdown', groups: [] },
} satisfies Meta<typeof RowMenuItems>

export default meta
type Story = StoryObj<typeof meta>

const GROUPS: RowMenuGroup[] = [
  [{ id: 'copy', label: 'Copy WKS-FINANCE01', onSelect: () => undefined }],
  [
    { id: 'expand', label: 'Show detail', onSelect: () => undefined },
    { id: 'edit', label: 'Edit in full', onSelect: () => undefined },
    { id: 'delete', label: 'Delete', danger: true, onSelect: () => undefined },
  ],
]

const REFUSED: RowMenuGroup[] = [
  [{ id: 'copy', label: 'Copy WKS-FINANCE02', onSelect: () => undefined }],
  [
    { id: 'edit', label: 'Edit in full', disabled: true, onSelect: () => undefined },
    { id: 'delete', label: 'Delete', danger: true, onSelect: () => undefined },
  ],
]

/**
 * The `...` a row carries. `startOpen` shows the rows it holds, which is what
 * every story here is about and none of it visible while the menu is shut.
 */
function InADropdown({ groups, startOpen = false }: { groups: RowMenuGroup[]; startOpen?: boolean }) {
  return (
    <MenuTrigger defaultOpen={startOpen}>
      <Button variant="outline" size="icon-sm" aria-label="Row actions">
        &#x2026;
      </Button>
      <Menu aria-label="Row actions">
        <RowMenuItems groups={groups} as="dropdown" />
      </Menu>
    </MenuTrigger>
  )
}

/** Its own docs frame, `height` tall: an open menu locks its document's scroll. */
function frame(height: string) {
  return { docs: { story: { inline: false, height } } }
}

/**
 * The `...` a row carries, shut.
 */
export const InTheRowMenu: Story = {
  name: 'In the row menu',
  args: { groups: GROUPS },
  render: (args) => <InADropdown groups={args.groups} />,
}

/**
 * The same groups, reached by right-clicking the row instead.
 */
export const InTheContextMenu: Story = {
  name: 'The same groups on right click',
  parameters: frame('340px'),
  args: { groups: GROUPS, as: 'context' },
  render: (args) => (
    <ContextMenuTrigger defaultOpen>
      <ContextMenuTarget variant="dashed">
        Right-click the row: WKS-FINANCE01
      </ContextMenuTarget>
      <Menu aria-label="Row actions">
        <RowMenuItems {...args} />
      </Menu>
    </ContextMenuTrigger>
  ),
}

/**
 * A row with no id yet: edit is refused and stays on the list.
 */
export const ARefusedEdit: Story = {
  name: 'A row the server has not acknowledged',
  parameters: frame('280px'),
  args: { groups: REFUSED },
  render: (args) => <InADropdown groups={args.groups} startOpen />,
  play: async () => {
    const menu = within(await within(document.body).findByRole('menu'))
    const edit = menu.getByRole('menuitem', { name: 'Edit in full' })
    // Present and refused, rather than gone: a menu that changes length
    // between renders moves every verb under the analyst's hand.
    await expect(edit).toHaveAttribute('aria-disabled', 'true')
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  },
}

/**
 * One group, which is what a row offers when nothing may be done to it but
 * its value can still be taken.
 */
export const CopyOnly: Story = {
  name: 'Copy alone',
  parameters: frame('200px'),
  args: { groups: [GROUPS[0]!] },
  render: (args) => <InADropdown groups={args.groups} startOpen />,
}

interface Widget {
  id: string
  name: string
}

const COLUMNS: EntityColumn<Widget>[] = [{ accessorKey: 'name', header: 'Name' }]

/** `defaultRowMenu` over a real table row, so the groups are derived and not typed out. */
function FromATableRow({
  rows,
  meta,
  startOpen = false,
}: {
  rows: Widget[]
  meta: EntityTableMeta<Widget>
  startOpen?: boolean
}) {
  const table = useEntityTable<Widget>({ data: rows, columns: COLUMNS, meta })
  const row = table.getRowModel().rows[0]
  const groups = row ? defaultRowMenu(row, meta, row.original.name) : []
  return <InADropdown groups={groups} startOpen={startOpen} />
}

/**
 * Built by `defaultRowMenu` from a table row rather than written out.
 */
export const Derived: Story = {
  parameters: frame('280px'),
  name: 'Derived from a table row',
  render: () => (
    <FromATableRow
      startOpen
      rows={[{ id: 'w0', name: 'WKS-FINANCE01' }]}
      meta={{
        pendingIds: new Set<string>(),
        commit: () => undefined,
        remove: () => undefined,
        edit: () => undefined,
      }}
    />
  ),
}

/**
 * A row with nothing to identify it offers no copy, and the menu is whatever
 * is left.
 */
export const NothingToOffer: Story = {
  parameters: frame('200px'),
  name: 'A row with no identity',
  play: async () => {
    const menu = within(await within(document.body).findByRole('menu'))
    // No value to put on the clipboard, so no Copy at all.
    await expect(menu.queryByRole('menuitem', { name: /^Copy/ })).not.toBeInTheDocument()
  },
  render: () => (
    <FromATableRow
      startOpen
      rows={[{ id: 'w2', name: '' }]}
      meta={{
        pendingIds: new Set<string>(),
        commit: () => undefined,
        remove: () => undefined,
        edit: () => undefined,
      }}
    />
  ),
}

/**
 * A value longer than the menu is wide.
 */
export const ALongLabel: Story = {
  parameters: frame('280px'),
  name: 'A long identifying value',
  play: async () => {
    const menu = await within(document.body).findByRole('menu')
    const copy = within(menu).getByRole('menuitem', { name: /^Copy/ })
    // The row truncates rather than carrying the menu wider than its
    // neighbours down a table.
    await expect(copy.getBoundingClientRect().right).toBeLessThanOrEqual(
      menu.getBoundingClientRect().right + 1,
    )
  },
  render: () => (
    <FromATableRow
      startOpen
      rows={[
        {
          id: 'w3',
          name: 'WKS-FINANCE-RECONCILIATION-0417.corp.meridian-holdings.example.internal',
        },
      ]}
      meta={{
        pendingIds: new Set<string>(),
        commit: () => undefined,
        remove: () => undefined,
        edit: () => undefined,
      }}
    />
  ),
}

/**
 * `RowContextMenu` on its own, for a surface with no table under it -- the
 * graph, where the thing right-clicked is pixels rather than a row.
 */
export const AsAStandaloneContextMenu: Story = {
  name: 'RowContextMenu, opened',
  parameters: frame('340px'),
  play: async () => {
    // Named for the row it was opened on, since a surface with no table under
    // it has nothing else to say which row this is.
    //
    // **Named twice, and this cannot tell which one did it.** The surrounding
    // `PointerContextMenu` labels the overlay `More for <row>` as well, so
    // removing the inner label leaves the menu named. Redundantly right rather
    // than unasserted, and a retarget would have to reach inside the kit.
    await expect(
      await within(document.body).findByRole('menu', { name: /^More for / }),
    ).toBeVisible()
  },
  render: () => (
    <RowContextMenu
      at={{ x: 40, y: 20, id: 'row-1' }}
      onClose={() => undefined}
      label="WKS-FINANCE01"
      groups={GROUPS}
    />
  ),
}

/** Every group at once, opened, so the rules between them can be counted. */
export const Opened: Story = {
  name: 'The menu, open',
  parameters: frame('340px'),
  args: { groups: GROUPS },
  render: (args) => <InADropdown groups={args.groups} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Row actions' }))
    const rows = await within(document.body).findAllByRole('menuitem')
    await expect(rows.map((row) => row.textContent)).toEqual([
      'Copy WKS-FINANCE01',
      'Show detail',
      'Edit in full',
      'Delete',
    ])
  },
}
