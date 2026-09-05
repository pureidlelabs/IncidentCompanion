import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { AsyncBoundary } from '@/components/ui/async-boundary'

/**
 * A case section inside the shell's pane: a head, a toolbar row, the body, and
 * a footer.
 */
/** What a section needs to know about the read behind it. */
export interface SectionRead {
  isPending: boolean
  isError: boolean
  error?: unknown
  refetch?: (() => void) | undefined
}

export function Section({
  title,
  meta,
  blurb,
  actions,
  toolbar,
  footer,
  fills = false,
  scrolls = true,
  measure = 'full',
  read,
  children,
}: {
  title: ReactNode
  /** Beside the title - a count, a status. Not a control. */
  meta?: ReactNode | undefined
  /** One line under the title. Say the consequence, never the rationale. */
  blurb?: ReactNode | undefined
  /** The section's own controls, right-aligned on the head's first line. */
  actions?: ReactNode | undefined
  /** The row under the head: a search box, filter chips, a bulk-action bar. */
  toolbar?: ReactNode | undefined
  /** Under the body: a pager, a save row. Pinned when `fills`. */
  footer?: ReactNode | undefined
  /** Give the body the pane's height and scroll inside it, pinning the footer. */
  fills?: boolean
  /**
   * Whether the body is the scrollport. False where a child claims that role,
   * as a table bounded to its own box does.
   */
  scrolls?: boolean
  /**
   * How wide the body runs.
   */
  measure?: 'full' | 'form'
  /**
   * The read behind this section, when there is one.
   */
  read?: SectionRead | undefined
  children: ReactNode
}) {
  return (
    <section
      data-slot="section"
      className={cn(
        'flex flex-col gap-3',
        fills && 'min-h-0 flex-1',
        measure === 'form' && 'w-full max-w-(--content-max)',
      )}
    >
      {/* `items-start`, not `items-baseline`: a 32px control in a
          baseline-aligned row contributes its own text baseline, which sits
          lower than a bare heading's - so a section carrying a button drew its
          title 4px below one that did not. */}
      <div
        data-slot="section-head"
        className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-lg font-semibold">{title}</h1>
            {meta}
          </div>
          {blurb !== undefined && <p className="text-xs text-ink-muted">{blurb}</p>}
        </div>
        {actions}
      </div>

      {toolbar}

      <div
        data-slot="section-body"
        className={cn(
          'flex flex-col',
          // **`relative`, or the body clips its rows and not what they carry.**
          // `overflow` does not make a box a containing block, so an
          // absolutely positioned descendant resolves against the nearest
          // positioned ancestor -- the pane -- and inflates the pane's
          // scrollable overflow from inside the box meant to have clipped it.
          // A wheel gesture then chains past the body and takes the head with
          // it. Every row checkbox carries such a span.
          //
          // Then room on all four edges for a ring the scrollport would
          // otherwise clip, the horizontal pair cancelled by a negative margin
          // so the body still lines up with the head and the toolbar above it.
          fills && [
            'relative min-h-0 flex-1',
            'py-(--section-ring-room) px-(--section-ring-room) -mx-(--section-ring-room)',
          ],
          // Only where the body is the scrollport. A section whose child claims
          // that role reserves a scrollbar slot for a bar it never draws, and
          // reaches into the pane's gutter to put it there.
          fills &&
            scrolls && [
              'overflow-y-auto',
              // **`will-change-transform` is load-bearing.** A scrollport whose
              // top lands on a fractional pixel rounds its clip and its sticky
              // header onto different device rows; its own layer snaps both to
              // the same one.
              'will-change-transform',
              // Room for the sticky column header, so arrowing to a row does
              // not scroll it underneath one. Without it the browser aligns the
              // row to the scrollport's own top, which is behind the header.
              'scroll-pt-(--table-header-room)',
              // The right edge reaches most of the way through the pane's own
              // inset, so the bar sits in the gutter rather than in the middle
              // of the page or hard against its edge. The matching padding
              // leaves the rows exactly where they were.
              'pr-(--pane-gutter) -mr-(--pane-gutter)',
              // Reserved rather than claimed on demand: paging to a short page
              // would otherwise jolt every row sideways by the bar's width.
              '[scrollbar-gutter:stable]',
              // What sticks to this body clears the room above, or the rows
              // scroll through the strip it opens.
              '[--sticky-top:var(--section-sticky-top)]',
            ],
        )}
      >
        {read ? (
          <AsyncBoundary
            isPending={read.isPending}
            isError={read.isError}
            error={read.error}
            {...(read.refetch ? { refetch: read.refetch } : {})}
          >
            {children}
          </AsyncBoundary>
        ) : (
          children
        )}
      </div>

      {footer !== undefined && <div className="shrink-0">{footer}</div>}
    </section>
  )
}
