import { Search, type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FieldGroup, GroupInput } from '@/components/ui/field'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { cn } from '@/lib/cn'

/**
 * One thing that can be picked from a searchable pane.
 */
export interface PickRow {
  /** What `onValueChange` reports. Distinct from `title`, which is read. */
  value: string
  title: string
  detail?: string | undefined
  /** A word qualifying the row, beside its title. Derived, never decoration. */
  chip?: ReactNode | undefined
  icon: LucideIcon
  /** How the tile is tinted: `quiet` makes nothing, `flag` carries an obligation. */
  tone?: 'default' | 'quiet' | 'flag' | undefined
  extra?: ReactNode | undefined
}

const TILE: Readonly<Record<NonNullable<PickRow['tone']>, string>> = {
  default: 'bg-primary/15 text-primary',
  quiet: 'bg-muted text-ink-muted',
  flag: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
}

/**
 * The pane half of a two-pane picker: a search that sticks, and the rows.
 */
export function PickPane({
  search,
  onSearch,
  searchLabel,
  searchPlaceholder,
  legend,
  rows,
  value,
  onValueChange,
}: {
  search: string
  onSearch: (next: string) => void
  /** Names the search box for a screen reader. */
  searchLabel: string
  searchPlaceholder: string
  /** Names the group of rows for a screen reader. Never drawn. */
  legend: string
  /** Already filtered: what the caller decided the search and the rail leave. */
  rows: readonly PickRow[]
  value: string
  onValueChange: (next: string) => void
}) {
  return (
    <>
      <div className="sticky -top-1 z-10 -mx-1 shrink-0 bg-popover px-1 pt-1 pb-1">
        <FieldGroup className="gap-1 px-2">
          <Search aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <GroupInput
            type="search"
            value={search}
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            className="px-1"
            onChange={(event) => {
              onSearch(event.target.value)
            }}
          />
        </FieldGroup>
      </div>

      <div className="flex min-h-0 flex-col gap-2">
        {rows.length === 0 && (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-ink-muted">
            Nothing matches &#x201C;{search.trim()}&#x201D;.{' '}
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0 text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
              onPress={() => {
                onSearch('')
              }}
            >
              Clear the search
            </Button>
          </p>
        )}

        {rows.length > 0 && (
          <RadioGroup
            aria-label={legend}
            value={value}
            onChange={(next) => {
              onValueChange(next)
            }}
          >
            {rows.map((row) => {
              const Glyph = row.icon
              return (
                // The row is the target, and the radio inside keeps the
                // group's arrow keys. A tab stop here would be a second one
                // for a single choice.
                <Item
                  key={row.value}
                  variant="outline"
                  onClick={() => {
                    onValueChange(row.value)
                  }}
                  className={cn(
                    'cursor-pointer items-start gap-3',
                    row.value === value && 'border-primary bg-primary/5',
                  )}
                >
                  <ItemMedia
                    className={cn('size-10 shrink-0 rounded-md', TILE[row.tone ?? 'default'])}
                  >
                    <Glyph aria-hidden className="size-5" />
                  </ItemMedia>
                  <ItemContent className="gap-1.5">
                    <ItemTitle>
                      {row.title}
                      {row.chip !== undefined && (
                        <Badge variant="soft" size="xs">
                          {row.chip}
                        </Badge>
                      )}
                    </ItemTitle>
                    {row.detail !== undefined && row.detail !== '' && (
                      <ItemDescription>{row.detail}</ItemDescription>
                    )}
                    {row.extra}
                  </ItemContent>
                  <ItemActions>
                    <Radio value={row.value} aria-label={row.title} />
                  </ItemActions>
                </Item>
              )
            })}
          </RadioGroup>
        )}
      </div>
    </>
  )
}
