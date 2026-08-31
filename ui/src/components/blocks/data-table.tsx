import { flexRender } from '@tanstack/react-table'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'

import type { CollectionName } from '@/api/model'
import { isOptimisticId } from '@/api/useEntryCreate'
import {
  ESTIMATED_ROW_HEIGHT,
  VIRTUALIZE_FROM,
  metaOf,
  rowMetaOf,
  useEntityTable,
  type DataTableProps,
  type EntityColumn,
  type EntityColumnMeta,
  type EntityFeatures,
  type EntityRow,
  type EntityTable,
  type EntityTableMeta,
  type EntityTableOptions,
} from '@/components/blocks/entity-table'
import { RowActions } from '@/components/blocks/row-actions'
import { defaultRowMenu, RowMenuItems, type RowMenuGroup } from '@/components/blocks/row-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { PointerContextMenu } from '@/components/ui/context-menu'
import { HIGHLIGHT_MS } from '@/components/ui/highlight'
import { Menu } from '@/components/ui/menu'
import { RowClaim, useRowHolder } from '@/components/blocks/presence'
import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/table'
import { cn } from '@/lib/cn'

export { ESTIMATED_ROW_HEIGHT, VIRTUALIZE_FROM, metaOf, rowMetaOf, useEntityTable }
export type {
  DataTableProps,
  EntityColumn,
  EntityColumnMeta,
  EntityFeatures,
  EntityRow,
  EntityTable,
  EntityTableMeta,
  EntityTableOptions,
}

/** The narrowest a table gets before the pane scrolls sideways. */
const TABLE_FLOOR = 'min-w-[52rem]'

/**
 * Rows drawn above and below the viewport, so a scroll frame has something to
 * reveal before the next render lands.
 */
const OVERSCAN = 8

/**
 * The rows in view, as an index range into the row model.
 *
 * `top` and `height` are the scroller's own, in px; `rowHeight` and
 * `headerHeight` are measured off the first paint and fall back to the
 * caller's estimate until then.
 */
function rowWindow(
  count: number,
  { top, height, rowHeight, headerHeight }: {
    top: number
    height: number
    rowHeight: number
    headerHeight: number
  },
): { start: number; end: number } {
  // A viewport of zero is the frame before the scroller is measured. Draw a
  // screenful's worth on the estimate rather than one row, or the first paint
  // is a table one row tall that then jumps.
  const visible = height > 0 ? height : rowHeight * (OVERSCAN * 2)
  const first = Math.floor((top - headerHeight) / rowHeight)
  const start = Math.max(0, Math.min(count - 1, first - OVERSCAN))
  const end = Math.min(count, start + Math.ceil(visible / rowHeight) + OVERSCAN * 2)
  return { start, end }
}

/**
 * What pressing the row itself does, and what makes the row interactive at
 * all -- which, with `selectionMode` off, is exactly having an `onAction`.
 *
 * Tried in order: expand, where the row can disclose; edit, where the table
 * hands one down; the row's own overflow menu, for a row with neither verb --
 * reading `rowMenuGroups`, the same list `...` and the right click use, so
 * this stays additive to what the menu already offers. A row with none of the
 * three gets no action and stays inert.
 */
function rowAction<TData extends { id: string }>(
  row: EntityRow<TData>,
  table: EntityTable<TData>,
  column: EntityColumnMeta<TData> | undefined,
  openMenu: (rowId: string) => void,
): (() => void) | undefined {
  if (row.getCanExpand()) return row.getToggleExpandedHandler()
  const meta = rowMetaOf(metaOf(table), row.original, column?.rowCan)
  const edit = meta.edit
  if (edit) {
    return () => {
      edit(row.id)
    }
  }
  if (rowMenuGroups(row, table, column).length === 0) return undefined
  return () => {
    openMenu(row.id)
  }
}

/**
 * Which row's overflow is open, for the rows that open it by being pressed.
 *
 * A context rather than a prop: the cluster is drawn by `actionsColumn`'s
 * `cell`, a render function TanStack calls with only the row and the table,
 * while the press that opens it is handled by the row, which this block
 * owns. `null` outside a `DataTable`, where the overflow is React Aria's own
 * uncontrolled trigger.
 */
const OpenRowMenu = createContext<{
  openId: string | null
  setOpenId: (rowId: string | null) => void
} | null>(null)

/**
 * What one row's menu offers, from the declarations `actionsColumn` stored.
 *
 * One list, both surfaces: the row's `...` and its right click both read
 * this, so `context-menu`'s additive-only rule holds by construction. A
 * table with no actions column gets an empty list.
 */
function rowMenuGroups<TData extends { id: string }>(
  row: EntityRow<TData>,
  table: EntityTable<TData>,
  column: EntityColumnMeta<TData> | undefined,
): RowMenuGroup[] {
  const label = column?.rowLabel?.(row.original) ?? ''
  const meta = rowMetaOf(metaOf(table), row.original, column?.rowCan)
  return [...defaultRowMenu(row, meta, label), ...(column?.rowMenuExtra?.(row.original) ?? [])]
}

/**
 * The entity table every screen renders, on the kit's React Aria `Table`.
 *
 * `useEntityTable`, the types, `metaOf`, `rowMetaOf` and the two constants are
 * re-exported from here rather than copied, so both tiers run one TanStack
 * table. Rows, sorting, selection and expansion stay TanStack's; React
 * Aria's own `selectionMode` is off, so the table has one selection state.
 *
 * - **Rows are windowed from `virtualizeFrom` up**, by this block rather than
 *   the kit's `VirtualTable`, which positions rows absolutely and cannot map
 *   onto a `table-fixed` layout with a `colSpan` detail row. A slice of the
 *   row model runs between two spacer rows carrying the height of what is
 *   not drawn, leaving the markup, sticky header and `colSpan` row untouched.
 * - **Turned off** for `renderExpanded` (a detail row is a variable height
 *   the spacers cannot account for), `scroll: 'page'` (this block does not
 *   own the pane), and a row model shorter than `virtualizeFrom`.
 * - Windowed, browser find reaches only the drawn rows, and arrow-key
 *   navigation crosses the two spacer rows.
 * - No table-wide right-click menu -- the kit's `ContextMenuTarget` is a
 *   button and cannot wrap a table. A sortable header carries the column's
 *   own sort button, so `Column` sets no `aria-sort`.
 * - `renderExpanded` draws a second row under the open one, spanning every
 *   column.
 * - `highlightId` scrolls its row into view and flashes it for
 *   `HIGHLIGHT_MS`; windowed, the scroller moves to the row's own computed
 *   offset first, since the row is not in the DOM to scroll to.
 */
export function DataTable<TData extends { id: string }>({
  table,
  label,
  empty,
  renderExpanded,
  virtualizeFrom = VIRTUALIZE_FROM,
  estimatedRowHeight = ESTIMATED_ROW_HEIGHT,
  scroll = 'box',
  className,
  highlightId,
}: DataTableProps<TData>) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const headers = table.getHeaderGroups().at(-1)?.headers ?? []
  const rowHeaderId = headers.find(
    (header) => header.column.id !== 'select' && header.column.id !== 'actions',
  )?.column.id
  // What `actionsColumn` declared: the row's name, its extra menu rows, and
  // the per-row narrowing. Read back rather than re-declared, so a row the
  // table refuses to edit is not pressable into the dialog either, and the
  // right-click menu cannot drift from the `...`.
  const actionsMeta = headers.find((header) => header.column.id === 'actions')?.column.columnDef
    .meta

  /** Where the last right click landed, and on which row. `null` is closed. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; rowId: string } | null>(null)
  const closeMenu = () => {
    setMenuAt(null)
  }

  /** Whose overflow is open, for a row that opens it by being pressed. */
  const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null)
  const openMenu = useMemo(
    () => ({ openId: openMenuRowId, setOpenId: setOpenMenuRowId }),
    [openMenuRowId],
  )

  const windowed = scroll === 'box' && !renderExpanded && rows.length >= virtualizeFrom

  // The scroller's own numbers, and the two heights the window is measured in.
  // All four are state rather than refs: the window is derived during render.
  const [metrics, setMetrics] = useState({
    top: 0,
    height: 0,
    rowHeight: estimatedRowHeight,
    headerHeight: 0,
  })

  const measure = useCallback(() => {
    const box = scrollRef.current
    if (!box) return
    const firstRow = box.querySelector('[data-row-id]')
    const header = box.querySelector('[data-slot="table-header"]')
    const drawnRow = firstRow ? firstRow.getBoundingClientRect().height : 0
    const drawnHeader = header ? header.getBoundingClientRect().height : 0
    setMetrics((current) => {
      const next = {
        top: box.scrollTop,
        height: box.clientHeight,
        // A row of zero is a table that has not painted; keep the estimate.
        rowHeight: drawnRow > 0 ? drawnRow : current.rowHeight,
        headerHeight: drawnHeader,
      }
      return next.top === current.top &&
        next.height === current.height &&
        next.rowHeight === current.rowHeight &&
        next.headerHeight === current.headerHeight
        ? current
        : next
    })
  }, [])

  useLayoutEffect(() => {
    if (!windowed) return
    measure()
    const box = scrollRef.current
    if (!box) return
    // rAF-coalesced: a scroll fires far faster than React can redraw, and the
    // window only ever moves by whole rows.
    let frame = 0
    const onScroll = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measure()
      })
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(box)
    return () => {
      box.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [windowed, measure, rows.length])

  const { start, end } = windowed
    ? rowWindow(rows.length, metrics)
    : { start: 0, end: rows.length }
  const drawnRows = windowed ? rows.slice(start, end) : rows
  const padTop = windowed ? start * metrics.rowHeight : 0
  const padBottom = windowed ? (rows.length - end) * metrics.rowHeight : 0

  // Marked, then unmarked on a timer rather than read straight off the prop:
  // the caller's URL is a hand-off, not a mode the table stays in. What is
  // stored is the expiry, and the mark itself is derived.
  const [expired, setExpired] = useState<string | null>(null)
  const [marking, setMarking] = useState<string | null>(highlightId ?? null)
  if (marking !== (highlightId ?? null)) {
    setMarking(highlightId ?? null)
    setExpired(null)
  }
  const arrived = highlightId && highlightId !== expired ? highlightId : null

  useEffect(() => {
    if (!highlightId) return
    const timer = setTimeout(() => {
      setExpired(highlightId)
    }, HIGHLIGHT_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [highlightId])

  const highlightIndex = highlightId
    ? rows.findIndex((row) => row.id === highlightId)
    : -1

  useEffect(() => {
    if (!highlightId) return
    const box = scrollRef.current
    // Windowed, the row is only in the DOM once the scroller is near it, so
    // the offset is computed rather than found.
    if (windowed && box && highlightIndex >= 0) {
      box.scrollTop = Math.max(
        0,
        highlightIndex * metrics.rowHeight + metrics.headerHeight - box.clientHeight / 2,
      )
      measure()
    }
    const frame = requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector(`[data-row-id="${CSS.escape(highlightId)}"]`)
        ?.scrollIntoView({ block: 'center' })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
    // `metrics` is deliberately not a dependency: it changes on every scroll,
    // and re-running this would drag the scroller back to the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, highlightIndex, rows.length, windowed, measure])

  if (rows.length === 0 && empty) return <>{empty}</>

  /** A row that draws nothing and holds the height of the rows above or below. */
  const spacer = (which: 'top' | 'bottom', height: number) =>
    height > 0 ? (
      <Row key={`--pad-${which}`} id={`--pad-${which}`} style={{ height }} aria-hidden>
        <Cell colSpan={headers.length} className="border-b-0 p-0" style={{ height }} />
      </Row>
    ) : null

  const grid = (
    <Table
      aria-label={label}
      className={cn('table-fixed border-separate border-spacing-0 text-left', TABLE_FLOOR)}
    >
      <TableHeader className="sticky top-0 z-10 bg-card">
        {headers.map((header) => (
          <Column
            key={header.id}
            id={header.column.id}
            {...(header.column.id === rowHeaderId ? { isRowHeader: true } : {})}
            className={cn(
              'bg-card text-2xs font-medium uppercase tracking-wide text-ink-muted',
              header.column.columnDef.meta?.className,
            )}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </Column>
        ))}
      </TableHeader>
      <TableBody
        renderEmptyState={() => 'No rows'}
        // A cell's own edit rebuilds the row, so the cached collection has to
        // be invalidated by the row model it was built from - and by the
        // window, which is what decides which of those rows exist.
        dependencies={[rows, start, end, padTop, padBottom]}
      >
        {[
          spacer('top', padTop),
          ...drawnRows.flatMap((row) => {
            const action = rowAction(row, table, actionsMeta, setOpenMenuRowId)
            const drawn = [
              <Row
                key={row.id}
                id={row.id}
                data-row-id={row.id}
                {...(row.id === arrived ? { 'data-arrived': 'true' } : {})}
                // Not `data-selected`: React Aria owns and overwrites that
                // one. This selection is TanStack's.
                {...(row.getIsSelected() ? { 'data-state': 'selected' } : {})}
                {...(action ? { onAction: action } : {})}
                className={cn(
                  // No literal row height: the cell padding sets it, which keeps
                  // the row on the same density tokens as every other block.
                  'group/row',
                  'data-[arrived]:bg-severity-info/10 data-[arrived]:ring-1',
                  'data-[arrived]:ring-inset data-[arrived]:ring-severity-info',
                  'transition-[background-color,box-shadow] duration-(--duration-base)',
                  row.getIsSelected() && 'bg-accent/40',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <Cell
                    key={cell.id}
                    className={cn('py-1', cell.column.columnDef.meta?.className)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Cell>
                ))}
              </Row>,
            ]
            if (renderExpanded && row.getIsExpanded()) {
              drawn.push(
                <Row key={`${row.id}--detail`} id={`${row.id}--detail`}>
                  <Cell colSpan={headers.length} className="bg-muted/30 p-0">
                    {renderExpanded(row)}
                  </Cell>
                </Row>,
              )
            }
            return drawn
          }),
          spacer('bottom', padBottom),
        ].filter((node) => node !== null)}
      </TableBody>
    </Table>
  )

  const clickedRow = menuAt ? rows.find((row) => row.id === menuAt.rowId) : undefined
  const clickedGroups = clickedRow ? rowMenuGroups(clickedRow, table, actionsMeta) : []
  const clickedLabel = clickedRow ? (actionsMeta?.rowLabel?.(clickedRow.original) ?? label) : label

  return (
    <div
      ref={scrollRef}
      // The scroll offset lives on this node and nowhere else, so continuity is
      // this node surviving a write.
      data-slot="table-scroll"
      // On the scroller rather than on each row: one menu for the table, and a
      // right click anywhere in a row - any cell, the gap between two controls
      // - is the same gesture. The context-menu key and Shift+F10 raise this
      // event too, at the focused element, so the keyboard route is the same
      // code.
      onContextMenu={(event) => {
        const within = event.target instanceof Element ? event.target.closest('[data-row-id]') : null
        const id = within?.getAttribute('data-row-id')
        const row = id === null || id === undefined ? undefined : rows.find((one) => one.id === id)
        // No row, or a row with nothing to offer: the browser's own menu is a
        // better answer than an empty one of ours.
        if (!row || rowMenuGroups(row, table, actionsMeta).length === 0) return
        event.preventDefault()
        setMenuAt({ x: event.clientX, y: event.clientY, rowId: row.id })
      }}
      className={cn(
        'rounded-lg border bg-card',
        // `max-h`, not `h`: a six-row table is six rows tall and a 900-row one
        // stops at the viewport token.
        scroll === 'box' ? 'max-h-(--table-viewport-h) overflow-auto' : 'overflow-hidden',
        className,
      )}
    >
      {/* At `page` the sideways scroll lives here, so the box above sets no
          vertical overflow and the pane stays the scroller. */}
      <div className={cn(scroll === 'page' && 'overflow-x-auto')}>
        <OpenRowMenu.Provider value={openMenu}>{grid}</OpenRowMenu.Provider>
      </div>
      <PointerContextMenu at={menuAt} onClose={closeMenu} label={clickedLabel}>
        <Menu aria-label={`More for ${clickedLabel}`}>
          <RowMenuItems groups={clickedGroups} as="context" />
        </Menu>
      </PointerContextMenu>
    </div>
  )
}

/**
 * The leading checkbox column, ready to spread into a screen's column list.
 *
 * - Selection is the TanStack table's; nothing here holds a set of ids.
 * - A row that refuses selection draws a disabled box rather than a live one.
 * - A factory, since `ColumnDef` is generic in the row type.
 */
export function selectionColumn<TData extends { id: string }>(
  /** What this row is called, for the box a screen reader announces. */
  nameOf?: (row: TData) => string,
): EntityColumn<TData> {
  return {
    id: 'select',
    meta: { className: 'w-10' },
    enableSorting: false,
    header: ({ table }) => (
      <span data-slot="selection-checkbox">
        <Checkbox
          // `slot={null}` opts out of the table's own selection context, which
          // this column does not use: selection is TanStack's.
          slot={null}
          isSelected={table.getIsAllRowsSelected()}
          isIndeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
          aria-label="Select every row"
          onChange={(next) => {
            table.toggleAllRowsSelected(next)
          }}
        />
      </span>
    ),
    cell: ({ row }) => (
      <span data-slot="selection-checkbox" className="flex items-center justify-center">
        <Checkbox
          slot={null}
          isSelected={row.getIsSelected()}
          isDisabled={!row.getCanSelect()}
          aria-label={nameOf ? nameOf(row.original) : `Select row ${row.id}`}
          onChange={(next) => {
            row.toggleSelected(next)
          }}
        />
      </span>
    ),
  }
}

/**
 * `RowActions`, told who else is in this row and whether its menu is open.
 * Outside a `DataTable` there is no `OpenRowMenu` to read, and the overflow
 * stays React Aria's own uncontrolled trigger.
 */
function HeldRowActions({
  collection,
  entryId,
  rowId,
  ...rest
}: {
  collection: CollectionName | undefined
  entryId: string
  /** The TanStack row id, which is what `OpenRowMenu` names an open menu by. */
  rowId: string
} & ComponentProps<typeof RowActions>) {
  const holder = useRowHolder(collection ?? '', entryId)
  const open = useContext(OpenRowMenu)
  return (
    <RowActions
      {...rest}
      {...(holder && !holder.you ? { heldBy: holder.name } : {})}
      {...(open
        ? {
            menuOpen: open.openId === rowId,
            onMenuOpenChange: (next: boolean) => {
              open.setOpenId(next ? rowId : null)
            },
          }
        : {})}
    />
  )
}

/**
 * The last column of every entity table: the chevron, the pencil, the bin and
 * the overflow.
 *
 * `blocks/row-actions` and `blocks/row-menu`.
 *
 * - `labelOf` is stored on the column, so one declaration names the row.
 * - `can` narrows the shared verbs per row; it grants none.
 * - Nothing renders for a row with no verb and no detail.
 */
export function actionsColumn<TData extends { id: string }>(
  labelOf: (row: TData) => string,
  extra?: (row: TData) => RowMenuGroup[],
  can?: (row: TData) => { edit?: boolean; delete?: boolean },
  /** Pins, drawn as a fourth verb in the cluster rather than as a column. */
  pin?: { toggle: (row: TData, next: boolean) => void },
): EntityColumn<TData> {
  return {
    id: 'actions',
    // 128px: four 24px targets, their gaps, and the cell padding.
    meta: {
      className: 'w-32',
      rowLabel: labelOf,
      ...(extra ? { rowMenuExtra: extra } : {}),
      ...(can ? { rowCan: can } : {}),
    },
    enableSorting: false,
    header: () => <span className="sr-only">Row actions</span>,
    cell: ({ row, table }) => {
      const meta = rowMetaOf(metaOf(table), row.original, can)
      const label = labelOf(row.original)
      const groups = [...defaultRowMenu(row, meta, label), ...(extra?.(row.original) ?? [])]
      if (!meta.edit && !meta.remove && !row.getCanExpand() && groups.length === 0) return null
      const collection = metaOf(table).collection
      return (
        <div className="flex items-center justify-end gap-1.5">
          {collection && <RowClaim table={collection} entryId={row.original.id} />}
          <HeldRowActions
            collection={collection}
            entryId={row.original.id}
            rowId={row.id}
            label={label}
            {...(row.getCanExpand()
              ? {
                  expanded: row.getIsExpanded(),
                  onToggleExpanded: row.getToggleExpandedHandler(),
                }
              : {})}
            {...(meta.edit ? { onEdit: () => meta.edit?.(row.id) } : {})}
            editDisabled={isOptimisticId(row.id)}
            {...(meta.remove
              ? {
                  onDelete: () => {
                    meta.remove?.(row.id)
                  },
                }
              : {})}
            {...(pin
              ? {
                  pinned: meta.pinnedIds?.has(row.id) ?? false,
                  onTogglePin: () => {
                    pin.toggle(row.original, !(meta.pinnedIds?.has(row.id) ?? false))
                  },
                }
              : {})}
            {...(groups.length > 0
              ? { menu: <RowMenuItems groups={groups} as="dropdown" /> }
              : {})}
          />
        </div>
      )
    },
  }
}
