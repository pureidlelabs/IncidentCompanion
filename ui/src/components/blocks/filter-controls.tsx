import type { ReactElement } from 'react'

import { Chip, FilterGroup, FilterPicker, PickerGroup, PickerRow } from './filter-bar'
import { chosenIn, toggleFilter, type FilterControlsProps } from './filter-set'

/**
 * The whole filter concern for one table: the controls, the tokens, whether
 * anything is narrowing, and the way back.
 *
 * A screen declares its dimensions and holds one value; `filter-set.ts` holds
 * the model and the arithmetic.
 */

/**
 * The controls, as a popover's contents.
 *
 * **A column of groups, each group flowing on one line.** The bar's own
 * `FilterGroup` puts a rule between dimensions, which is right in a row and
 * draws a stray tick between stacked groups here - so the rule is dropped and
 * the heading does the separating.
 */
export function FilterControls({
  dimensions,
  selection,
  onChange,
}: FilterControlsProps): ReactElement | null {
  const drawn = dimensions.filter((one) => one.options.length > 0)
  if (drawn.length === 0) return null

  return (
    <div data-slot="filter-set" className="flex flex-col gap-2">
      {drawn.map((dimension) => {
        const on = chosenIn(selection, dimension.key)
        const toggle = (value: string) => () => {
          onChange(toggleFilter(selection, dimension, value))
        }

        return (
          <div key={dimension.key} className="flex flex-wrap items-center gap-1.5">
            {dimension.as === 'picker' ? (
              <FilterPicker label={dimension.label} active={on.length}>
                <PickerGroup label={dimension.groupLabel ?? dimension.label}>
                  {dimension.options.map((option) => (
                    <PickerRow
                      key={option.value}
                      label={option.label ?? option.value}
                      count={option.count ?? 0}
                      checked={on.includes(option.value)}
                      onToggle={toggle(option.value)}
                    />
                  ))}
                </PickerGroup>
              </FilterPicker>
            ) : (
              <FilterGroup label={dimension.label} first>
                {dimension.options.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label ?? option.value}
                    count={option.count}
                    pressed={on.includes(option.value)}
                    onToggle={toggle(option.value)}
                  />
                ))}
              </FilterGroup>
            )}
          </div>
        )
      })}
    </div>
  )
}
