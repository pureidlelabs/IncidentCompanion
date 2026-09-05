import { GitCommitHorizontal } from 'lucide-react'
import { useMemo } from 'react'

import type { Case } from '@/api/model'
import { DetailGrid, Fact } from '@/components/blocks/detail-grid'
import { EmptyState } from '@/components/blocks/empty-state'
import { SeverityBadge, TONE_FILL } from '@/components/blocks/severity-badge'
import { Section } from '@/components/blocks/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DialogTrigger } from '@/components/ui/dialog'
import { Popover } from '@/components/ui/popover'
import { clockOf, dayLabelOf, dayShortOf, durationText, msOf } from '@/lib/case-time'
import { cn } from '@/lib/cn'

import {
  buildCascade,
  CARD_MEASURE,
  cascadeRows,
  firstMoment,
  milestonesOf,
  MILESTONES,
  silenceHeight,
  type CascadeMetric,
  type CascadeRun,
} from './cascade-rows'

/**
 * The case drawn against its own clock: what was observed on one side, what
 * the SOC did on the other, and the quiet stretches between them to scale.
 */
export interface TimelineGraphScreenProps {
  kase: Case | undefined
  /**
   * Opens the Timeline, which is where an empty graph is filled from.
   */
  onOpenTimeline?: (() => void) | undefined
  /**
   * The case is still being read.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/**
 * Observed left, the clock down the middle, response right.
 */
const LANE = 'grid grid-cols-[1fr_5.5rem_1fr] items-start gap-x-3'

/**
 * The spine, as a gradient on the list rather than a border per row.
 */
const SPINE =
  'linear-gradient(to right, transparent calc(50% - 0.5px), var(--border) calc(50% - 0.5px),' +
  ' var(--border) calc(50% + 0.5px), transparent calc(50% + 0.5px))'

export function TimelineGraphScreen({
  kase,
  onOpenTimeline,
  busy = false,
  problem,
  onRetry,
}: TimelineGraphScreenProps) {
  const runs = useMemo(() => (kase ? buildCascade(kase) : []), [kase])
  const milestones = useMemo(() => (kase ? milestonesOf(kase) : []), [kase])
  const rows = useMemo(() => cascadeRows(runs, { milestones }), [runs, milestones])
  const longest = Math.max(0, ...rows.map((row) => (row.kind === 'silence' ? row.span : 0)))
  const silences = rows.filter((row) => row.kind === 'silence').length
  const metrics = kase ? metricsOf(kase, silences) : []

  /**
   * The read is gated before the empty check, not inside it.
   */
  if (busy || problem !== undefined) {
    return (
      <Section
        title="Timeline graph"
        read={{
          isPending: busy,
          isError: problem !== undefined,
          error: problem,
          ...(onRetry ? { refetch: onRetry } : {}),
        }}
      >
        <></>
      </Section>
    )
  }

  if (runs.length === 0) {
    return (
      <Section title="Timeline graph">
        <EmptyState
          icon={GitCommitHorizontal}
          title="No timeline activity yet"
          detail="Add events or activities from the Timeline to build the graphical view."
          action={
            <Button
              variant="outline"
              isDisabled={!onOpenTimeline}
              {...(onOpenTimeline ? { onPress: onOpenTimeline } : {})}
            >
              Open the Timeline
            </Button>
          }
        />
      </Section>
    )
  }

  return (
    <Section title="Timeline graph" fills>
      {/* One scroller, and it is the section's own: the metrics scroll away
          with the cascade rather than being squeezed against a frame below
          them. */}
      <div className="flex shrink-0 flex-col gap-4">
        <dl data-slot="cascade-metrics" className="flex flex-wrap items-start gap-x-10 gap-y-3">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex max-w-56 flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-micro text-ink-muted">{metric.label}</dt>
              <dd
                data-slot={`metric-${metric.key}`}
                className={cn(
                  'text-3xl font-semibold tabular-nums',
                  metric.absent && 'text-base font-normal text-ink-muted',
                )}
              >
                {metric.value}
              </dd>
              <dd className="text-2xs text-ink-muted">{metric.caption}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col rounded-sm border border-border bg-card">
          {/* Opaque, because it is stuck over rows that scroll under it: a
              tinted bar let the card beneath read through the readout. */}
          <p
            data-slot="cascade-readout"
            className="sticky top-(--sticky-top) z-20 border-b border-border bg-card px-3 py-2 text-xs text-ink-muted"
          >
            {/* "runs", not "events": the fold is the whole reason this page
                fits on a screen, and calling 21 folded runs "88 events"
                contradicts what the Timeline shows for the same case. */}
            {`${String(runs.length)} ${runs.length === 1 ? 'run' : 'runs'} over ${String(silences)} ${silences === 1 ? 'silence' : 'silences'}`}
          </p>

          <div className="px-4 pb-6 pt-3">
            {/* The heads sit above the spine's top, so they need no mask. */}
            <div className={cn(LANE, 'pb-3')}>
              <span className="text-right text-2xs uppercase tracking-micro text-ink-muted">
                Observed
              </span>
              <span />
              <span className="text-2xs uppercase tracking-micro text-ink-muted">Response</span>
            </div>

            <ol
              data-slot="cascade-spine"
              aria-label="The case against its clock"
              className="relative"
              style={{ backgroundImage: SPINE }}
            >
              {rows.map((row) => {
                if (row.kind === 'day') {
                  return (
                    <li
                      key={row.key}
                      data-slot="cascade-day"
                      className="flex items-center gap-3 py-4 text-2xs font-semibold uppercase tracking-micro text-ink-muted"
                    >
                      <span className="shrink-0 bg-card pr-2">
                        {dayLabelOf(new Date(row.at).toISOString())}
                      </span>
                      <span
                        aria-hidden
                        className="h-0 flex-1 border-t border-dashed border-border"
                      />
                    </li>
                  )
                }
                if (row.kind === 'milestone') {
                  return (
                    <li
                      key={row.key}
                      data-slot="cascade-milestone"
                      className="flex items-center gap-3 py-3 text-2xs text-action-contain"
                    >
                      <span
                        aria-hidden
                        className="h-0 flex-1 border-t border-dashed border-current"
                      />
                      <span className="shrink-0 bg-card px-2 font-medium tabular-nums">
                        {`${row.label} \u00b7 ${dayShortOf(new Date(row.at).toISOString())} ${clockOf(new Date(row.at).toISOString())}`}
                      </span>
                      <span
                        aria-hidden
                        className="h-0 flex-1 border-t border-dashed border-current"
                      />
                    </li>
                  )
                }
                if (row.kind === 'silence') {
                  // A silence breaks the spine rather than tinting beside it:
                  // the spine is what is continuous, so an interruption in it
                  // is the claim. `bg-card` is the mechanism, not decoration -
                  // the gradient runs behind every row, and only something
                  // opaque cuts it.
                  return (
                    <li key={row.key} className={LANE}>
                      <span />
                      <span
                        data-slot="cascade-gap"
                        style={{ height: `${String(silenceHeight(row.span, longest))}px` }}
                        className="relative flex flex-col items-center justify-center bg-card text-2xs tabular-nums text-ink-muted"
                      >
                        <span
                          aria-hidden
                          className="absolute inset-x-0 top-0 border-t border-dashed border-border"
                        />
                        {`${durationText(row.span)} quiet`}
                        <span
                          aria-hidden
                          className="absolute inset-x-0 bottom-0 border-t border-dashed border-border"
                        />
                      </span>
                      <span />
                    </li>
                  )
                }
                const observed = row.runs.filter((run) => run.track === 'observed')
                const response = row.runs.filter((run) => run.track === 'response')
                return (
                  <li
                    key={row.key}
                    className={LANE}
                    style={{ marginTop: Math.round(row.spaceBefore) }}
                  >
                    <span className="flex flex-col items-end gap-1.5">
                      {observed.map((run) => (
                        <span
                          key={run.key + String(run.start)}
                          className={cn('block', CARD_MEASURE)}
                        >
                          <RunCard run={run} />
                        </span>
                      ))}
                    </span>
                    {/* The stamp sits on the spine, because the spine is the
                        time axis, and the connector is drawn only on the side
                        a card is on - across the whole cell it read as two
                        stubs floating either side of the clock. */}
                    <span className="relative flex flex-col items-center self-stretch pt-1">
                      <span
                        aria-hidden
                        className={cn(
                          'absolute top-[13px] h-px bg-border',
                          observed.length > 0 ? 'left-0' : 'left-1/2',
                          response.length > 0 ? 'right-0' : 'right-1/2',
                        )}
                      />
                      <span
                        data-slot="cascade-stamp"
                        className="relative z-10 rounded bg-card px-1.5 font-mono text-2xs tabular-nums text-ink-muted"
                      >
                        {clockOf(new Date(row.at).toISOString())}
                      </span>
                    </span>
                    <span className="flex flex-col items-start gap-1.5">
                      {response.map((run) => (
                        <span
                          key={run.key + String(run.start)}
                          className={cn('block', CARD_MEASURE)}
                        >
                          <RunCard run={run} />
                        </span>
                      ))}
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </Section>
  )
}

/**
 * One run as a card, railed in its own tone.
 */
function RunCard({ run }: { run: CascadeRun }) {
  const response = run.track === 'response'
  const meta = [
    run.count > 1
      ? `${String(run.count)}\u00d7 to ${clockOf(new Date(run.end).toISOString())}`
      : '',
    run.phase,
  ]
    .filter(Boolean)
    .join(' \u00b7 ')

  return (
    <DialogTrigger>
      <Button
        variant="ghost"
        data-slot="cascade-run"
        data-track={run.track}
        data-severity={run.tone}
        className={cn(
          'h-auto w-full shrink items-stretch justify-start gap-0 whitespace-normal',
          'rounded-md border-border bg-card p-0 text-left font-normal',
          response && 'flex-row-reverse',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'w-1 shrink-0 self-stretch',
            response ? 'bg-action-contain' : TONE_FILL[run.tone],
          )}
        />
        <span className="min-w-0 flex-1 px-2.5 py-1.5">
          {/* Clamped rather than wrapped without limit: at a narrow measure
              one 125-character description became a seven-line tower and set
              the rhythm for the page. The popover carries the whole of it, so
              nothing is hidden with no way to reach it. */}
          {/* `break-words`, because a hostname run like `WKS-FIN01/02/03` is
              one unbreakable token: the clamp could not fold it and clipped
              it mid-sentence instead, so the card read "Patient-zero hosts
              .../02/03 isolated". */}
          <span className={cn('line-clamp-3 break-words text-xs', response && 'text-right')}>
            {run.label}
          </span>
          {meta !== '' && (
            <span className={cn('mt-0.5 block text-2xs text-ink-muted', response && 'text-right')}>
              {meta}
            </span>
          )}
        </span>
      </Button>

      <Popover placement="bottom" className="w-80 p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-medium">{run.label}</p>
          {response ? (
            <Badge variant="outlined">Response</Badge>
          ) : (
            <SeverityBadge severity={run.severity} />
          )}
        </div>
        <DetailGrid>
          <Fact label="When">
            {run.count > 1
              ? `${dayShortOf(new Date(run.start).toISOString())} ${clockOf(new Date(run.start).toISOString())} \u2013 ${clockOf(new Date(run.end).toISOString())}`
              : `${dayShortOf(new Date(run.start).toISOString())} ${clockOf(new Date(run.start).toISOString())}`}
          </Fact>
          {run.count > 1 && <Fact label="Occurrences">{String(run.count)}</Fact>}
          {run.phase !== '' && <Fact label="Kill chain">{run.phase}</Fact>}
        </DetailGrid>
      </Popover>
    </DialogTrigger>
  )
}

/**
 * The figures a leadership reader asks for first.
 */
function metricsOf(kase: Case, silences: number): CascadeMetric[] {
  const first = firstMoment(kase.timeline)
  const detected = msOf(kase.detectedAt)
  const contained = msOf(kase.containedAt)

  const dwell = first !== null && detected !== null && detected > first ? detected - first : null
  const toContain =
    detected !== null && contained !== null && contained > detected ? contained - detected : null
  const missing = MILESTONES.filter((one) => msOf(kase[one.field] as string | null) === null)
  const stamped = MILESTONES.length - missing.length

  return [
    {
      key: 'dwell',
      label: 'Dwell time',
      value: dwell === null ? 'not recorded' : durationText(dwell),
      caption: 'first activity to detection',
      absent: dwell === null,
    },
    {
      key: 'contain',
      label: 'Time to contain',
      value: toContain === null ? 'not recorded' : durationText(toContain),
      caption: 'detection to containment',
      absent: toContain === null,
    },
    {
      key: 'silences',
      label: 'Silences',
      value: String(silences),
      caption: 'over an hour',
      absent: false,
    },
    {
      // The stray sentence this replaces sat outside the strip and wrapped
      // beside it. A stamp nobody set is a figure like the rest, and naming
      // which ones are missing is what the two `not recorded` figures above
      // are explained by.
      key: 'stamps',
      label: 'Stage stamps',
      value: `${String(stamped)} of ${String(MILESTONES.length)}`,
      caption:
        missing.length === 0
          ? 'all four recorded'
          : `${missing.map((one) => one.label.toLowerCase()).join(', ')} not recorded`,
      absent: stamped === 0,
    },
  ]
}
