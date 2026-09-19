import { GitCommitHorizontal } from 'lucide-react'
import { useMemo } from 'react'

import type { Case } from '@/api/model'
import { DetailGrid, Fact } from '@/components/blocks/detail-grid'
import { EmptyState } from '@/components/blocks/empty-state'
import { SeverityBadge, TONE_FILL, TONE_STRIPE } from '@/components/blocks/severity-badge'
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
  laneOf,
  runsCrossing,
  runsSpanning,
  silenceHeight,
  spans,
  type CascadeMetric,
  type CascadeRun,
} from './cascade-rows'

/**
 * The case drawn against its own clock: what was observed on one side, what
 * the SOC did on the other, and the quiet stretches between them to scale.
 *
 * The list already carries the sequence. What this adds is **distance** - a
 * two-day silence is a band with a height, so the shape of the intrusion is
 * readable without reading a single row.
 */
export interface TimelineGraphScreenProps {
  kase: Case | undefined
  /**
   * Opens the Timeline, which is where an empty graph is filled from.
   *
   * This screen holds no navigation of its own, so without one the offer is
   * drawn refused rather than drawn and inert.
   */
  onOpenTimeline?: (() => void) | undefined
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: a read that has not returned is not
   * an answer, and an ungated pending state draws another case's cascade entirely.
   */
  busy?: boolean
  /** Why the read failed, if it did. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/**
 * Observed left, the clock down the middle, response right.
 *
 * The centre column is a fixed width, so the spine painted at 50% of the list
 * lands on it whatever the cards do either side.
 */
const LANE = 'grid grid-cols-[1fr_5.5rem_1fr] items-start gap-x-3'

/**
 * The spine, as a gradient on the list rather than a border per row.
 *
 * Drawn inside each row's centre cell it breaks into stubs wherever a row
 * carries a margin -- and the margins are the elapsed time, so it breaks
 * exactly where the drawing makes its claim.
 */
const SPINE =
  'linear-gradient(to right, transparent calc(50% - 0.5px), var(--border) calc(50% - 0.5px),' +
  ' var(--border) calc(50% + 0.5px), transparent calc(50% + 0.5px))'

/**
 * Where a moment's stamp sits inside its row, in pixels from the row's top.
 *
 * The connector is drawn at this height, so a track meeting the stamp has to
 * stop here or run under the clock it is pointing at.
 */
const STAMP_CENTRE = 13

const LANE_GAP = 6

/** What a piece of track is: which run, and the box it paints in its row. */
interface SpanPiece {
  run: CascadeRun
  box: { top: number; bottom?: number; height?: number }
}

/** Where a run's track sits, as a `left` for a bar centred by a half-translate. */
function laneLeft(run: CascadeRun, lanes: { lane: Map<string, number>; count: number }): string {
  const index = lanes.lane.get(`${run.key}@${String(run.start)}`) ?? 0
  return `calc(50% + ${String((index - (lanes.count - 1) / 2) * LANE_GAP)}px)`
}

/**
 * The track a run paints across a row it is still running through.
 *
 * **Drawn on every kind of row, not only on moments.** A day heading and a
 * stage rule both fall between two moments, so a run crossing midnight had its
 * track stop above the heading and restart below it - a break at the one place
 * the drawing is asserting that nothing was interrupted.
 */
function SpanTrack({
  pieces,
  lanes,
}: {
  pieces: readonly SpanPiece[]
  lanes: { lane: Map<string, number>; count: number }
}) {
  return (
    <>
      {pieces.map((piece) => (
        <span
          key={`${piece.run.key}@${String(piece.run.start)}`}
          aria-hidden
          data-part="cascade-span"
          data-severity={piece.run.tone}
          className={cn(
            'absolute w-1 -translate-x-1/2 rounded-full',
            piece.run.track === 'response' ? 'bg-action-contain' : TONE_FILL[piece.run.tone],
          )}
          style={{ left: laneLeft(piece.run, lanes), opacity: 0.55, ...piece.box }}
        />
      ))}
    </>
  )
}

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
  const lanes = useMemo(() => laneOf(runs), [runs])
  /** Full-height track for every run still going across a row that is not a moment. */
  const crossing = (at: number): SpanPiece[] =>
    runsCrossing(runs, at).map((run) => ({ run, box: { top: 0, bottom: 0 } }))
  const longest = Math.max(0, ...rows.map((row) => (row.kind === 'silence' ? row.span : 0)))
  const silences = rows.filter((row) => row.kind === 'silence').length
  const metrics = kase ? metricsOf(kase, silences) : []

  /**
   * The read is gated before the empty check, not inside it.
   *
   * A pending case is drawn from the fixture default, which has a cascade --
   * so an ungated screen draws the demo case's, and gating *after* the empty
   * check would answer a pending read with *"No timeline activity yet"*.
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
        <dl data-part="cascade-metrics" className="flex flex-wrap items-start gap-x-10 gap-y-3">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex max-w-56 flex-col gap-0.5">
              <dt className="text-xs uppercase tracking-micro text-ink-muted">{metric.label}</dt>
              <dd
                data-part={`metric-${metric.key}`}
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  metric.absent && 'text-base font-normal text-ink-muted',
                )}
              >
                {metric.value}
              </dd>
              <dd className="text-2xs text-ink-muted">{metric.caption}</dd>
            </div>
          ))}
        </dl>

        {/* Clipped to its own radius: the readout below is opaque and
            square-cornered, so without this it paints over the corners the
            border curves away from. `clip-path` rather than `overflow-hidden`
            because the readout is sticky, and a scrollport is what a sticky
            child positions against. -> #912 */}
        <div className="flex flex-col rounded-sm border border-border bg-surface [clip-path:inset(0_round_var(--radius-sm))]">
          {/* Opaque, because it is stuck over rows that scroll under it: a
              tinted bar lets the card beneath read through the readout. */}
          <p
            data-part="cascade-readout"
            // `-mx-px`: the metrics scroll under it at the column's border
            // box, and a readout the width of the card's padding box leaves a
            // 1px column uncovered on each side.
            className="sticky top-(--sticky-top) z-20 -mx-px border-b border-border bg-surface px-3 py-2 text-xs text-ink-muted"
          >
            {/* "runs", not "events": the fold is the whole reason this page
                fits on a screen, and counting the folded runs as the entries
                behind them contradicts what the Timeline shows for the same
                case. */}
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
              data-part="cascade-spine"
              aria-label="The case against its clock"
              className="relative"
              style={{ backgroundImage: SPINE }}
            >
              {rows.map((row) => {
                if (row.kind === 'day') {
                  return (
                    <li
                      key={row.key}
                      data-part="cascade-day"
                      className="relative flex items-center gap-3 py-4 text-2xs font-semibold uppercase tracking-micro text-ink-muted"
                    >
                      <SpanTrack pieces={crossing(row.at)} lanes={lanes} />
                      <span className="shrink-0 bg-surface pr-2">
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
                      data-part="cascade-milestone"
                      className="relative flex items-center gap-3 py-3 text-2xs text-action-contain"
                    >
                      <SpanTrack pieces={crossing(row.at)} lanes={lanes} />
                      <span
                        aria-hidden
                        className="h-0 flex-1 border-t border-dashed border-current"
                      />
                      <span className="shrink-0 bg-surface px-2 font-medium tabular-nums">
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
                  // is the claim. `bg-surface` is the mechanism, not decoration -
                  // the gradient runs behind every row, and only something
                  // opaque cuts it.
                  return (
                    <li key={row.key} className={LANE}>
                      <span />
                      <span
                        data-part="cascade-gap"
                        style={{ height: `${String(silenceHeight(row.span, longest))}px` }}
                        className="relative flex flex-col items-center justify-center bg-surface text-2xs tabular-nums text-ink-muted"
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
                // A moment that only ends things is a stamp: no card, and the
                // clock reads dimmer than one where something happened.
                const endOnly = row.runs.length === 0 && row.ends.length > 0
                const space = Math.round(row.spaceBefore)
                /**
                 * The three pieces of one track, laned together.
                 *
                 * **They are disjoint by construction** - a run spanning this
                 * moment neither starts nor ends at it - so one lane index
                 * across the three is what keeps two concurrent durations
                 * side by side instead of one hiding the other.
                 *
                 * **Each reaches into its own row's space above.** That space
                 * is the elapsed time, so a piece stopping at the row's own
                 * top edge breaks the track exactly where the drawing is
                 * making its claim.
                 */
                const pieces: SpanPiece[] = [
                  ...runsSpanning(runs, row.at).map((run) => ({
                    run,
                    box: { top: -space, bottom: 0 },
                  })),
                  ...row.runs.filter(spans).map((run) => ({
                    run,
                    box: { top: STAMP_CENTRE, bottom: 0 },
                  })),
                  ...row.ends.map((run) => ({
                    run,
                    box: { top: -space, height: space + STAMP_CENTRE },
                  })),
                ]
                return (
                  <li key={row.key} className={cn(LANE, 'relative')} style={{ marginTop: space }}>
                    {/* **Out of flow, so the track decorates and never
                        displaces.** In flow it pushed everything after it down
                        by its own duration, and an action at the same instant
                        as a long-running event was drawn at the far end of
                        that event's bar, reading as an hour later. */}
                    <SpanTrack pieces={pieces} lanes={lanes} />
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
                        a card is on -- across the whole cell it reads as two
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
                        data-part="cascade-stamp"
                        className={cn(
                          'relative z-10 rounded-sm bg-surface px-1.5 font-mono text-2xs tabular-nums',
                          endOnly ? 'text-ink-muted/70' : 'text-ink-muted',
                        )}
                      >
                        {clockOf(new Date(row.at).toISOString())}
                      </span>
                      {endOnly && (
                        // Said, because a bare second stamp under a card reads
                        // as another event with its description missing.
                        <span
                          data-part="cascade-ends"
                          className="relative z-10 mt-0.5 bg-surface px-1.5 text-2xs text-ink-muted/70"
                        >
                          {row.ends.length === 1 ? 'ends' : `${String(row.ends.length)} end`}
                        </span>
                      )}
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
 *
 * **The rail is on the outer edge and the two tracks mirror each other**, so a
 * response card reads outward from the spine exactly as an observed one does.
 * The rail is a strip of colour and the words beside it say the same thing, so
 * the card survives a greyscale print.
 *
 * **A real button, so the detail panel is a `Popover`.** Collision flipping,
 * Escape, click-away and focus return all come with the primitive; hand-placed
 * panels here opened off the pane's edge and were clipped by the frame.
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
        data-part="cascade-run"
        data-track={run.track}
        data-severity={run.tone}
        className={cn(
          'h-auto w-full shrink items-stretch justify-start gap-0 whitespace-normal',
          'rounded-md border-border bg-surface p-0 text-left font-normal',
          // Painted by the button, so the radius clips it. A child cannot be
          // clipped here: the clip would cut the button's own focus ring. -> #915
          response
            ? 'flex-row-reverse [--tone-stripe:var(--action-contain)] [background-image:linear-gradient(to_left,var(--tone-stripe)_0_4px,transparent_4px)]'
            : cn(
                TONE_STRIPE[run.tone],
                '[background-image:linear-gradient(to_right,var(--tone-stripe)_0_4px,transparent_4px)]',
              ),
        )}
      >
        <span aria-hidden className="w-1 shrink-0 self-stretch" />
        <span className="min-w-0 flex-1 px-2.5 py-1.5">
          {/* Clamped rather than wrapped without limit: at a narrow measure a
              long description becomes a tower and sets the rhythm for the
              page. The popover carries the whole of it, so nothing is hidden
              with no way to reach it. */}
          {/* `break-words`, because a hostname run like `WKS-FIN01/02/03` is
              one unbreakable token: the clamp cannot fold it and clips it
              mid-sentence instead, leaving a card that reads "Patient-zero
              hosts .../02/03 isolated". */}
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
 *
 * A stamp the case does not carry reads `not recorded` in the muted tier
 * rather than a zero: nobody having said is not the same answer as none.
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
      // A stamp nobody set is a figure like the rest rather than a sentence
      // beside the strip, and naming which ones are missing is what explains
      // the two `not recorded` figures above.
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
