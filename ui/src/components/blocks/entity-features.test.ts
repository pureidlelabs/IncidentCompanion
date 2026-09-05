import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useEntityTable, type EntityColumn } from './data-table'

/**
 * The feature bundle every table is built on, held to its exact shape.
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
