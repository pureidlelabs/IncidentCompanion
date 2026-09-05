import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { msOf } from '@/lib/case-time'
import { spanOf, type TimeWindow } from '@/lib/time-window'

import { TimelineScreen } from './timeline'
import {
  activeCount,
  isTimelineFiltered,
  matchesTimeline,
  NO_TIMELINE_FILTER,
  timesOf,
} from './timeline-entries'

/**
 * **The brush narrows the rows.**
 *
 * What it cannot see is the drag itself: jsdom gives the track a zero box, so
 * a pointer sweep has no geometry to land in. The window arrives as the
 * screen's own prop, and the gesture is the story tier's to prove.
 */

const times = timesOf(campaignCase.timeline)
const span = spanOf(times)

function rows(): number {
  return document.querySelectorAll('[data-slot="timeline-row"]').length
}

/** Stamps on the rows the screen is currently drawing. */
function drawnStamps(): number[] {
  return [...document.querySelectorAll('[data-slot="timeline-row"] time')]
    .map((node) => msOf(node.getAttribute('dateTime')))
    .filter((at): at is number => at !== null)
}

describe('the time window narrows the timeline', () => {
  it('has a campaign wide enough to cut in half', () => {
    // The guard: a fixture with one instant in it would make every assertion
    // below pass over the same rows.
    expect(span).not.toBeNull()
    expect(times.length).toBeGreaterThan(20)
  })

  const full: TimeWindow = span ?? { from: 0, to: 1 }
  const firstQuarter: TimeWindow = {
    from: full.from,
    to: full.from + Math.round((full.to - full.from) / 4),
  }

  it('draws fewer rows inside a window than over the whole case', () => {
    const { unmount } = render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    const whole = rows()
    unmount()

    render(<TimelineScreen kase={campaignCase} specs={specsFixture} timeWindow={firstQuarter} />)
    const narrowed = rows()

    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(whole)
  })

  it('draws no row whose stamp is outside the window', () => {
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} timeWindow={firstQuarter} />)
    const outside = drawnStamps().filter(
      (at) => at < firstQuarter.from || at > firstQuarter.to,
    )
    expect(outside).toEqual([])
  })

  it('says the filters caught nothing when the window lands in a hole', () => {
    // A one-millisecond window a stamp cannot be in. The empty state has to be
    // the *filtered* one: "nothing recorded yet" would be a lie about a case
    // holding 88 entries.
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} timeWindow={{ from: full.from + 1, to: full.from + 2 }} />)
    expect(rows()).toBe(0)
    expect(
      screen.getByText('No entry matches all of these filters at once'),
    ).toBeVisible()
  })

  it('offers the brush over the case, and counts it among the filters', () => {
    render(<TimelineScreen kase={campaignCase} specs={specsFixture} timeWindow={firstQuarter} />)
    expect(screen.getByRole('group', { name: 'Time window' })).toBeVisible()
    // **The role is implicit and there is no `role` attribute to select on.**
    // React Aria puts each grip's value on an inner `<input type="range">`,
    // whose slider role comes from the element rather than from markup - so
    // `querySelectorAll('[role="slider"]')` reports the control as missing
    // while it is present and named. Asserted here because that reading has
    // already been made once and read as a defect.
    expect(document.querySelectorAll('[role="slider"]')).toHaveLength(0)
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    // Each grip is named by its own hidden label, then the control's. React
    // Aria concatenates the two, so the assertion is on the end that names it.
    expect(screen.getByRole('slider', { name: /^Window start/ })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: /^Window end/ })).toBeInTheDocument()
    // The clear control counts dimensions, and a window that is not counted
    // cannot be cleared by the control that says it clears everything.
    expect(screen.getByRole('button', { name: 'Clear 1' })).toBeVisible()
  })

  it('draws no brush on a case with nothing to place one over', () => {
    render(<TimelineScreen kase={{ ...campaignCase, timeline: [] }} specs={specsFixture} />)
    expect(screen.queryByRole('group', { name: 'Time window' })).toBeNull()
  })
})

describe('the window as a filter dimension', () => {
  const entry = campaignCase.timeline[0]

  it('is a filter in its own right', () => {
    expect(isTimelineFiltered({ ...NO_TIMELINE_FILTER, window: { from: 1, to: 2 } })).toBe(true)
    expect(activeCount({ ...NO_TIMELINE_FILTER, window: { from: 1, to: 2 } })).toBe(1)
  })

  it('keeps a row with an unusable stamp rather than hiding it', () => {
    expect(entry).toBeDefined()
    if (entry === undefined) return
    expect(
      matchesTimeline(
        { ...entry, time: 'sometime on the Tuesday' },
        { ...NO_TIMELINE_FILTER, window: { from: 1, to: 2 } },
      ),
    ).toBe(true)
  })
})
