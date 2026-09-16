/**
 * The two dimensions an open item narrows the timeline by: the expected field
 * an entry is missing, and the import flag nobody has cleared. -> #822
 *
 * The attack is a dimension the list honours and the bar cannot see: an
 * analyst arriving from the overview on three of eighty-eight entries, with no
 * control saying why and nothing to press to get the rest back.
 */
import { describe, expect, it } from 'vitest'

import type { TimelineEntry } from '@/api/model'
import { specsFixture } from '@/fixtures/specs'
import { campaignCase } from '@/fixtures/campaign'

import {
  activeCount,
  applyTimelineFilter,
  isTimelineFiltered,
  matchesTimeline,
  NO_TIMELINE_FILTER,
} from './timeline-entries'

const TIERING = specsFixture.tiering
const [FIRST] = campaignCase.timeline
if (FIRST === undefined) throw new Error('the fixture has no entry')

describe('the missing-field dimension', () => {
  it('keeps the entries the gap row counted and no others', () => {
    const kept = applyTimelineFilter(
      campaignCase.timeline,
      { ...NO_TIMELINE_FILTER, missing: 'severity' },
      TIERING,
    )
    expect(kept.length).toBeGreaterThan(0)
    expect(kept.length).toBeLessThan(campaignCase.timeline.length)
    expect(kept.every((entry) => !(entry as { severity?: string | null }).severity)).toBe(true)
  })

  /**
   * An activity has no severity field to answer with, so it is not a gap. The
   * queue counts events alone, and a filter counting activities too would
   * arrive on more rows than the row it came from named.
   */
  it('excludes an entry the field is not expected of', () => {
    const activity = { ...FIRST, kind: 'action', severity: null } as unknown as TimelineEntry
    expect(matchesTimeline(activity, { ...NO_TIMELINE_FILTER, missing: 'severity' }, TIERING)).toBe(
      false,
    )
  })

  /**
   * Fail closed: without the tiering there is no telling the counted entries
   * from the rest, and keeping every entry answers the row with the list it
   * was pressed to get away from.
   */
  it('keeps nothing when the caller passes no tiering', () => {
    const missing = { ...NO_TIMELINE_FILTER, missing: 'severity' }
    const gapped = applyTimelineFilter(campaignCase.timeline, missing, TIERING)
    expect(gapped.length).toBeGreaterThan(0)
    expect(gapped.some((entry) => matchesTimeline(entry, missing))).toBe(false)
  })

  it('is one narrowing the analyst can clear', () => {
    const filter = { ...NO_TIMELINE_FILTER, missing: 'severity' }
    expect(isTimelineFiltered(filter)).toBe(true)
    expect(activeCount(filter)).toBe(1)
  })
})

describe('the unreviewed dimension', () => {
  it('keeps the flagged entries and no others', () => {
    const flagged = { ...FIRST, unreviewed: true }
    const kept = applyTimelineFilter([flagged, { ...FIRST, id: 'other', unreviewed: false }], {
      ...NO_TIMELINE_FILTER,
      unreviewed: true,
    })
    expect(kept).toEqual([flagged])
  })

  it('is one narrowing the analyst can clear', () => {
    const filter = { ...NO_TIMELINE_FILTER, unreviewed: true }
    expect(isTimelineFiltered(filter)).toBe(true)
    expect(activeCount(filter)).toBe(1)
  })
})
