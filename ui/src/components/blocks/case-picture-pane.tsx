import { useMemo } from 'react'

import type { ComplianceRecord } from '@/api/compliance'
import type { Case } from '@/api/model'
import type { Specs } from '@/api/specs'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

import {
  buildQueue,
  clocksOf,
  COST_COMPLETENESS,
  COST_PRECONDITION,
  COST_REPORT,
  COST_STATUTORY,
  type QueueRow,
} from './case-queue'

/**
 * Where the case stands: the clocks that are running, and what is outstanding
 * on it in the order it costs to leave.
 *
 * **Not a dashboard.** Every row is a job with a door on it; a number nobody
 * can act on is noise however well it is drawn, so nothing here is drawn that
 * does not lead somewhere.
 *
 * **Where a door leads is the caller's, and this pane has none of its own.**
 * Every answer is on another section - Evidence, the timeline, the case's own
 * record - so `onOpen` is what carries the analyst there. Given none, a door
 * draws disabled and names the section that answers it, because a control that
 * cannot go anywhere and looks as though it can is the more expensive of the
 * two mistakes.
 */
export interface CasePicturePaneProps {
  kase: Case | undefined
  specs: Specs | undefined
  record: ComplianceRecord | undefined
  /** Opens the section a queue row is answered on. Without it the doors are
   *  drawn disabled. */
  onOpen?: ((row: QueueRow) => void) | undefined
  /**
   * The moment the clocks are read at, in epoch milliseconds.
   *
   * Passed in rather than taken from the machine, so a story shows the same
   * reading in a year's time as it does today.
   */
  now?: number
}

/**
 * The mark each cost wears. Rank is carried by the queue's order, so the mark
 * survives a greyscale print without being the sole carrier.
 */
const COST_MARK: Readonly<Record<number, string>> = {
  [COST_PRECONDITION]: 'bg-ink',
  [COST_STATUTORY]: 'bg-severity-critical',
  [COST_REPORT]: 'bg-severity-medium',
  [COST_COMPLETENESS]: 'bg-severity-info',
}

export function CasePicturePane({
  kase,
  specs,
  record,
  onOpen,
  now = Date.parse('2026-08-19T09:00:00.000Z'),
}: CasePicturePaneProps) {
  const clocks = useMemo(() => clocksOf(record, now), [record, now])
  const queue = useMemo(() => (kase && specs ? buildQueue(kase, specs) : []), [kase, specs])

  return (
    <div data-slot="case-picture" className="flex flex-col gap-6">
      <ul
        aria-label="Statutory clocks"
        className="flex flex-wrap gap-x-10 gap-y-3 border-b border-border pb-4"
      >
        {clocks.map((clock) => (
          <li
            key={clock.regime}
            data-slot="clock"
            data-danger={clock.danger ? 'true' : undefined}
            className="flex flex-col gap-0.5"
          >
            <span className="text-micro uppercase tracking-micro text-ink-muted">
              {clock.regime}
            </span>
            <span
              className={cn(
                'font-mono text-lg tabular-nums',
                clock.danger && 'text-destructive',
              )}
            >
              {clock.value}
            </span>
            <span className="text-xs text-ink-muted">{clock.detail}</span>
          </li>
        ))}
      </ul>

      <section aria-label="Open items" className="flex flex-col gap-1">
        <h2 className="text-micro uppercase tracking-micro text-ink-muted">Open items</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing outstanding that this screen can see.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {queue.map((row) => (
              <QueueItem key={row.id} row={row} {...(onOpen ? { onOpen } : {})} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function QueueItem({ row, onOpen }: { row: QueueRow; onOpen?: (row: QueueRow) => void }) {
  return (
    <li
      data-slot="queue-row"
      data-cost={row.cost}
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2"
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', COST_MARK[row.cost] ?? 'bg-border')}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{row.label}</span>
        <span className="truncate text-xs text-ink-muted">{row.sub}</span>
      </span>
      <Button
        variant="outline"
        size="sm"
        isDisabled={!onOpen}
        {...(onOpen
          ? {
              onPress: () => {
                onOpen(row)
              },
            }
          : // A disabled control owes the reason: the section named here is
            // where the job is answered.
            { 'aria-label': `${row.action} \u2014 answered on ${row.section}` })}
      >
        {row.action}
      </Button>
    </li>
  )
}
