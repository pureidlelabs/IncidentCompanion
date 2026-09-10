import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { TimelineScreen } from './timeline'
import { phasesOf } from './timeline-entries'

/**
 * **A phase the screen opens narrowed to actually narrows the list.**
 *
 * The sibling defect to the brush's: a seeding prop read into filter state and
 * consulted by nothing leaves the list whole, and every assertion written
 * against the filter still passes. So these count rendered rows.
 *
 * `timeline-phase-link.test.tsx` owns the other half -- that a coverage row's
 * address reaches this prop at all -- and cannot see this one, because it
 * stands in for the screen with a stub.
 */

const PHASES = phasesOf(campaignCase.timeline)

function rows(): number {
  return document.querySelectorAll('[data-part="timeline-row"]').length
}

describe('the kill chain phase narrows the timeline', () => {
  it('has a campaign carrying more than one phase', () => {
    // The guard: one phase, or none, makes every assertion below pass over the
    // same rows.
    expect(PHASES.length).toBeGreaterThan(2)
  })

  it('draws fewer rows for one phase than for the whole case', () => {
    const { unmount } = render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    const whole = rows()
    unmount()

    render(<TimelineScreen kase={campaignCase} specs={specsFixture} phases={['lateral movement']} />)
    const narrowed = rows()

    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(whole)
  })

  it('draws every row when no phase is asked for', () => {
    const { unmount } = render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    const whole = rows()
    unmount()

    render(<TimelineScreen kase={campaignCase} specs={specsFixture} phases={[]} />)
    expect(rows()).toBe(whole)
  })

  /**
   * A phase whose name carries a character the address has to encode. The
   * round trip is the link test's; what this holds is that the screen narrows
   * on the decoded name rather than on a mangled one.
   */
  it('narrows on a phase whose name is not URL-safe', () => {
    const awkward = PHASES.find((one) => one.includes('&'))
    expect(awkward, 'the fixture no longer carries a phase needing encoding').toBeDefined()

    const { unmount } = render(<TimelineScreen kase={campaignCase} specs={specsFixture} />)
    const whole = rows()
    unmount()

    render(<TimelineScreen kase={campaignCase} specs={specsFixture} phases={[awkward!]} />)
    const narrowed = rows()

    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(whole)
  })

  it('draws no rows for a phase the case never recorded', () => {
    render(
      <TimelineScreen kase={campaignCase} specs={specsFixture} phases={['no such phase']} />,
    )
    expect(rows()).toBe(0)
  })
})
