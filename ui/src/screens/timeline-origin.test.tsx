import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Case, TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { TimelineScreen } from './timeline'

/**
 * Where a timeline entry came from, on the row.
 *
 * **Written against two opposite defects.** A marker on every row says
 * *typed* four hundred times and buries the handful of rows it exists to
 * point at; and a marker drawn only where a platform named itself is silent
 * on exactly the imports that carry no tool name -- a CSV file and a case
 * archive both arrive `imported` with `sourceTool` empty.
 *
 * So the assertions are a set of three, and no two of them pass for the same
 * wrong row: silent when typed, named when a platform named itself, and still
 * present when none did.
 *
 * **What this tier cannot see** is whether the marker reads as another
 * derived fact beside `eventSource` and the tactic, which are muted words on
 * the same line. That is `visual-check`'s to answer.
 */

/** The campaign case with one row replaced, and nothing else changed. */
function caseWith(fields: Partial<TimelineEntry>): Case {
  const first = campaignCase.timeline[0]
  if (!first) throw new Error('the demo case has no timeline')
  // Asserted rather than annotated: spreading one arm of the event/activity
  // union widens it, and every field below is one that arm already carries.
  const only = { ...first, ...fields } as TimelineEntry
  return { ...campaignCase, timeline: [only] }
}

function origins(): HTMLElement[] {
  return [...document.querySelectorAll('[data-part="timeline-origin"]')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )
}

describe('a timeline entry says where it came from', () => {
  it('says nothing on an entry the analyst typed', () => {
    render(<TimelineScreen kase={caseWith({ provenance: 'typed' })} specs={specsFixture} />)

    expect(origins(), 'a row the analyst typed is not short of anything').toHaveLength(0)
  })

  it('names the platform that found an imported entry', () => {
    render(
      <TimelineScreen
        kase={caseWith({ provenance: 'imported', sourceTool: 'Microsoft Sentinel' })}
        specs={specsFixture}
      />,
    )

    const [marker] = origins()
    expect(marker, 'an imported row draws no origin').toBeDefined()
    expect(marker!.textContent).toContain('Microsoft Sentinel')
  })

  /**
   * The door that names no tool is the ordinary case, not the edge: a CSV file
   * and a case archive both write `imported` and leave `sourceTool` empty.
   */
  it('still says an entry was imported when no tool named itself', () => {
    render(
      <TimelineScreen
        kase={caseWith({ provenance: 'imported', sourceTool: '' })}
        specs={specsFixture}
      />,
    )

    const [marker] = origins()
    expect(marker, 'an import with no tool name draws nothing at all').toBeDefined()
    expect(marker!.textContent).toContain('imported')
  })
})
