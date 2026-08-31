import { Fragment } from 'react'

import { isOptimisticId } from '@/api/useEntryCreate'
import type {
  EntityRow,
  EntityTableMeta,
  RowMenuGroup,
  RowMenuItem,
} from '@/components/blocks/entity-table'
import { PointerContextMenu } from '@/components/ui/context-menu'
import { Menu, MenuItem } from '@/components/ui/menu'
import { Separator } from '@/components/ui/separator'

export type { RowMenuGroup, RowMenuItem }

/**
 * One row's menu, as the rows of a kit `Menu`.
 *
 * - The same list drives the right-click menu and the row's `...`, so the two
 *   cannot diverge.
 * - Both surfaces are the kit's `Menu`, so `as` only marks each row with
 *   `data-menu`; there is no second item type to switch on.
 * - A row fires through `onAction`, and `disabled` becomes React Aria's
 *   `isDisabled`.
 * - A rule is drawn above every group after the first, never before the first.
 */
export function RowMenuItems({
  groups,
  as,
}: {
  groups: RowMenuGroup[]
  /** Which surface these rows are drawn into. Marks each row with `data-menu`. */
  as: 'context' | 'dropdown'
}) {
  return (
    <>
      {groups.map((group, at) => (
        <Fragment key={group[0]?.id ?? String(at)}>
          {at > 0 && <Separator />}
          {group.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              data-slot={item.slot ?? `row-menu-${item.id}`}
              data-menu={as}
              isDisabled={item.disabled ?? false}
              tone={item.danger === true ? 'destructive' : 'default'}
              {...(item.href === undefined ? {} : { href: item.href })}
              {...(item.onSelect === undefined ? {} : { onAction: item.onSelect })}
            >
              {item.label}
            </MenuItem>
          ))}
        </Fragment>
      ))}
    </>
  )
}

/**
 * The right-click surface for one row: a `PointerContextMenu` holding its
 * `RowMenuItems`, at the point the click landed.
 *
 * The same wiring `data-table` draws for a grid row, pulled out because
 * a hand-drawn list owes its rows the same right-click as a table's.
 */
export function RowContextMenu({
  at,
  onClose,
  label,
  groups,
}: {
  /** Where the click landed, and on which row. `null` closes the menu. */
  at: { x: number; y: number; id: string } | null
  onClose: () => void
  /** Names the row for the menu's accessible label. */
  label: string
  groups: RowMenuGroup[]
}) {
  return (
    <PointerContextMenu at={at} onClose={onClose} label={label}>
      <Menu aria-label={`More for ${label}`}>
        <RowMenuItems groups={groups} as="context" />
      </Menu>
    </PointerContextMenu>
  )
}

/**
 * What a right-click on an entity row offers, for every table `actionsColumn`
 * builds.
 *
 * - Copy is the one item with no button of its own, and it names the row's
 *   identifying value.
 * - Empty when `label` is empty: a `Copy ` item names no value.
 * - Expand is offered only where the row can expand; Edit and Delete only
 *   where the table's meta carries them.
 * - Edit refuses on an optimistic row, which has no server id to PATCH.
 */
export function defaultRowMenu<TData extends { id: string }>(
  row: EntityRow<TData>,
  meta: EntityTableMeta<TData>,
  label: string,
): RowMenuGroup[] {
  if (!label) return []
  const groups: RowMenuGroup[] = [
    [
      {
        id: 'copy',
        label: `Copy ${label}`,
        // No `?.` - there is no plaintext port in this app, so `clipboard` is
        // never the undefined it is over plain HTTP.
        onSelect: () => {
          void navigator.clipboard.writeText(label)
        },
      },
    ],
  ]

  const editing: RowMenuGroup = []
  if (row.getCanExpand()) {
    editing.push({
      id: 'expand',
      label: row.getIsExpanded() ? 'Hide detail' : 'Show detail',
      onSelect: row.getToggleExpandedHandler(),
    })
  }
  if (meta.edit) {
    const edit = meta.edit
    editing.push({
      id: 'edit',
      label: 'Edit in full',
      disabled: isOptimisticId(row.id),
      onSelect: () => {
        edit(row.id)
      },
    })
  }
  if (meta.remove) {
    const remove = meta.remove
    editing.push({
      id: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => {
        remove(row.id)
      },
    })
  }
  if (editing.length > 0) groups.push(editing)

  return groups
}
