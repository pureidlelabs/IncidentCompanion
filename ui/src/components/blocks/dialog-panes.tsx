import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { IconTile } from '@/components/ui/icon-tile'
import { cn } from '@/lib/cn'

/**
 * A dialog body in two panes: a rail that narrows the choice, and the pane
 * holding what was chosen from.
 */
export function DialogPanes({
  rail,
  railLabel,
  showRailLabel = false,
  children,
  className,
}: {
  rail: ReactNode
  /** Names the rail for a screen reader, and draws the label when asked. */
  railLabel: string
  /** Draw the label over the rail as well, where the rows are a vocabulary the
   *  reader may not have. */
  showRailLabel?: boolean
  children: ReactNode
  /** Utilities for where the body sits. */
  className?: string | undefined
}) {
  return (
    // `min-h-0` on both, or neither scrolls: a flex child's default
    // `min-height` is its content, so the panes grow the dialog instead of
    // scrolling inside the height the frame handed them.
    <div
      data-slot="dialog-panes"
      className={cn('flex min-h-0 flex-1 items-stretch gap-5 px-4 pt-2 pb-4', className)}
    >
      <nav
        aria-label={railLabel}
        // Padding for the focus ring, pulled back sideways only. Pulling it
        // back vertically makes the scroll box taller than the slot it sits
        // in, and the scrollbar is then cut at both ends.
        className="-ml-1 flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-1 py-1 pr-3"
      >
        {showRailLabel && (
          <span className="px-2 pb-1.5 text-2xs font-medium tracking-wide text-ink-muted uppercase">
            {railLabel}
          </span>
        )}
        {rail}
      </nav>
      <div className="-mr-1 flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1 pr-3">
        {children}
      </div>
    </div>
  )
}

/**
 * One row in a `DialogPanes` rail: a tile, what it narrows to, and how many.
 */
export function DialogPaneRow({
  icon: Icon,
  label,
  hint,
  active,
  count,
  countLabel,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  /** What this row narrows to, in a few words under the name. */
  hint?: string | undefined
  active: boolean
  count?: number | undefined
  /** What a screen reader hears instead of the bare number. */
  countLabel?: string | undefined
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-slot="dialog-pane-row"
      onClick={onSelect}
      // `aria-pressed` rather than a tab role: this narrows the list beside it,
      // so it is a toggle in a group and not a tab over separate panels.
      aria-pressed={active}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-left',
        'hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active && 'bg-accent',
      )}
    >
      <IconTile size="sm" tone={active ? 'primary' : 'muted'}>
        <Icon />
      </IconTile>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              active ? 'font-medium text-on-accent' : 'text-ink',
            )}
          >
            {label}
          </span>
          {count !== undefined && (
            <span
              className="shrink-0 text-xs text-ink-muted tabular-nums"
              {...(countLabel === undefined ? {} : { 'aria-label': countLabel })}
            >
              {count}
            </span>
          )}
        </span>
        {hint !== undefined && (
          <span className="truncate text-2xs text-ink-muted">{hint}</span>
        )}
      </span>
    </button>
  )
}
