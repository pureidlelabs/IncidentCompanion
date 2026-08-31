import { describe, expect, it } from 'vitest'

import type { TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { msOf } from '@/lib/case-time'

import { runsOf, withoutTimelineEntries } from './timeline-entries'

/**
 * A bulk delete over the timeline, attacked at the one place it can go wrong:
 * a run folds entries that share every grouping field but their id, so a
 * filter written against the wrong key removes the sibling instead of the
 * one actually selected.
 */

const lead = campaignCase.timeline[0]
if (!lead) throw new Error('the demo case has no entries')

/** Two entries identical in every field a run groups on, distinct ids only. */
function twin(entry: TimelineEntry, id: string): TimelineEntry {
  return { ...entry, id }
}

describe('bulk-deleting timeline entries', () => {
  it('removes exactly the selected id and nothing that merely matches its run', () => {
    const a = twin(lead, 'twin-a')
    const b = twin(lead, 'twin-b')
    const entries = [a, b]
    // The pair really is one run before the attack, or the test proves
    // nothing about the failure mode it names.
    const run = runsOf(entries)
    expect(run).toHaveLength(1)
    expect(run[0]?.members).toHaveLength(2)

    const kept = withoutTimelineEntries(entries, new Set(['twin-a']))

    expect(kept.map((entry) => entry.id)).toEqual(['twin-b'])
  })

  it('leaves the list untouched when the doomed set names no entry here', () => {
    const entries = [twin(lead, 'a'), twin(lead, 'b')]
    const kept = withoutTimelineEntries(entries, new Set(['not-present']))
    expect(kept.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('empties the list when every id is doomed', () => {
    const entries = [twin(lead, 'a'), twin(lead, 'b'), twin(lead, 'c')]
    const kept = withoutTimelineEntries(entries, new Set(['a', 'b', 'c']))
    expect(kept).toEqual([])
  })

  it('removes one member of an open run without disturbing its lead', () => {
    const at = msOf(lead.time) ?? 0
    const member = { ...lead, id: 'member-2', time: new Date(at + 60_000).toISOString() }
    const entries = [twin(lead, 'lead-1'), member]
    const kept = withoutTimelineEntries(entries, new Set(['member-2']))
    expect(kept.map((entry) => entry.id)).toEqual(['lead-1'])
  })
})
