import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Case, TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import {
  cascadeRows,
  laneOf,
  runsCrossing,
  runsSpanning,
  type CascadeRun,
} from './cascade-rows'
import { TimelineGraphScreen } from './timeline-graph'

/**
 * **A run covers a stretch of time, and the drawing has to say which one.**
 *
 * Forty beacon check-ins folded into one card is the whole reason the page
 * fits on a screen, and it costs the drawing the one thing it exists to show:
 * where that stretch begins and where it ends. Stated only in the card's own
 * second line, the end makes no claim about position, so the spine below the
 * card belongs to nothing and the silence after it is measured from a time
 * the drawing never printed.
 *
 * Every assertion here is written against the drawing that states the end and
 * places nothing: it looks complete, and a reader following the spine down
 * from 12:36 reaches 13:26 having passed no mark for the 13:15 the card
 * claimed. What none of it can see is whether the track *reads* - jsdom gives
 * every element a zero box, so the caps, the lanes and the tint are `0px`
 * here. Those are the story tier's.
 */

const MINUTE = 60_000

const run = (over: Partial<CascadeRun>): CascadeRun => ({
  key: 'observed:beacon',
  label: 'beacon check-in',
  track: 'observed',
  tone: 'high',
  start: Date.parse('2026-08-13T12:36:00.000Z'),
  end: Date.parse('2026-08-13T12:36:00.000Z'),
  count: 1,
  phase: '',
  entryId: 'e-1',
  severity: 'high',
  ...over,
})

/** A run of `count` check-ins from `12:36` lasting `minutes`. */
const burst = (minutes: number, over: Partial<CascadeRun> = {}): CascadeRun =>
  run({
    end: Date.parse('2026-08-13T12:36:00.000Z') + minutes * MINUTE,
    count: 40,
    ...over,
  })

const moments = (rows: ReturnType<typeof cascadeRows>) =>
  rows.filter((row) => row.kind === 'moment')

describe('a run that covers a stretch of time', () => {
  it('puts its end on the spine as a moment of its own', () => {
    // Stated only on the card, the end is a claim the axis does not carry: the
    // spine runs from 12:36 straight to whatever came next, and a reader
    // following it passes no mark for 13:15 at all.
    const rows = cascadeRows([burst(39)])
    const ends = moments(rows).filter((row) => row.ends.length > 0)

    expect(ends).toHaveLength(1)
    expect(ends[0]?.at).toBe(Date.parse('2026-08-13T13:15:00.000Z'))
  })

  it('draws no second card at that end', () => {
    // The card belongs to the moment the thing started. A second one at the
    // end is one run read as two events.
    const rows = cascadeRows([burst(39)])
    const ends = moments(rows).filter((row) => row.ends.length > 0)

    expect(ends[0]?.runs).toEqual([])
  })

  it('spaces that end by how long the run took', () => {
    // **The one place a run's duration is drawn at all.** Zeroed, four hours of
    // beaconing take no lane while the half hour after them takes 42px, so a
    // four-hour run and a two-minute one are the same picture - and the silence
    // band that used to state those four hours is gone, correctly, because the
    // case was not quiet.
    const brief = moments(cascadeRows([burst(2)])).filter((row) => row.ends.length > 0)
    const long = moments(cascadeRows([burst(240)])).filter((row) => row.ends.length > 0)

    expect(brief[0]?.spaceBefore ?? 0).toBeGreaterThan(0)
    expect(long[0]?.spaceBefore ?? 0).toBeGreaterThan(brief[0]?.spaceBefore ?? 0)
  })

  it('is not a silence, however long it ran', () => {
    // With the end drawn as its own moment, the hour between a run's two
    // stamps is a gap wide enough to qualify - so a burst that ran for three
    // hours is labelled quiet while it is the thing that was happening.
    const rows = cascadeRows([burst(180)])

    expect(rows.filter((row) => row.kind === 'silence')).toEqual([])
  })

  it('still lets a real silence after it be drawn', () => {
    // The guard above must refuse the run's own stretch and nothing else: one
    // that swallowed the quiet after the run as well would leave the page with
    // no silences at all, which is the state it cannot be told apart from.
    const later = run({
      key: 'observed:mimikatz',
      label: 'LSASS dumped',
      start: Date.parse('2026-08-13T18:00:00.000Z'),
      end: Date.parse('2026-08-13T18:00:00.000Z'),
      entryId: 'e-2',
    })
    const rows = cascadeRows([burst(39), later])

    expect(rows.filter((row) => row.kind === 'silence')).toHaveLength(1)
  })

  it('does not count a run shorter than the axis can print', () => {
    // The stamps read HH:MM. A run beginning and ending inside one minute has
    // one place on this axis, and a second stamp for it prints the same clock
    // twice under a label saying it ended.
    const rows = cascadeRows([run({ end: Date.parse('2026-08-13T12:36:30.000Z') })])

    expect(moments(rows).filter((row) => row.ends.length > 0)).toEqual([])
  })
})

describe("the track between a run's two stamps", () => {
  it('holds a run that is still going at a moment between them', () => {
    const beacon = burst(39)

    expect(runsSpanning([beacon], Date.parse('2026-08-13T12:50:00.000Z'))).toEqual([beacon])
  })

  it('holds neither of its own end rows', () => {
    // Painted on the start row the track puts a nub above the start time;
    // painted on the end row it runs a tail under the end marker. Both rows
    // draw their own piece, from their stamp outward.
    const beacon = burst(39)

    expect(runsSpanning([beacon], Date.parse('2026-08-13T12:36:00.000Z'))).toEqual([])
    expect(runsSpanning([beacon], Date.parse('2026-08-13T13:15:00.000Z'))).toEqual([])
  })

  it('reports every run still going, not the first', () => {
    // Made plural so two concurrent durations each get a lane. A caller taking
    // the first throws that away again and draws one track in one tone for
    // two different things.
    const beacon = burst(39)
    const exfil = burst(39, { key: 'observed:exfil', tone: 'critical', entryId: 'e-3' })

    expect(runsSpanning([beacon, exfil], Date.parse('2026-08-13T12:50:00.000Z'))).toHaveLength(2)
  })
})

const draw = (kase: Case) => render(<TimelineGraphScreen kase={kase} />)

const event = (over: Partial<TimelineEntry>): TimelineEntry =>
  ({
    kind: 'event',
    id: `e-${over.time ?? ''}`,
    time: '2026-08-13T12:36:00.000Z',
    description: 'beacon check-in to C2',
    severity: 'high',
    ukcPhase: '',
    ...over,
  }) as TimelineEntry

/** One folded run: four check-ins of one kind, 12:36 through 13:15. */
const beaconCase = (): Case => ({
  ...campaignCase,
  timeline: ['12:36', '12:50', '13:02', '13:15'].map((clock) =>
    event({ id: `e-${clock}`, time: `2026-08-13T${clock}:00.000Z` }),
  ),
  detectedAt: null,
  containedAt: null,
  eradicatedAt: null,
  recoveredAt: null,
})

describe('the drawing of a run that lasted', () => {
  it('prints its end time on the spine', () => {
    draw(beaconCase())
    const stamps = [...document.querySelectorAll('[data-part="cascade-stamp"]')].map(
      (one) => one.textContent,
    )

    expect(stamps).toContain('13:15')
  })

  it('says that moment is an ending rather than a thing that happened', () => {
    // A bare second stamp under a card reads as another event with its
    // description missing.
    draw(beaconCase())

    expect(document.querySelector('[data-part="cascade-ends"]')?.textContent).toBe('ends')
  })

  it("paints the run's own tone down the track, never the spine's grey", () => {
    // The regression this is written against: the fold survived the rewrite
    // and the duration it folds did not, so forty beacons over thirty-nine
    // minutes draw exactly what one instant draws.
    draw(beaconCase())
    const track = [...document.querySelectorAll('[data-part="cascade-span"]')]

    expect(track.length).toBeGreaterThan(0)
    expect(track.every((one) => one.className.includes('severity-high'))).toBe(true)
  })

  it('draws one card for the run and no card at its end', () => {
    draw(beaconCase())

    expect(document.querySelectorAll('[data-part="cascade-run"]')).toHaveLength(1)
  })
})

describe('the track across a row that is not a moment', () => {
  it('carries a run over the day heading it crosses', () => {
    // A day rule falls between two moments, so a beacon run crossing midnight
    // had its track stop above the heading and restart below it - a break at
    // the one place the drawing asserts nothing was interrupted.
    const overnight = run({
      start: Date.parse('2026-08-13T23:30:00.000Z'),
      end: Date.parse('2026-08-14T00:30:00.000Z'),
      count: 12,
    })
    const rows = cascadeRows([overnight])
    const day = rows.find((row) => row.kind === 'day' && row.at > overnight.start)

    expect(day?.kind, 'the run does not cross a day boundary').toBe('day')
    const at = day?.kind === 'day' ? day.at : 0
    expect(runsCrossing([overnight], at)).toEqual([overnight])
  })

  it('gives one run the same lane wherever it is drawn', () => {
    // The offset came from the run's position in a row's array, so a run alone
    // on its start row and paired on the next drew centred, then 3px left, then
    // centred again: one continuous duration with a kink at every neighbour.
    const long = burst(120, { key: 'observed:beacon', entryId: 'e-a' })
    const brief = run({
      key: 'observed:exfil',
      start: Date.parse('2026-08-13T13:00:00.000Z'),
      end: Date.parse('2026-08-13T13:30:00.000Z'),
      entryId: 'e-b',
    })
    draw(beaconCase())

    // Held on the layout rather than the paint: jsdom gives every bar a zero
    // box, so the lane is only readable as the assignment behind it.
    const lanes = laneOf([long, brief])
    expect(lanes.count).toBe(2)
    expect(lanes.lane.get(`${long.key}@${String(long.start)}`)).toBe(0)
    expect(lanes.lane.get(`${brief.key}@${String(brief.start)}`)).toBe(1)
  })

  it('reuses a lane once the run holding it has ended', () => {
    // Twenty sequential bursts must not spread twenty lanes wide.
    const first = burst(30, { entryId: 'e-1' })
    const later = run({
      key: 'observed:second',
      start: Date.parse('2026-08-13T15:00:00.000Z'),
      end: Date.parse('2026-08-13T15:30:00.000Z'),
      entryId: 'e-2',
    })

    expect(laneOf([first, later]).count).toBe(1)
  })
})
