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
   */
  now?: number
}

/** The left edge each cost wears, so the rank survives a greyscale print. */
const COST_EDGE: Readonly<Record<number, string>> = {
  [COST_PRECONDITION]: 'border-l-foreground',
  [COST_STATUTORY]: 'border-l-severity-critical',
  [COST_REPORT]: 'border-l-severity-medium',
  [COST_COMPLETENESS]: 'border-l-severity-info',
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
      <ul aria-label="Statutory clocks" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {clocks.map((clock) => (
          <li
            key={clock.regime}
            data-slot="clock"
            data-danger={clock.danger ? 'true' : undefined}
            className={cn(
              'flex flex-col gap-0.5 rounded-sm border border-border border-l-2 px-3 py-2.5',
              clock.danger ? 'border-l-destructive' : 'border-l-border',
            )}
          >
            <span className="font-mono text-micro uppercase tracking-micro text-ink-muted">
              {clock.regime}
            </span>
            <span className="font-mono text-xl tabular-nums">{clock.value}</span>
            <span className="text-xs text-ink-muted">{clock.detail}</span>
          </li>
        ))}
      </ul>

      <section aria-label="Open items" className="flex flex-col gap-2">
        <h2 className="text-micro uppercase tracking-micro text-ink-muted">Open items</h2>
        {queue.length === 0 ? (
          <p className="px-1 text-sm text-ink-muted">
            Nothing outstanding that this screen can see.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {queue.map((row) => (
              <QueueItem key={row.id} row={row} {...(onOpen ? { onOpen } : {})} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** One outstanding job, with the door that answers it. */
function QueueItem({ row, onOpen }: { row: QueueRow; onOpen?: (row: QueueRow) => void }) {
  return (
    <li
      data-slot="queue-row"
      data-cost={row.cost}
      className={cn(
        'grid grid-cols-[1fr_auto] items-center gap-3 rounded-sm border border-border border-l-2 px-3 py-2',
        COST_EDGE[row.cost] ?? 'border-l-border',
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm">{row.label}</span>
        <span className="truncate font-mono text-xs text-ink-muted">{row.sub}</span>
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
