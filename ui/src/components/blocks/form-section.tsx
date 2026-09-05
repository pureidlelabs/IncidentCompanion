import { ChevronDown, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import type { FieldSpec } from '@/api/specs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * A named group of fields, laid across the width it is given.
 */
export function FormSection({
  title,
  chip,
  detail,
  columns = 3,
  icon: Icon,
  tone = 'plain',
  hideTitle = false,
  layout = 'grid',
  compact = false,
  folded,
  foldedAsRows = false,
  foldCount,
  foldOpen = false,
  className,
  children,
}: {
  title: string
  /** A word qualifying the whole group, beside its name. Derived, never decoration. */
  chip?: ReactNode | undefined
  /** One line saying what the group is, where the name cannot say it. */
  detail?: string | undefined
  /** How many controls sit across. Two below `sm` is the grid's own floor. */
  columns?: 2 | 3 | undefined
  /** A tinted tile before the title. */
  icon?: LucideIcon | undefined
  /** `plate` draws the group on its own raised ground. */
  tone?: 'plain' | 'plate' | undefined
  /** Name the group for the accessibility tree and draw no heading. */
  hideTitle?: boolean | undefined
  /** `plain` hands the children the whole width instead of a grid cell. */
  layout?: 'grid' | 'plain' | undefined
  /** Draw as one row rather than as a section. `FoldedGroups` stacks these. */
  compact?: boolean | undefined
  /** The optional run, behind the section's own disclosure. */
  folded?: ReactNode | undefined
  /** The fold opens into `FieldRow`s rather than into a grid of controls. */
  foldedAsRows?: boolean | undefined
  /** How many controls the fold holds, and how many of them are set. */
  foldCount?: { total: number; set: number } | undefined
  /** Whether the fold starts open. An edit opens every group holding a value. */
  foldOpen?: boolean | undefined
  className?: string | undefined
  children?: ReactNode | undefined
}) {
  const [open, setOpen] = useState(foldOpen)
  const Tag = title === '' ? 'div' : 'section'
  const grid = cn(
    'grid items-start gap-x-4 gap-y-3',
    columns === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2',
  )

  return (
    <Tag
      {...(title === '' ? {} : { 'aria-label': title })}
      className={cn(
        'flex flex-col',
        compact ? 'px-3' : 'gap-3',
        tone === 'plate' && 'rounded-md border border-border bg-muted/60 px-4 py-3',
        className,
      )}
    >
      {((title !== '' && !hideTitle) || folded !== undefined) && (
        <div
          className={cn(
            'flex flex-col gap-0.5',
            compact ? 'py-1.5' : 'pb-1',
            // A plate is bounded by its own edge, so a rule under the heading
            // would draw a second boundary inside the first.
            !compact && tone !== 'plate' && 'border-b',
          )}
        >
          <div className="flex items-center gap-2">
            {Icon !== undefined && (
              <span
                aria-hidden
                className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-ink-muted"
              >
                <Icon className="size-3.5" />
              </span>
            )}
            <h3 className="text-micro uppercase tracking-micro text-ink-muted">{title}</h3>
            {chip !== undefined && (
              <Badge variant="soft" size="xs" uppercase={false}>
                {chip}
              </Badge>
            )}
            {folded !== undefined && (
              <Button
                variant="ghost"
                size="xs"
                aria-expanded={open}
                // A handle a test can press: `aria-expanded` alone also marks
                // a select trigger and a table row's chevron.
                data-fold={title}
                className="-my-1 ml-auto gap-1.5 text-2xs text-ink-muted"
                onPress={() => {
                  setOpen((was) => !was)
                }}
              >
                {open ? 'Fewer' : foldLabel(foldCount, chip !== undefined)}
                <ChevronDown
                  className={cn(
                    'size-3.5 transition-transform duration-(--duration-fast) ease-(--ease-out)',
                    open && 'rotate-180',
                  )}
                  aria-hidden
                />
              </Button>
            )}
          </div>
          {detail !== undefined && <p className="text-2xs text-ink-muted">{detail}</p>}
        </div>
      )}
      {children !== undefined &&
        (layout === 'plain' ? children : (
          <div data-slot="form-grid" data-columns={columns} className={grid}>
            {children}
          </div>
        ))}
      {folded !== undefined && open && (
        <div
          className={cn(
            foldedAsRows ? 'flex flex-col divide-y' : grid,
            compact && (foldedAsRows ? 'pb-1' : 'pb-3 pt-1'),
          )}
        >
          {folded}
        </div>
      )}
    </Tag>
  )
}

/**
 * What a shut fold's control reads.
 */
function foldLabel(
  count: { total: number; set: number } | undefined,
  hasChip: boolean,
): string {
  if (count === undefined) return 'More'
  if (count.set > 0 && !hasChip) return `${String(count.set)} of ${String(count.total)} set`
  return `${String(count.total)} more`
}

/**
 * A run of all-optional groups, as one bordered list of rows.
 */
export function FoldedGroups({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-lg border px-3">{children}</div>
}

/**
 * One field's place in a section's grid: a cell, or the whole row.
 */
export function FormCell({
  span = 'cell',
  children,
}: {
  /** `row` takes the whole measure; `cell` takes one column. */
  span?: 'cell' | 'row' | undefined
  children: ReactNode
}) {
  return (
    <div data-slot="form-cell" data-span={span} className={span === 'row' ? 'col-span-full' : ''}>
      {children}
    </div>
  )
}

/**
 * Whether a field's control wants the whole row rather than a cell.
 */
export function spansRow<TRow>(field: FieldSpec<TRow>): boolean {
  return field.kind === 'textarea' || (field.fullWidth === true && field.kind === 'text')
}
