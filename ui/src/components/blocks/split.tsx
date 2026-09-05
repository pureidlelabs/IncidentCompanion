import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { COLUMNS, type SplitMeasure } from './split.measures'

/**
 * A head cell, drawn once per pane in the grid's first row.
 */
const HEAD_BAND = 'flex min-h-11 min-w-0 items-center border-b border-border py-2'

/**
 * A list beside what is open from it, each scrolling on its own.
 */
export function Split({
  list,
  listHead,
  listFooter,
  detail,
  detailHead,
  placeholder,
  measure = 'default',
  className,
}: {
  /**
   * The rows. Scrolls inside the list pane.
   */
  list: ReactNode
  /** Above the rows, outside their scroller: a search box, a count. */
  listHead?: ReactNode | undefined
  /** Below the rows, inside the list pane: a pager, an Add row. */
  listFooter?: ReactNode | undefined
  /** What is open. Absent draws `placeholder`. */
  detail?: ReactNode | undefined
  /** Above the detail, outside its scroller: the open item's own title row. */
  detailHead?: ReactNode | undefined
  /** Drawn in the detail pane while nothing is open. */
  placeholder?: ReactNode | undefined
  /** How wide the list pane runs. */
  measure?: SplitMeasure
  /** Utilities for where the split sits. */
  className?: string | undefined
}) {
  /**
   * One head means two cells, and no head means no row.
   */
  const heads = listHead !== undefined || detailHead !== undefined

  return (
    <div
      data-slot="split"
      className={cn(
        'grid min-h-0 min-w-0 flex-1',
        COLUMNS[measure],
        // `minmax(0, 1fr)` and not `1fr`, and the two are not equivalent here.
        // `1fr` is `minmax(auto, 1fr)`, whose floor is the cell's content
        // unless the cell itself says otherwise - so it survives only while
        // both panes below keep their `min-h-0`. Measured in Chromium on
        // `One entry open`, dropping `min-h-0`: `1fr` takes the list pane from
        // 797px to 4008px and its scroller never engages, `minmax(0, 1fr)`
        // leaves it at 797px. The floor belongs on the track, where one
        // declaration covers both cells.
        heads ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]',
        className,
      )}
    >
      {heads && (
        <>
          <div data-slot="split-list-head" className={cn(HEAD_BAND, 'border-r px-3')}>
            {listHead}
          </div>
          <div data-slot="split-detail-head" className={cn(HEAD_BAND, 'px-5')}>
            {detailHead}
          </div>
        </>
      )}

      <div
        data-slot="split-list"
        className="flex min-h-0 min-w-0 flex-col border-r border-border"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 [scrollbar-gutter:stable]">
          {list}
        </div>
        {listFooter !== undefined && (
          <div className="shrink-0 border-t border-border px-3 py-2">{listFooter}</div>
        )}
      </div>

      <div data-slot="split-detail" className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
          {detail ?? placeholder}
        </div>
      </div>
    </div>
  )
}
