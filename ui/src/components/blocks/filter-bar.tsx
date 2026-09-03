import { ListFilter, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DialogTrigger } from '@/components/ui/dialog'
import { Popover } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ToggleButton } from '@/components/ui/toggle-button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/cn'

/**
 * One value in a filter row, pressed or not.
 *
 * - A `count` of zero disables the chip while it is unpressed, so an empty
 *   dimension stays on screen and stays readable.
 * - An absent `count` draws no number and never disables. A chip picking a
 *   mode has no population to report.
 * - The accessible name is the label and the number, separated by a text node
 *   rather than by flex spacing.
 */
export function Chip({
  label,
  count,
  pressed,
  onToggle,
  className,
}: {
  label: string
  /** Rows this chip matches, where the dimension has a population. */
  count?: number | undefined
  pressed: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <ToggleButton
      data-slot="filter-chip"
      data-value={label}
      size="sm"
      // This chip paints its own pressed ground, so the kit's travelling one
      // would land on top of it.
      ground={false}
      isSelected={pressed}
      isDisabled={count === 0 && !pressed}
      onChange={() => {
        onToggle()
      }}
      className={cn(
        'h-auto gap-1.5 rounded-full border px-2.5 py-1 text-xs font-normal',
        pressed
          ? 'border-ink bg-ink text-background hover:bg-ink/90'
          : 'border-border text-ink-muted hover:border-input hover:bg-transparent hover:text-ink',
        className,
      )}
    >
      {label}
      {count !== undefined && (
        <>
          {' '}
          {/* **The opacity only where the ink inverts.** Pressed, the chip is
              `bg-ink text-background` and the count has to follow that ink, so
              70% of it is right and reads 8.74:1. Unpressed, the chip's own ink
              is already `text-ink-muted` and nothing inverts -- so the same 70%
              compounded to 3.06:1, which is the state 6 of 7 chips are in. */}
          <span className={cn('tabular-nums', pressed ? 'opacity-70' : 'text-ink-muted')}>
            {count}
          </span>
        </>
      )}
    </ToggleButton>
  )
}

/**
 * One value inside a `FilterPicker`: a box, a name, and its count.
 *
 * - The whole row is the label, so the name and the number both toggle it.
 * - A zero count dims the row while it is unticked, and never hides it.
 */
export function PickerRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string
  count: number
  checked: boolean
  onToggle: () => void
}) {
  return (
    <Checkbox
      isSelected={checked}
      onChange={() => {
        onToggle()
      }}
      className={cn(
        'w-full cursor-pointer rounded-sm px-2 py-1 text-xs hover:bg-accent',
        count === 0 && !checked && 'opacity-40',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular-nums text-ink-muted">{count}</span>
    </Checkbox>
  )
}

/**
 * A dimension too wide for chips, behind one control stating how many are on.
 *
 * - The trigger is chip-shaped, so it sits in the row instead of beside it.
 * - Dashed while nothing is chosen, filled once something is.
 * - The pane scrolls at `max-h-80`; hand it as many rows as the case holds.
 */
export function FilterPicker({
  label,
  active,
  children,
  className,
}: {
  label: string
  /** How many of this dimension's values are selected. */
  active: number
  children: ReactNode
  className?: string
}) {
  return (
    <DialogTrigger>
      <Button
        data-slot="filter-picker"
        variant="outline"
        size="sm"
        className={cn(
          'h-auto gap-1.5 rounded-full border px-2.5 py-1 text-xs font-normal',
          active > 0
            ? 'border-ink bg-ink text-background hover:bg-ink/90 hover:text-background'
            : 'border-dashed border-input bg-transparent text-ink-muted hover:bg-transparent hover:text-ink',
          className,
        )}
      >
        <ListFilter aria-hidden className="size-3.5" />
        {label}
        {active > 0 && <span className="tabular-nums">{active}</span>}
      </Button>
      <Popover placement="bottom start" className="w-72">
        <ScrollArea className="max-h-80 p-2">{children}</ScrollArea>
      </Popover>
    </DialogTrigger>
  )
}

/**
 * The row itself: a group naming what it narrows.
 *
 * Sticky, so it stays with the rows it narrows while they scroll under it.
 */
export function FilterBar({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="filter-bar"
      role="group"
      aria-label={label}
      className={cn(
        // **The offset cancels the pane's inset, and that is what `0` cannot
        // do.** A sticky offset is measured from the scrollport's *padding*
        // edge, so `top-0` in a pane inset by `--pane-inset-y` pins that far
        // down and the rows scroll through the strip above. Pulling the offset
        // back by the inset pins the bar against the scrollport's own top,
        // where its ground covers the strip -- and it stays out of the resting
        // layout, which anything drawn upward from the bar cannot: no selector
        // tells a stuck sticky element from a resting one, so a band sized for
        // the stuck case is painted over the heading in the resting one.
        'sticky top-(--pane-sticky-top) z-10 -mx-1 flex flex-wrap items-center gap-x-2 gap-y-1.5',
        // Opaque: a bar the rows read through as they pass under it is the
        // collision it is stuck in front of them to prevent, and a blur is
        // not a ground.
        'bg-background px-1 py-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * One dimension inside the bar: a rule, a name, and its controls.
 *
 * - `first` drops the leading rule. The bar cannot read which group is first,
 *   since its children are a mix of groups, an end slot and a screen's own.
 * - `label` is optional, for chips that name themselves.
 */
export function FilterGroup({
  label,
  first,
  children,
}: {
  /** The dimension's name, above its controls. */
  label?: string | undefined
  /** Drops the rule in front of the group. */
  first?: boolean | undefined
  children: ReactNode
}) {
  return (
    <>
      {!first && <Separator orientation="vertical" className="mx-1 h-4 shrink-0" />}
      {label && (
        <span
          data-slot="filter-group"
          className="text-micro uppercase tracking-micro text-ink-muted"
        >
          {label}
        </span>
      )}
      {children}
    </>
  )
}

/** Right-aligned in the bar: whatever a screen puts beside its filters. */
export function FilterBarEnd({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex items-center gap-2">{children}</div>
}

/** The heading over a run of `PickerRow`s. */
export function PickerGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <p className="px-2 pb-1 pt-1 text-2xs uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      {children}
    </>
  )
}

/** One filter that is on, and the way to take it off. */
export interface AppliedFilter {
  /** Stable across renders; React's key and nothing else. */
  key: string
  /** What is on, in the analyst's words: `Needs attention`, `compromised`. */
  label: string
  /** How many rows it leaves, when the screen knows. */
  count?: number | undefined
  /** Takes this one filter off, and no other. */
  onRemove: () => void
}

/**
 * The filters that are on, each removable on its own.
 *
 * **A pressed chip inside a popover is not an answer to "what is this table
 * narrowed by".** It is behind a click, so the bar reads as unfiltered while
 * the table is filtered, and the only way back was `Clear`, which drops every
 * filter including the ones that were fine. The tokens say what is on without
 * opening anything, and each one removes itself.
 *
 * `Clear` stays: it is the way out when several are on and none of them is the
 * one you want to keep.
 *
 * Nothing is drawn when nothing is applied, so a bar that is not narrowed is
 * exactly the bar it was before this existed.
 */
export function AppliedFilters({ applied }: { applied: readonly AppliedFilter[] }) {
  if (applied.length === 0) return null

  return (
    <>
      {applied.map((one) => (
        <span
          key={one.key}
          data-slot="applied-filter"
          className={cn(
            'inline-flex h-(--control-h-sm) shrink-0 items-center gap-1 rounded-full border border-border',
            'bg-muted/50 py-0 pr-0.5 pl-2.5 text-xs text-ink',
          )}
        >
          {one.label}
          {one.count !== undefined && (
            <span className="tabular-nums text-ink-muted">{one.count}</span>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            // Names the filter, not the icon: a screen reader meeting six of
            // these otherwise hears "Remove filter" six times.
            aria-label={`Remove the ${one.label} filter`}
            className="size-5 shrink-0 rounded-full text-ink-muted"
            onPress={one.onRemove}
          >
            {/* **Sized like the tag's cross, which the maintainer ruled on.** The
                box stays a target and only the mark shrinks: 12px inside 20px
                here, matching the tag's 10 inside 16. */}
            <X aria-hidden className="size-3" />
          </Button>
        </span>
      ))}
    </>
  )
}
