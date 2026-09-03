import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { AsyncBoundary } from '@/components/ui/async-boundary'

/**
 * A case section inside the shell's pane: a head, a toolbar row, the body, and
 * a footer.
 *
 * Every table screen and every form screen is this shape. The shell's pane
 * already supplies the inset and the scroller, so this supplies neither.
 *
 * **`fills` is the whole of the arrangement decision.** By default the body
 * *grows* and the pane scrolls it, which is what a table wants: measured, a
 * section given `min-h-0 flex-1` sat at 611px of an 843px pane and kept a
 * scrollbar of its own inside the pane's. `fills` inverts that - the section
 * takes the pane's height, the body scrolls inside it, and the footer is
 * pinned. Use it where the footer must stay reachable, which is a pager.
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
   * How wide the body runs.
   *
   * `full` for a table, which is what the pane is wide for. `form` holds the
   * body to a reading measure, so a two-column form does not run to 1400px.
   */
  measure?: 'full' | 'form'
  /**
   * The read behind this section, when there is one.
   *
   * **Here rather than in each screen**, which is what `Collection` already
   * does with the same shape. A screen importing the boundary itself is a
   * screen assembling a shape, and eight of them were doing it -- two past
   * the kit-module count `a-screen-draws-no-geometry` allows.
   *
   * The head, the toolbar and the actions are drawn either way: a pending
   * read still knows what section it is, and withholding the title makes the
   * page jump when the rows land.
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
          // Room on all four edges for a ring the scrollport would otherwise
          // clip, and the horizontal pair cancelled by a negative margin so
          // the body still lines up with the head and the toolbar above it.
          // Anything sticking to this box takes `--sticky-top`, which the
          // body declares below.
          fills && [
            'min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]',
            'py-(--section-ring-room) px-(--section-ring-room) -mx-(--section-ring-room)',
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
