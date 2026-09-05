import { FilterX, ListFilter, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogTrigger } from '@/components/ui/dialog'
import { FieldGroup, GroupInput } from '@/components/ui/field'
import { Popover } from '@/components/ui/popover'
import { AppliedFilters, type AppliedFilter } from './filter-bar'
import { cn } from '@/lib/cn'

/**
 * The row above a table: what it is narrowed by, and how to stop.
 */
export function TableToolbar({
  searchColumn,
  operator = 'contains',
  placeholder,
  value,
  onValue,
  filters,
  lead,
  applied = [],
  narrowed,
  onClear,
  end,
  className,
}: {
  /** The column the value box searches, named so the row says which. */
  searchColumn: string
  /** How the value is matched. One word, because the screen decides it. */
  operator?: string
  /** Greyed text inside the empty box. */
  placeholder: string
  /** The search text. Controlled. */
  value: string
  /** Fires on every keystroke, and with `''` when the box is cleared. */
  onValue: (next: string) => void
  /** The faceted popovers, behind `Filters`. */
  filters?: ReactNode
  /**
   * A narrowing control that stays on the row rather than going behind
   * `Filters`, drawn first.
   */
  lead?: ReactNode | undefined
  /**
   * The filters that are on, each removable on its own.
   */
  applied?: readonly AppliedFilter[]
  /** Whether anything is narrowing the table. Draws `Clear`. */
  narrowed: boolean
  /** Drops every filter, including the search text. */
  onClear: () => void
  /** What sits at the far end of the row: a selection's actions, a section's
   *  own controls. */
  end?: ReactNode | undefined
  /** Utilities for where the row sits. */
  className?: string | undefined
}) {
  return (
    <div
      data-slot="table-toolbar"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {lead}

      {filters && (
        <DialogTrigger>
          <Button variant="outline" size="sm">
            <ListFilter aria-hidden />
            Filters
          </Button>
          <Popover placement="bottom start">
            <div className="flex w-auto flex-col gap-2 p-2">{filters}</div>
          </Popover>
        </DialogTrigger>
      )}

      <FieldGroup size="sm" className="gap-1 px-1.5">
        <Badge size="xs" className="shrink-0">
          {searchColumn}
        </Badge>
        <span className="shrink-0 px-0.5 text-xs text-ink-muted">{operator}</span>
        <GroupInput
          value={value}
          placeholder={placeholder}
          aria-label={`${searchColumn} ${operator}`}
          className="w-56 px-1 text-sm"
          onChange={(event) => {
            onValue(event.target.value)
          }}
        />
        {value !== '' && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear the search"
            className="shrink-0 text-ink-muted"
            onPress={() => {
              onValue('')
            }}
          >
            <X aria-hidden />
          </Button>
        )}
      </FieldGroup>

      <AppliedFilters applied={applied} />

      {narrowed && (
        <Button variant="ghost" size="sm" onPress={onClear}>
          <FilterX aria-hidden />
          Clear
        </Button>
      )}

      {end && <div className="ml-auto flex items-center gap-2">{end}</div>}
    </div>
  )
}
