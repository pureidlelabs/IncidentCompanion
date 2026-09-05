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
 */

/**
 * A column of any value type, in this app's feature set.
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
   */
  href?: string | undefined
  onSelect?: (() => void) | undefined
}

/** A run of items with a rule drawn above it. Empty groups are dropped. */
export type RowMenuGroup = RowMenuItem[]



/**
 * Per-column extras: this app's, and the ones a grid renderer reads.
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
   */
  rowLabel?: (row: TData) => string
  /**
   * Verbs this table has that `defaultRowMenu` does not know about, drawn
   * below the ones it does.
   */
  rowMenuExtra?: (row: TData) => RowMenuGroup[]
  /**
   * Which of the shared verbs *this row* allows.
   */
  rowCan?: (row: TData) => { edit?: boolean; delete?: boolean }
}
declare module '@tanstack/react-table' {
  /**
   * What every cell in this app may ask the table for.
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
     */
    collection?: CollectionName | undefined
  }
}
/**
 * The table's `meta` as *this row* sees it.
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
    /**
     * Which table these rows are, so a row can say who else is in it.
     */
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
   * Every built-in v9 ships.
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
 */
export type EntityFeatures = typeof entityFeatures
export type EntityTable<TData extends RowData> = Table<EntityFeatures, TData>
export type EntityRow<TData extends RowData> = Row<EntityFeatures, TData>
/** `TableMeta` gained the feature generic too; screens pass only their row. */
export type EntityTableMeta<TData extends RowData> =
  TableMeta<EntityFeatures, TData>
/**
 * One column, ready for the grid.
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
   */
  scroll?: 'box' | 'page' | undefined
  className?: string | undefined
  /**
   * A row to scroll to and flash on arrival, from an entity link's `?highlight=`
   * - the same idiom `TimelineList` runs on `#entry-{id}`.
   */
  highlightId?: string | undefined
}
