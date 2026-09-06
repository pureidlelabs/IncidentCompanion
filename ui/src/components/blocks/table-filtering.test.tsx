/**
 * Pressing a facet must change the rows.
 *
 * **The failure this refuses is silent.** `DataGridColumnFilter` writes an
 * *array* of selected values through `column.setFilterValue`. v9 resolves a
 * string `filterFn` name against the features bundle's own `filterFns`
 * registry, and the grid's own bundle ships none -- so a column naming one
 * keeps the default, which matches a string.
 *
 * The filter is then set, matches nothing, and the table redraws identically.
 * Nothing goes red: the state changes, the render happens, and only the rows
 * are wrong.
 *
 * So this asserts on the rows the table yields, never on the filter state -
 * a test reading `getFilterValue()` back would have passed throughout.
 */
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'

import { useEntityTable, type EntityColumn } from './data-table'

interface Row {
  id: string
  state: string
}

const DATA: Row[] = [
  { id: '1', state: 'active' },
  { id: '2', state: 'disabled' },
  { id: '3', state: 'active' },
]

const COLUMNS: EntityColumn<Row>[] = [
  {
    id: 'state',
    accessorKey: 'state',
    header: 'State',
    filterFn: 'arrIncludes',
    cell: ({ row }) => row.original.state,
  },
]

function tableFor() {
  const { result } = renderHook(() =>
    useEntityTable({
      data: DATA,
      columns: COLUMNS,
      meta: { pendingIds: new Set<string>(), commit: () => undefined, remove: () => undefined },
    }),
  )
  return result
}

describe('a faceted column filter', () => {
  it('narrows the rows the table yields', () => {
    const result = tableFor()

    expect(result.current.getRowModel().rows).toHaveLength(3)

    result.current.getColumn('state')?.setFilterValue(['disabled'])

    expect(
      result.current.getRowModel().rows.map((row) => row.original.state),
      'the filter was set and no row matched it',
    ).toEqual(['disabled'])
  })

  /**
   * **The registry is the thing that was missing**, so it is asserted
   * directly: without a `filterFns` map on the bundle, `arrIncludes` is not a
   * name any column may use and the column falls back without complaining.
   */
  it('accepts more than one value', () => {
    const result = tableFor()

    result.current.getColumn('state')?.setFilterValue(['active', 'disabled'])

    expect(result.current.getRowModel().rows).toHaveLength(3)
  })

  it('shows every row again once the filter is dropped', () => {
    const result = tableFor()

    result.current.getColumn('state')?.setFilterValue(['disabled'])
    result.current.getColumn('state')?.setFilterValue(undefined)

    expect(result.current.getRowModel().rows).toHaveLength(3)
  })
})
