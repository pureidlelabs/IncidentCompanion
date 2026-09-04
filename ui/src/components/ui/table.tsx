import { ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Cell as AriaCell,
  Column as AriaColumn,
  ColumnResizer as AriaColumnResizer,
  ResizableTableContainer as AriaResizableTableContainer,
  Row as AriaRow,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  Collection,
  Group,
  composeRenderProps,
  TableLayout,
  Virtualizer,
  useTableOptions,
  type CellProps as AriaCellProps,
  type ColumnProps as AriaColumnProps,
  type ColumnResizerProps as AriaColumnResizerProps,
  type ResizableTableContainerProps as AriaResizableTableContainerProps,
  type RowProps as AriaRowProps,
  type TableBodyProps as AriaTableBodyProps,
  type TableHeaderProps as AriaTableHeaderProps,
  type TableProps as AriaTableProps,
} from 'react-aria-components'
import { tv } from 'tailwind-variants'

import { cn } from '@/lib/cn'

import { Checkbox } from './checkbox'
import { focusRing } from './rac'

const container = tv({
  // This box is the scrollport its head sticks to, and it has no padding to
  // clear -- so it declares the offset flush rather than inheriting the
  // pane's or a filled body's.
  //
  // **And the corner its edge cells round to, for the reason `--sticky-top`
  // is declared here rather than on the head.** A scrollport clips against
  // its own curve, so how much curve there is at the corner is a fact about
  // this box; a cell flush against it cannot read that from anywhere else,
  // and a square cell in a round hole loses the corner of its ground and of
  // its focus ring. One pixel inside the radius, which is where the inside
  // of the border falls.
  base: 'relative w-full overflow-auto [--sticky-top:0px]',
  variants: {
    variant: {
      bordered: [
        'rounded-lg border border-border bg-background',
        '[--table-corner:calc(var(--radius-lg)-1px)]',
      ],
      plain: '[--table-corner:0px]',
    },
  },
  defaultVariants: { variant: 'bordered' },
})

const table = tv({
  extend: focusRing,
  // `border-separate` rather than `border-collapse`: a collapsed border draws
  // over the sticky header as the body scrolls under it.
  // **Clipped to the corner its container declared, rather than each box
  // inside it rounding itself.** Arcs of different radii never line up, so the
  // innermost wins at the extremes and paints a notch outside the curve.
  // `clip-path` on the table rather than `overflow` on the container: overflow
  // there makes it the scrollport its own sticky head sticks to, and the table
  // sits inside the border, so the border still draws itself.
  base: [
    'w-full border-separate border-spacing-0 text-sm text-ink -outline-offset-2',
    '[clip-path:inset(0_round_var(--table-corner))]',
  ],
})

// The header ground is `--muted` rather than the page's: it is the coarsest
// half of the header's typemark, and being sticky it needs an opaque ground of
// its own anyway or the rows scroll through it.
const tableHeader = tv({
  base: [
    // **One opaque ground for the whole band, painted here and nowhere else.**
    // Cells painting their own leaves whatever they do not cover showing in a
    // second colour, and a strip of it above the row reads as content bleeding
    // through the header.
    //
    // **And square corners, because the table already clips to the curve.**
    // A rounded corner on a stuck band is a transparent notch that the rows
    // travelling behind it show through, which is what a person sees as the
    // header leaking a hairline of the row.
    'sticky top-(--sticky-top) z-10 bg-card',
  ],
})

// The other half of the typemark. Uppercase at `--text-2xs` and
// `--tracking-micro`, in `--ink-muted`, so the row is a header at a
// glance without reading a word of it - body rows are sentence case at
// `--text-sm` in `--ink`.
const columnHeader = tv({
  base: [
    'cursor-default border-b border-border text-start align-middle',
    'text-2xs font-semibold tracking-micro uppercase whitespace-nowrap text-ink-muted',

    // A hovered or focused column has to sit over its neighbour, or the
    // resizer it draws on its own edge is clipped by the next cell.
    'hover:z-20 focus-within:z-20',
  ],
})

const columnContent = tv({
  extend: focusRing,
  // `rounded-[inherit]`, and every box between here and the cell carries it:
  // the ring is drawn by this box rather than by the cell, so the cell's own
  // corner does nothing for it unless the corner is passed down.
  base: [
    'flex h-(--control-h-lg) flex-1 items-center gap-1 overflow-hidden px-3',
    'rounded-[inherit] -outline-offset-2',
  ],
  variants: {
    allowsSorting: { true: 'cursor-pointer hover:text-ink' },
  },
})

const columnResizer = tv({
  extend: focusRing,
  base: [
    'box-content h-4 w-px shrink-0 cursor-col-resize rounded-xs px-1',
    'bg-border bg-clip-content forced-colors:bg-[ButtonBorder]',
    'resizing:w-0.5 resizing:bg-ring forced-colors:resizing:bg-[Highlight]',
    '-outline-offset-2',
  ],
})

const row = tv({
  extend: focusRing,
  base: 'group/row relative cursor-default select-none -outline-offset-2',
  variants: {
    isSelected: {
      false: 'hover:bg-muted/40 pressed:bg-muted/60',
      // Tinted rather than `--muted`, which is now the header's ground: a
      // selected row and the header must not paint the same grey.
      true: [
        'bg-accent text-on-accent hover:bg-accent/80 pressed:bg-accent/80',
        'forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]',
      ],
    },
    isDisabled: {
      true: 'text-ink-muted opacity-50 forced-colors:text-[GrayText]',
    },
  },
})

const cell = tv({
  extend: focusRing,
  base: [
    'border-b border-border px-3 py-2 align-middle',
    'group-last/row:border-b-0 -outline-offset-2',
    // The bottom pair of the corner the head takes at the top.
    'group-last/row:first:rounded-bl-(--table-corner)',
    'group-last/row:last:rounded-br-(--table-corner)',
  ],
})

const selectionCell = 'w-9 border-b border-border px-3 py-2 align-middle group-last/row:border-b-0'

// Spelled out, not derived from `VariantProps`: react-docgen-typescript
// cannot follow a generated type, and the docs page loses the prop.
export interface TableContainerLook {
  /** Chrome around the table. `plain` drops the border and the rounding. */
  variant?: 'bordered' | 'plain'
}

export interface ResizableTableContainerProps
  extends Omit<AriaResizableTableContainerProps, 'className'>,
    TableContainerLook {
  /** Utilities on the scroller. Not a render prop: React Aria types this one as a string. */
  className?: string | undefined
}

/**
 * The scroller a `Table` sits in, and what makes `ColumnResizer` work.
 *
 * Holds the chrome and the overflow, so the sticky `TableHeader` has an
 * ancestor to stick to. `onResize` and `onResizeEnd` report every column's
 * width as a `Map` keyed by column id.
 */
export function ResizableTableContainer({ variant, ...props }: ResizableTableContainerProps) {
  return (
    <AriaResizableTableContainer
      data-slot="table-container"
      {...props}
      className={cn(container({ variant }), props.className)}
    />
  )
}

export type TableProps = AriaTableProps

/**
 * A table.
 *
 * Takes `selectedKeys`/`onSelectionChange` with a `selectionMode` of `single`
 * or `multiple`, and `sortDescriptor`/`onSortChange` for sorting; the caller
 * sorts the data. `disabledKeys` names the rows that cannot be selected. Needs
 * a label from `aria-label` or `aria-labelledby`. Draws no chrome of its own:
 * wrap it in `ResizableTableContainer`.
 */
export function Table(props: TableProps) {
  return (
    <AriaTable
      data-slot="table"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        table({ ...renderProps, className }),
      )}
    />
  )
}

export interface VirtualTableProps extends TableProps {
  /** Fixed row height in px. Ignored when `estimatedRowHeight` is set. */
  rowHeight?: number
  /** The header's height in px. */
  headingHeight?: number
  /** Average row height when rows vary. Sizes the scrollbar. */
  estimatedRowHeight?: number
}

/**
 * A table that renders only the rows in view.
 *
 * Needs a bounded height and its own scroller: give the `Table` a height and
 * `overflow-auto`, or the virtualiser has no viewport to measure and every row
 * renders anyway.
 *
 * Rows must be uniform, or `estimatedRowHeight` given. A row taller than the
 * layout expects overlaps the one below it -- the virtualiser positions rows
 * absolutely from the height it was told.
 */
export function VirtualTable({
  rowHeight,
  headingHeight,
  estimatedRowHeight,
  ...props
}: VirtualTableProps) {
  return (
    <Virtualizer
      layout={TableLayout}
      layoutOptions={{
        ...(rowHeight === undefined ? {} : { rowHeight }),
        ...(headingHeight === undefined ? {} : { headingHeight }),
        ...(estimatedRowHeight === undefined ? {} : { estimatedRowHeight }),
      }}
    >
      <Table {...props} />
    </Virtualizer>
  )
}

export type TableHeaderProps<T extends object> = AriaTableHeaderProps<T>

/**
 * The header row.
 *
 * Adds the selection column itself when the table's `selectionBehavior` is
 * `toggle`, with a select-all checkbox where the mode is `multiple`. Pass
 * `columns` and a render function for a dynamic set.
 */
export function TableHeader<T extends object>({ columns, children, ...props }: TableHeaderProps<T>) {
  const { selectionBehavior, selectionMode } = useTableOptions()
  return (
    <AriaTableHeader
      data-slot="table-header"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        tableHeader({ ...renderProps, className }),
      )}
    >
      {selectionBehavior === 'toggle' ? (
        <AriaColumn
          width={36}
          minWidth={36}
          className={cn(columnHeader(), 'px-3 py-2')}
          data-slot="table-selection-column"
        >
          {selectionMode === 'multiple' ? <Checkbox slot="selection" /> : null}
        </AriaColumn>
      ) : null}
      <Collection {...(columns === undefined ? {} : { items: columns })}>{children}</Collection>
    </AriaTableHeader>
  )
}

export interface ColumnLook {
  /** Draw a drag handle on the column's trailing edge. Needs a `ResizableTableContainer`. */
  allowsResizing?: boolean
}

export interface ColumnProps extends AriaColumnProps, ColumnLook {}

/**
 * One column. Its `id` is the key `sortDescriptor` names.
 *
 * `isRowHeader` marks the column a screen reader reads as the row's name, and
 * one column per table needs it. `allowsSorting` makes the header pressable
 * and draws the direction arrow.
 */
export function Column({ allowsResizing, ...props }: ColumnProps) {
  return (
    <AriaColumn
      data-slot="table-column"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        columnHeader({ ...renderProps, className }),
      )}
    >
      {composeRenderProps(props.children, (children, { allowsSorting, sortDirection }) => (
        <div className="flex items-center rounded-[inherit]">
          <Group
            role="presentation"
            tabIndex={-1}
            className={({ isFocusVisible }) => columnContent({ isFocusVisible, allowsSorting })}
          >
            {/* Truncation is a text concern: a span with `overflow-hidden`
                around a control clips its focus ring, which is 3px on three
                sides for a header checkbox. */}
            {typeof children === 'string' ? (
              <span className="truncate">{children}</span>
            ) : (
              children
            )}
            {allowsSorting ? (
              <span
                aria-hidden
                data-slot="table-sort-indicator"
                className={cn(
                  'flex size-4 shrink-0 items-center justify-center transition-transform',
                  sortDirection === 'descending' && 'rotate-180',
                )}
              >
                {sortDirection === undefined ? null : (
                  <ArrowUp className="size-3.5 forced-colors:text-[ButtonText]" />
                )}
              </span>
            ) : null}
          </Group>
          {allowsResizing === true ? <ColumnResizer /> : null}
        </div>
      ))}
    </AriaColumn>
  )
}

export type ColumnResizerProps = AriaColumnResizerProps

/** The drag handle on a column's edge. `Column`'s `allowsResizing` renders one. */
export function ColumnResizer(props: ColumnResizerProps) {
  return (
    <AriaColumnResizer
      data-slot="table-column-resizer"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        columnResizer({ ...renderProps, className }),
      )}
    />
  )
}

export interface TableBodyProps<T extends object>
  extends Omit<AriaTableBodyProps<T>, 'renderEmptyState'> {
  /** What to draw in place of the rows when there are none. */
  renderEmptyState?: ((props: { isEmpty: boolean; isDropTarget: boolean }) => ReactNode) | undefined
}

/**
 * The rows.
 *
 * `items` plus a render function is the dynamic form; the static form takes
 * `Row` children. `renderEmptyState` is centred and muted for you.
 */
export function TableBody<T extends object>({ renderEmptyState, ...props }: TableBodyProps<T>) {
  return (
    <AriaTableBody
      data-slot="table-body"
      {...props}
      {...(renderEmptyState === undefined
        ? {}
        : {
            renderEmptyState: (values: { isEmpty: boolean; isDropTarget: boolean }) => (
              <div
                data-slot="table-empty-state"
                className="px-3 py-8 text-center text-sm text-ink-muted"
              >
                {renderEmptyState(values)}
              </div>
            ),
          })}
    />
  )
}

export type RowProps<T extends object = object> = AriaRowProps<T>

/**
 * One row. Its `id` is the key the selection is reported by.
 *
 * Draws the selection checkbox itself when the table's `selectionBehavior` is
 * `toggle`. `columns` plus a render function is the dynamic form; the static
 * form takes `Cell` children. `isDisabled` takes a single row out, where
 * `disabledKeys` on the table takes a set.
 */
export function Row<T extends object = object>({
  columns,
  children,
  dependencies,
  ...props
}: RowProps<T>) {
  const { selectionBehavior } = useTableOptions()
  return (
    <AriaRow
      data-slot="table-row"
      {...props}
      {...(dependencies === undefined ? {} : { dependencies })}
      className={composeRenderProps(props.className, (className, renderProps) =>
        row({ ...renderProps, className }),
      )}
    >
      {selectionBehavior === 'toggle' ? (
        <AriaCell className={selectionCell} data-slot="table-selection-cell">
          <Checkbox slot="selection" />
        </AriaCell>
      ) : null}
      <Collection
        {...(columns === undefined ? {} : { items: columns })}
        {...(dependencies === undefined ? {} : { dependencies })}
      >
        {children}
      </Collection>
    </AriaRow>
  )
}

export type CellProps = AriaCellProps

/** One cell. `textValue` is what typeahead and the screen reader read. */
export function Cell(props: CellProps) {
  return (
    <AriaCell
      data-slot="table-cell"
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        cell({ ...renderProps, className }),
      )}
    />
  )
}

export {
  container as tableContainerVariants,
  table as tableVariants,
  row as tableRowVariants,
  cell as tableCellVariants,
}
