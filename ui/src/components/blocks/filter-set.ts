import { useState } from 'react'

import type { AppliedFilter } from './filter-bar'

/**
 * What a filter is made of, and the arithmetic over it.
 */

/** One value a dimension can take. */
export interface FilterOption {
  /** What the screen matches on. */
  value: string
  /** The analyst's word, where it differs from the value. */
  label?: string | undefined
  /** Rows it leaves, computed by the screen against its other filters. */
  count?: number | undefined
}

/** One thing a table can be narrowed by. */
export interface FilterDimension {
  /** The key this dimension's values are held under. */
  key: string
  /** The group heading, and a picker's trigger. */
  label: string
  /**
   * Whether the values are exclusive.
   */
  mode?: 'one' | 'many' | undefined
  /**
   * How the values are drawn. `'picker'` for a dimension whose values are
   * whatever this case holds, which is too wide for a chip each.
   */
  as?: 'chips' | 'picker' | undefined
  /** The heading inside a picker pane, where it differs from the trigger. */
  groupLabel?: string | undefined
  /**
   * The values on offer now.
   */
  options: readonly FilterOption[]
}

/** What is on, per dimension. An emptied dimension is `[]`, never absent. */
export type FilterSelection = Readonly<Record<string, readonly string[]>>

/** One array for every unset dimension, so a memo keyed on it holds. */
const NOTHING: readonly string[] = []

/** The values on in one dimension. Unset reads as one shared empty array, so
 *  a memo keyed on it holds across renders. */
export const chosenIn = (selection: FilterSelection, key: string): readonly string[] =>
  selection[key] ?? NOTHING

/** Turns one value on or off, honouring the dimension's mode. */
export function toggleFilter(
  selection: FilterSelection,
  dimension: FilterDimension,
  value: string,
): FilterSelection {
  const on = chosenIn(selection, dimension.key)
  if (on.includes(value)) {
    return { ...selection, [dimension.key]: on.filter((one) => one !== value) }
  }
  return {
    ...selection,
    [dimension.key]: dimension.mode === 'one' ? [value] : [...on, value],
  }
}

/** Takes one value off, and nothing else. */
export function dropFilter(
  selection: FilterSelection,
  key: string,
  value: string,
): FilterSelection {
  return { ...selection, [key]: chosenIn(selection, key).filter((one) => one !== value) }
}

/** Whether any dimension is holding a value. */
export function filterNarrowed(selection: FilterSelection): boolean {
  return Object.values(selection).some((values) => values.length > 0)
}

/**
 * The tokens for everything that is on, in the dimensions' own order.
 */
export function appliedFilters(
  dimensions: readonly FilterDimension[],
  selection: FilterSelection,
  onChange: (next: FilterSelection) => void,
): AppliedFilter[] {
  const out: AppliedFilter[] = []
  for (const dimension of dimensions) {
    for (const value of chosenIn(selection, dimension.key)) {
      const option = dimension.options.find((one) => one.value === value)
      out.push({
        key: `${dimension.key}:${value}`,
        label: option?.label ?? value,
        count: option?.count,
        onRemove: () => {
          onChange(dropFilter(selection, dimension.key, value))
        },
      })
    }
  }
  return out
}

/** Everything `FilterControls` draws from. */
export interface FilterControlsProps {
  dimensions: readonly FilterDimension[]
  selection: FilterSelection
  onChange: (next: FilterSelection) => void
}

/** What a screen gets back, and all it needs to fill a `TableToolbar`. */
export interface FilterSet {
  /** What is on, for the screen's own matching. */
  selection: FilterSelection
  /** The values on in one dimension. */
  chosen: (key: string) => readonly string[]
  /** The one value on in an exclusive dimension, or `undefined`. */
  one: (key: string) => string | undefined
  /** Whether any dimension is narrowing. The search box is the screen's own. */
  narrowed: boolean
  /** The tokens, for `TableToolbar`'s `applied`. */
  applied: readonly AppliedFilter[]
  /** Drops every filter this block holds. */
  clear: () => void
  /** What `FilterControls` needs, for `TableToolbar`'s `filters` slot. */
  controls: FilterControlsProps
}

/**
 * Hold the filters for one table.
 */
export function useFilters(dimensions: readonly FilterDimension[]): FilterSet {
  const [selection, setSelection] = useState<FilterSelection>({})

  return {
    selection,
    chosen: (key) => chosenIn(selection, key),
    one: (key) => chosenIn(selection, key)[0],
    narrowed: filterNarrowed(selection),
    applied: appliedFilters(dimensions, selection, setSelection),
    clear: () => {
      setSelection({})
    },
    controls: { dimensions, selection, onChange: setSelection },
  }
}
