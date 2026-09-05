import {
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludes,
  filterFn_arrIncludesAll,
  filterFn_arrIncludesSome,
  filterFn_equals,
  filterFn_equalsString,
  filterFn_inNumberRange,
  filterFn_includesString,
  filterFn_includesStringSensitive,
  filterFn_weakEquals,
  globalFilteringFeature,
  metaHelper,
  rowExpandingFeature,
  rowPaginationFeature,
  rowPinningFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_alphanumericCaseSensitive,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
  useTable,
  type Column,
  type ColumnDef,
  type Row,
  type RowData,
  type SortingState,
  type StringOrTemplateHeader,
  type Table,
  type TableFeatures,
  type TableMeta,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'

import type { CollectionName } from '@/api/model'

/**
 * The entity table's model: the feature bundle, the column and meta types, and
 * the hook every screen builds its table with.
 *
 * Holds no primitive and imports no component tier, so the model is separable
 * from whatever renders it. A screen names these types through its renderer.
 */

/**
 * A column of any value type, in this app's feature set.
 *
 * `any` for the value: `ColumnDef<F, Entry, string>` is not assignable to
 * `ColumnDef<F, Entry, unknown>[]` and a screen cannot hold columns of mixed
 * value types in one array without it. This is the alias every screen uses so
 * no screen writes its own.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EntityColumn<TData extends RowData> = ColumnDef<EntityFeatures, TData, any>

/** One row of a row menu. Data only: each menu tier renders it its own way. */
export interface RowMenuItem {
  id: string
  label: string
  /** Painted destructive. Reserved for the item that removes rows. */
  danger?: boolean | undefined
  disabled?: boolean | undefined
  /** `data-slot`, for a test that reaches past the label text. */
  slot?: string | undefined
  /**
   * Where the item goes, for one that navigates.
   *
   * A link rather than a handler, so the item carries the destination the
   * status bar shows and middle-click opens in a tab. Mutually exclusive with
   * `onSelect`.
   */
  href?: string | undefined
  onSelect?: (() => void) | undefined
}

/** A run of items with a rule drawn above it. Empty groups are dropped. */
export type RowMenuGroup = RowMenuItem[]



/**
 * Per-column extras: this app's, and the ones a grid renderer reads.
 *
 * **A slot on the feature bundle, not a `declare module` augmentation.** v9
 * resolves `ColumnMeta` through the bundle's `columnMeta` slot and chooses one
 * rather than merging it, so a global augmentation is replaced the moment a
 * table registers a bundle that sets the slot.
 *
 * `headerClassName`, `cellClassName` and `skeleton` are the grid renderer's
 * own fields, declared here rather than intersected from that module so this
 * one imports no component tier at all.
 */
export interface EntityColumnMeta<TData> {
  /** Utilities applied to this column's header and every cell in it. */
  className?: string
  headerClassName?: string
  cellClassName?: string
  skeleton?: ReactNode
  /**
   * What the row is called, declared by `actionsColumn` and read back by the
   * table for the right-click menu.
   *
   * On the column rather than on `meta` because the actions column is where a
   * table already says what its rows are called, and a second declaration
   * beside it is a second thing to keep true. A table with no actions column
   * has no name for a row and gets no context menu, which is correct - it has
   * no visible control for the menu to be additive to.
   */
  rowLabel?: (row: TData) => string
  /**
   * Verbs this table has that `defaultRowMenu` does not know about, drawn
   * below the ones it does.
   *
   * Declared here rather than passed to each surface because there are two -
   * the `...` dropdown and the row's right-click menu - and the guarantee that
   * they offer the same list holds only while both read one declaration.
   */
  rowMenuExtra?: (row: TData) => RowMenuGroup[]
  /**
   * Which of the shared verbs *this row* allows.
   *
   * The libraries are why it exists - a built-in template can be duplicated
   * and neither edited nor deleted, decided per file by the server - and
   * reading the table's `meta` alone drew a pencil and a bin that were refused
   * on click.
   *
   * Narrows only: a row cannot grant a verb the table did not supply.
   */
  rowCan?: (row: TData) => { edit?: boolean; delete?: boolean }
}
declare module '@tanstack/react-table' {
  /**
   * What every cell in this app may ask the table for.
   *
   * On `meta` rather than closed over by a column factory: columns built in a
   * closure are a new array on every render, and a cell that reads its
   * callbacks from `table.options.meta` lets the column list be a module
   * constant. Required rather than optional wherever every entity table has
   * one - an optional field is a `?.` at every call site and a silently inert
   * control when a screen forgets to pass it.
   */
  // The parameter list, variance annotations included, must match the
  // library's declaration exactly or TypeScript refuses the augmentation
  // ("All declarations of 'TableMeta' must have identical type parameters").
  // `TFeatures` is unused here and cannot be dropped for that reason.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<in out TFeatures extends TableFeatures,
    in out TData extends RowData> {
    /** Rows with a write in flight, from `usePendingEntryIds`. */
    pendingIds: ReadonlySet<string>
    /**
     * Which rows are pinned, for the table that offers pinning.
     *
     * **On `meta` rather than closed over by the column**, because `meta` is
     * rebuilt every render while the columns are memoised: a column reading the
     * live set had to hold it in a ref, which is a read during render and a
     * React violation, and the alternative - rebuilding the columns when the
     * pin list arrives - replaced the row's button between pointerdown and
     * click and swallowed the click. This is the seam that is neither.
     */
    pinnedIds?: ReadonlySet<string> | undefined
    /** One row, only the fields that changed. */
    commit: (id: string, fields: Partial<TData>) => void
    /**
     * Delete the row, or `undefined` where this row may not be deleted -
     * `rowCan` narrows it away, and the absence is what withholds the bin and
     * the menu item. Every screen passes one; only `rowMetaOf` drops it.
     */
    remove?: ((id: string) => void) | undefined
    /**
     * Open the row's pencil: the full `EntityDialog`, prefilled, the
     * way an inline cell's own field-at-a-time edit does not reach a field
     * that has no column.
     */
    edit?: ((id: string) => void) | undefined
    /**
     * Which table these rows are, so a row can say who else is in it.
     *
     * **The scope the server publishes, not the screen's name**
     * (`network_indicators`), hence `CollectionName` rather than a string: a
     * near miss marks nothing and fails nowhere.
     */
    collection?: CollectionName | undefined
  }
}
/**
 * The table's `meta` as *this row* sees it.
 *
 * Both the `...` and the right-click menu run through this, because they are one
 * list by design and a narrowing applied to one of them would leave the row
 * offering by right-click exactly what it visibly withholds.
 */
export function rowMetaOf<TData extends RowData>(
  meta: EntityTableMeta<TData>,
  row: TData,
  can: ((row: TData) => { edit?: boolean; delete?: boolean }) | undefined,
): EntityTableMeta<TData> {
  if (!can) return meta
  const allowed = can(row)
  return {
    ...meta,
    ...(allowed.delete === false ? { remove: undefined } : {}),
    ...(allowed.edit === false ? { edit: undefined } : {}),
  }
}

/** The table's `meta`, or a throw naming the screen that forgot it. */
export function metaOf<TData extends RowData>(table: EntityTable<TData>) {
  const meta = table.options.meta
  if (!meta) throw new Error('This table was not built with useEntityTable()')
  return meta
}
export interface EntityTableOptions<TData extends { id: string }> {
  data: TData[]
  columns: EntityColumn<TData>[]
  meta: {
    pendingIds: ReadonlySet<string>
    /** See `TableMeta.pinnedIds`. */
    pinnedIds?: ReadonlySet<string> | undefined
    commit: (id: string, fields: Partial<TData>) => void
    /** See `TableMeta.remove`. Omitted where no row may be deleted at all. */
    remove?: ((id: string) => void) | undefined
    edit?: ((id: string) => void) | undefined
    /** See `TableMeta.collection`. Declared twice because this is the option
     *  object a screen writes and that is what the table exposes back. */
    collection?: CollectionName | undefined
  }
  /** Rows can be opened for a detail panel. Pair with `renderExpanded`. */
  enableExpanding?: boolean | undefined
  /**
   * Which rows may be ticked. Every row, unless a table says otherwise.
   *
   * Takes the row's own data rather than TanStack's wrapper, which is what a
   * caller has an opinion about -- and keeps the feature-typed `Row` generic
   * out of every call site.
   */
  canSelect?: ((row: TData) => boolean) | undefined
  initialSorting?: SortingState | undefined
}
/**
 * The app's feature set.
 *
 * **Every feature the grid renderer calls is registered, and a leaner bundle
 * is not an option while it is in use.** Those
 * renderers call `getStartVisibleCells`, `getCenterVisibleCells`,
 * `getIsPinned`, `getSize` and the paginated row model, and in v9 an
 * unregistered feature does not return a default - the method is not on the
 * object at all. A trimmed bundle is a `TypeError` on first paint rather than
 * a missing control.
 *
 * Spelled out rather than spread from the grid's own bundle: the list is
 * TanStack's, and the table model imports no component tier.
 *
 * **Module-level, so the identity is stable.** Rebuilding it per render gives
 * every table a new feature object on every pass, which is the shape that
 * quietly defeats memoisation.
 */
const entityFeatures = tableFeatures({
  columnVisibilityFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  // columnResizingFeature requires columnSizingFeature, declared above.
  columnResizingFeature,
  columnFilteringFeature,
  // Powers `column.getFacetedUniqueValues()`. On v9 an unregistered facet's
  // method is absent rather than empty, so the faceted row models below are
  // required and not optional.
  columnFacetingFeature,
  // globalFilteringFeature requires columnFilteringFeature, declared above.
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowExpandingFeature,
  rowPinningFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  /**
   * Every built-in v9 ships. A string `sortFn` resolves against this map
   * alone, and `sortFn: "auto"` infers a name ("alphanumeric", "text" or
   * "datetime") from the first row's value - so a partial map makes auto
   * sorting warn and silently fall back on ordinary string columns.
   */
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    alphanumericCaseSensitive: sortFn_alphanumericCaseSensitive,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
  },
  /**
   * **A `filterFns` map is required, and the grid's own bundle ships none.**
   * v9 resolves a string `filterFn` against this map alone - so with the map
   * absent no name is valid, and a column that wanted one silently kept the
   * default.
   *
   * **A facet then changes nothing.** `DataGridColumnFilter` writes an array
   * of selected values; the default filter matches a string, so the filter is
   * set, matches no row, and the table redraws identically.
   *
   * Every built-in, for the reason the sort map states: a partial registry
   * makes `filterFn: "auto"` fall back quietly rather than fail.
   */
  filterFns: {
    arrIncludes: filterFn_arrIncludes,
    arrIncludesAll: filterFn_arrIncludesAll,
    arrIncludesSome: filterFn_arrIncludesSome,
    equals: filterFn_equals,
    equalsString: filterFn_equalsString,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString,
    includesStringSensitive: filterFn_includesStringSensitive,
    weakEquals: filterFn_weakEquals,
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columnMeta: metaHelper<EntityColumnMeta<any>>(),
})

/**
 * v9 threads the feature set through every type as the first generic.
 *
 * These three aliases exist so that fourteen files do not each have to spell
 * `Table<typeof entityFeatures, TData>` - and so that adding a feature above
 * reaches all of them at once instead of being a fourteen-file edit.
 */
export type EntityFeatures = typeof entityFeatures
export type EntityTable<TData extends RowData> = Table<EntityFeatures, TData>
export type EntityRow<TData extends RowData> = Row<EntityFeatures, TData>
/** `TableMeta` gained the feature generic too; screens pass only their row. */
export type EntityTableMeta<TData extends RowData> =
  TableMeta<EntityFeatures, TData>
/**
 * One column, ready for the grid.
 *
 * Two things every screen would otherwise repeat, done once:
 *
 * - **A string header becomes a sort control.** The kit's `Column` renders the
 *   header it is handed and adds no sort affordance of its own, so a plain
 *   string column would draw a sortable table nobody can sort. A column file
 *   keeps its `header: 'Domain'` and gets the button.
 * - **`meta.className` reaches both halves.** The grid reads
 *   `headerClassName` and `cellClassName` separately; this app has always had
 *   one declaration that governs the column, and the width utilities on the
 *   selection and actions columns depend on landing in both.
 */
function gridColumn<TData extends RowData>(
  column: EntityColumn<TData>,
): EntityColumn<TData> {
  const shared = column.meta?.className
  const header: StringOrTemplateHeader<EntityFeatures, TData> | undefined =
    typeof column.header === 'string'
      ? // Captured, because the render below runs long after this map.
        (({ column: instance }) => (
          <EntityHeader column={instance} title={column.header as string} />
        ))
      : column.header
  return {
    ...column,
    ...(header ? { header } : {}),
    ...(shared
      ? { meta: { ...column.meta, headerClassName: shared, cellClassName: shared } }
      : {}),
  } as EntityColumn<TData>
}

/**
 * A column title, with the sort control when the column has one.
 *
 * One press toggles the sort, and this button is the whole affordance: the
 * `Column` it renders into sets no `aria-sort`. -> `data-table.tsx`
 */
function EntityHeader<TData extends RowData>({
  column,
  title,
}: {
  column: Column<EntityFeatures, TData>
  title: string
}) {
  const direction = column.getIsSorted()
  if (!column.getCanSort()) {
    // A narrow pane truncates a header to "DISP..."; the full word on hover is
    // the only thing that makes that legible.
    return <span className="block truncate" title={title}>{title}</span>
  }
  return (
    // `uppercase` again: the CSS reset sets `text-transform: none` on
    // `button`, so the th's own casing stopped at the sortable headers and one
    // row read "Domain ... CONTEXT ... Source".
    //
    // **`-my-2 py-2` claims the cell's vertical padding.** The text is
    // `text-2xs`, so the button measured 17px inside a comfortably tall `th` -
    // a click 4px above the word landed on the cell and sorted nothing.
    <button
      type="button"
      title={title}
      className="-my-2 inline-flex max-w-full items-center gap-1 py-2 uppercase hover:text-ink"
      onClick={column.getToggleSortingHandler()}
    >
      <span className="truncate">{title}</span>
      {direction === 'asc' ? (
        <ArrowUp className="size-3 shrink-0" aria-hidden />
      ) : direction === 'desc' ? (
        <ArrowDown className="size-3 shrink-0" aria-hidden />
      ) : (
        <ChevronsUpDown className="size-3 shrink-0 opacity-50" aria-hidden />
      )}
    </button>
  )
}
/**
 * Build the table. Every screen calls this rather than `useTable`.
 *
 * The three states it holds are the three a screen would otherwise lose on
 * every refetch, and they are held here so no screen decides differently.
 */
export function useEntityTable<TData extends { id: string }>({
  data,
  columns,
  meta,
  enableExpanding = false,
  canSelect,
  initialSorting,
}: EntityTableOptions<TData>): EntityTable<TData> {
  const gridColumns = useMemo(() => columns.map(gridColumn), [columns])
  return useTable<EntityFeatures, TData>({
    data,
    columns: gridColumns,
    meta,
    features: entityFeatures,
    // **The table owns these three now, and holding them in React breaks
    // them.** v9's getters read the store - `row_getIsExpanded` consults
    // `table.atoms.expanded` - while `table_setExpanded` only forwards to
    // `onExpandedChange` and writes nothing itself. So a v8-style controlled
    // pair leaves the setter updating React state that no getter reads, and
    // a row toggles without ever reporting itself expanded.
    initialState: { sorting: initialSorting ?? [] },
    // **The bundle registers a paginated row model, and it is not inert.**
    // `table.getRowModel()` is sliced to `pageSize` - 10 by default - unless
    // the table opts out, so without this every entity table in the app shows
    // its first ten rows and stops. `manualPagination` is v9's way to say the
    // data already is the page; no screen here paginates.
    manualPagination: true,
    // **Defaults to true, and throws the open row away on every refetch.** The
    // table resets expansion whenever `data` changes identity, which for a
    // query result is every render.
    autoResetExpanded: false,
    // The line continuity rests on. Without it TanStack keys selection and
    // expansion by array index.
    getRowId: (row) => row.id,
    // **A predicate, because "may this row be selected" is a table-level
    // question and some tables have an answer.** The import wizard caps a
    // selection at the ceiling the server refuses above.
    enableRowSelection: canSelect ? (row) => canSelect(row.original) : true,
    getRowCanExpand: () => enableExpanding,
  })
}

/** Rows below this stay whole in the DOM. Measured against a 30-row table. */
export const VIRTUALIZE_FROM = 50

/** Corrected by `measureElement` on first paint; only the scrollbar sees it. */
export const ESTIMATED_ROW_HEIGHT = 44
export interface DataTableProps<TData extends { id: string }> {
  table: EntityTable<TData>
  /** The grid's accessible name. Screen readers announce it as the caption. */
  label: string
  /** Rendered in place of the table when there are no rows. */
  empty?: ReactNode | undefined
  /** A detail panel under an expanded row. Requires `enableExpanding`. */
  renderExpanded?: ((row: EntityRow<TData>) => ReactNode) | undefined
  virtualizeFrom?: number | undefined
  estimatedRowHeight?: number | undefined
  /**
   * Who owns the scroll.
   *
   * `'box'` shrinks the table into the room its column has left and scrolls
   * inside itself, which keeps a section's controls on screen while a long
   * table moves under them. `'page'` lets it grow to its full height and leaves the scrolling to
   * the pane, the way Timeline's card list reads.
   *
   * The sticky header works either way: it sticks to whichever ancestor is
   * doing the scrolling.
   */
  scroll?: 'box' | 'page' | undefined
  className?: string | undefined
  /**
   * A row to scroll to and flash on arrival, from an entity link's
   * `?highlight=` - the same idiom `TimelineList` runs on `#entry-{id}`.
   * Scrolls the virtualizer to it first when the table is windowed (the row is
   * not in the DOM until then), then `scrollIntoView`s the row once it has
   * mounted.
   *
   * **Silently a no-op when the id names no row in the current model** - a
   * page, sort or filter that excludes it, same known limit as Timeline's own
   * `focusEntryId` missing a deleted entry.
   */
  highlightId?: string | undefined
}
