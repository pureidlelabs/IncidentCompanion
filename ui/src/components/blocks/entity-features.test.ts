import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useEntityTable, type EntityColumn } from './data-table'

/**
 * The feature bundle every table is built on, held to its exact shape.
 *
 * `entity-table.tsx` spells the bundle out by hand, entry by entry, from
 * TanStack's own exports. **One of them is held by another test**
 * (`filterFns.arrIncludes`, in `table-filtering.test.tsx`) and cutting the rest
 * leaves the whole client suite green.
 *
 * A missing entry is silent by construction, which is why the shape is asserted
 * rather than a behaviour per entry. On v9 a string `sortFn` or `filterFn`
 * resolves against these maps alone, and `"auto"` infers a name from the first
 * row's value - so a dropped `datetime` leaves a date column sorting as text,
 * with the table rendering and every assertion about the rows it yields still
 * true of the rows it was given.
 *
 * The literals are the claim. Adding a feature or a built-in is meant to fail
 * here and be re-stated once.
 */

interface Row {
  id: string
  state: string
}

const COLUMNS: EntityColumn<Row>[] = [
  { id: 'state', accessorKey: 'state', header: 'State', cell: ({ row }) => row.original.state },
]

/** The bundle is module-level, so any table's options carry the same object. */
function bundle() {
  const { result } = renderHook(() =>
    useEntityTable({
      data: [{ id: '1', state: 'active' }] as Row[],
      columns: COLUMNS,
      meta: { pendingIds: new Set<string>(), commit: () => undefined, remove: () => undefined },
    }),
  )
  return result.current.options.features
}

const keysOf = (map: object | undefined) => Object.keys(map ?? {}).sort()

describe('the table feature bundle', () => {
  it('registers every feature and row model the renderers call', () => {
    expect(Object.keys(bundle()).sort()).toEqual([
      'columnFacetingFeature',
      'columnFilteringFeature',
      'columnMeta',
      'columnOrderingFeature',
      'columnPinningFeature',
      'columnResizingFeature',
      'columnSizingFeature',
      'columnVisibilityFeature',
      'expandedRowModel',
      'facetedRowModel',
      'facetedUniqueValues',
      'filterFns',
      'filteredRowModel',
      'globalFilteringFeature',
      'paginatedRowModel',
      'rowExpandingFeature',
      'rowPaginationFeature',
      'rowPinningFeature',
      'rowSelectionFeature',
      'rowSortingFeature',
      'sortFns',
      'sortedRowModel',
    ])
  })

  it('registers every built-in sort function a column or auto may name', () => {
    expect(keysOf(bundle().sortFns)).toEqual([
      'alphanumeric',
      'alphanumericCaseSensitive',
      'basic',
      'datetime',
      'text',
      'textCaseSensitive',
    ])
  })

  it('registers every built-in filter function a column or auto may name', () => {
    expect(keysOf(bundle().filterFns)).toEqual([
      'arrIncludes',
      'arrIncludesAll',
      'arrIncludesSome',
      'equals',
      'equalsString',
      'inNumberRange',
      'includesString',
      'includesStringSensitive',
      'weakEquals',
    ])
  })
})
