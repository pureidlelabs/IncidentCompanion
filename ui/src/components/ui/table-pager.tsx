import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Previous/Next pager for a cursor-ordered table.
 *
 * - No page numbers: the callers page by cursor, so the page count is unknown
 *   without counting the table.
 * - The row count is `aria-live="polite"`, so a page change announces itself.
 * - `busy` disables both buttons without changing `hasPrevious`/`hasNext`.
 */
export function TablePager({
  pageNumber,
  firstRow,
  showing,
  total,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  busy = false,
}: {
  /** 1-based. */
  pageNumber: number
  /**
   * Where this page starts in the whole list, 1-based.
   *
   * Told rather than derived: the last page is shorter than the others, so
   * `pageNumber` and `showing` together cannot say where the page begins.
   */
  firstRow: number
  /** Rows this page draws, after any local filtering. */
  showing: number
  /** Rows in the whole table, where that is known. */
  total?: number | undefined
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
  /** Disables both buttons. */
  busy?: boolean | undefined
}) {
  return (
    <div
      data-slot="table-pager"
      className="flex items-center justify-between gap-4 border-t border-border pt-3"
    >
      <p className="text-sm text-ink-muted" aria-live="polite">
        Page {pageNumber}
        {showing === 0 ? (
          ' \u00b7 no rows'
        ) : (
          <>
            {' \u00b7 '}
            {firstRow}&ndash;{firstRow + showing - 1}
            {total !== undefined && ` of ${String(total)}`}
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onPress={onPrevious}
          isDisabled={!hasPrevious || busy}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button variant="outline" size="sm" onPress={onNext} isDisabled={!hasNext || busy}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
