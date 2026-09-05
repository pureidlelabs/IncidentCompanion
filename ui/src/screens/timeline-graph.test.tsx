import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Case, TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'

import { CARD_MEASURE } from './cascade-rows'
import { TimelineGraphScreen } from './timeline-graph'

/**
 * **What the drawing claims, held against what it draws.**
 *
 * Every assertion here is written from a screen that looked finished and was
 * not: a head row naming two tracks with no spine between them, a caption
 * promising elapsed distance over evenly-spaced rows, and one 125-character
 * description setting the measure for the page.
 *
 * What it cannot see is whether any of that *reads* - jsdom gives every
 * element a zero box, so the spine's position, the cards' widths and the
 * silence bands' heights are all `0px` here. Those are the story tier's, and
 * the captures are the evidence. What is held here is the structure the look
 * is built on: one spine, one cap, one stamp per moment, and margins that
 * differ.
 */

const draw = (kase: Case) => render(<TimelineGraphScreen kase={kase} />)

const cards = () => [...document.querySelectorAll('[data-slot="cascade-run"]')]
const moments = () =>
  [...document.querySelectorAll('[data-slot="cascade-stamp"]')].map(
    (stamp) => stamp.parentElement!.parentElement!,
  )

const event = (over: Partial<TimelineEntry>): TimelineEntry =>
  ({
    kind: 'event',
    id: `e-${over.time ?? ''}`,
    time: '2026-08-13T08:00:00.000Z',
    description: 'something',
    severity: 'medium',
    ukcPhase: '',
    ...over,
  }) as TimelineEntry

describe('the timeline graph', () => {
  it('paints one spine for the whole drawing, never one per row', () => {
    // Drawn inside each row it breaks into stubs wherever a row carries a
    // margin - and the margins are the elapsed time, so it breaks exactly
    // where the drawing is making its claim. A head row promising OBSERVED and
    // RESPONSE over no line at all is what this is written from.
    draw(campaignCase)
    const spines = document.querySelectorAll('[data-slot="cascade-spine"]')
    expect(spines).toHaveLength(1)
    expect((spines[0] as HTMLElement).style.backgroundImage).toContain('var(--border)')
    expect(document.querySelectorAll('[data-slot="cascade-stamp"]').length).toBeGreaterThan(1)
  })

  it('caps every card at one measure, on both tracks', () => {
    // One `Service 'RemoteHandsSvc' created...` ran the full lane and every
    // other card's outer edge zigzagged in from it.
    draw(campaignCase)
    expect(cards().length).toBeGreaterThan(0)
    for (const card of cards()) {
      const holder = card.parentElement!
      for (const measure of CARD_MEASURE.split(' ')) {
        expect(holder.className.split(' ')).toContain(measure)
      }
    }
  })

  it('draws both tracks off the demo the gallery ships', () => {
    // The honesty test. The demo carries 5 response entries against 83 events,
    // so a right half that renders empty is the drawing's fault and not the
    // fixture's - and padding the fixture to make the picture symmetrical is
    // the failure this screen is being reviewed to catch.
    draw(campaignCase)
    expect(document.querySelectorAll('[data-track="observed"]').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-track="response"]').length).toBeGreaterThan(0)
  })

  it('keeps both halves when the case only ever filled one', () => {
    // Nothing was done about it is an answer, so the lane stays and reads
    // empty rather than the drawing silently becoming a single column.
    draw({
      ...campaignCase,
      timeline: campaignCase.timeline.filter((entry) => entry.kind === 'event'),
    })
    expect(document.querySelectorAll('[data-track="response"]')).toHaveLength(0)
    for (const row of moments()) {
      expect(row.className).toContain('grid-cols-[1fr_5.5rem_1fr]')
    }
  })

  it('spaces its moments by what elapsed, which is what the caption claims', () => {
    // A caption the screen contradicts is worse than no caption. Every row
    // evenly spaced under `vertical distance is elapsed time` is the defect.
    draw({
      ...campaignCase,
      systems: [],
      accounts: [],
      timeline: [
        event({ time: '2026-08-13T08:00:00.000Z', description: 'one' }),
        event({ time: '2026-08-13T08:01:00.000Z', description: 'two' }),
        event({ time: '2026-08-13T08:50:00.000Z', description: 'three' }),
      ],
    })
    const spaced = moments().map((row) => Number.parseInt(row.style.marginTop || '0', 10))
    expect(spaced).toHaveLength(3)
    expect(spaced[0]).toBe(0)
    expect(spaced[1]).toBeGreaterThan(0)
    // Ordered on screen, and not by the ratio of the intervals: 49 minutes is
    // 49x a minute and draws 7x the space.
    expect(spaced[2]).toBeGreaterThan(spaced[1]!)
    expect(spaced[2]).toBeLessThan(spaced[1]! * 20)
  })

  it('rules the spine at a stage the case stamped, and nowhere for one it did not', () => {
    draw(campaignCase)
    expect(document.querySelectorAll('[data-slot="cascade-milestone"]')).toHaveLength(0)

    draw({ ...campaignCase, containedAt: '2026-08-13T18:00:00.000Z' })
    const rules = [...document.querySelectorAll('[data-slot="cascade-milestone"]')]
    expect(rules).toHaveLength(1)
    expect(rules[0]?.textContent).toContain('Contained')
    expect(rules[0]?.textContent).toContain('18:00')
  })

  it('names the stamps it is missing inside the strip, not beside it', () => {
    // `not recorded / not recorded / 1` with a sentence wrapping alongside was
    // the strip's whole failure: the explanation sat outside the figures it
    // explained.
    draw(campaignCase)
    const strip = document.querySelector('[data-slot="cascade-metrics"]')!
    const stamps = document.querySelector('[data-slot="metric-stamps"]')!
    expect(stamps.textContent).toBe('0 of 4')
    expect(stamps.parentElement?.parentElement).toBe(strip)
    expect(strip.textContent).toContain('detected, contained, eradicated, recovered not recorded')
  })
})
