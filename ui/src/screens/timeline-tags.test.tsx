import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Case, TimelineEntry } from '@/api/model'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

import { TimelineScreen } from './timeline'

/**
 * The analyst's own keywords on a timeline row.
 *
 * What this tier cannot see is the density: jsdom gives every element a zero
 * box, so whether the chips break the row's vertical rhythm is `visual-check`'s
 * to answer.
 */

/** The campaign case with one row's tags replaced, and nothing else changed. */
function caseTagged(tags: string): Case {
  const first = campaignCase.timeline[0]
  if (!first) throw new Error('the demo case has no timeline')
  // Asserted rather than annotated: spreading one arm of the event/activity
  // union widens it, and only `tags` differs from a row the fixture already
  // typechecks.
  const only = { ...first, tags } as TimelineEntry
  return { ...campaignCase, timeline: [only] }
}

function tagChips(): HTMLElement[] {
  return [...document.querySelectorAll('[data-slot="timeline-tags"] [data-slot="badge"]')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  )
}

describe('the tags on a timeline row', () => {
  it('draws one chip per tag, and no hash on any of them', () => {
    render(<TimelineScreen specs={specsFixture} kase={caseTagged('patient-zero,exfil')} />)

    const chips = tagChips()
    expect(chips.map((chip) => chip.textContent)).toEqual(['patient-zero', 'exfil'])
    const line = document.querySelector('[data-slot="timeline-tags"]')
    expect(line?.textContent ?? '').not.toContain('#')
  })

  /** A chip is what replaces the sigil, so the words may not be bare spans. */
  it('gives every tag a chip rather than a run of words', () => {
    render(<TimelineScreen specs={specsFixture} kase={caseTagged('one,two,three')} />)

    expect(tagChips()).toHaveLength(3)
  })

  it('keeps the parsing: trims, and drops what is between two commas', () => {
    render(<TimelineScreen specs={specsFixture} kase={caseTagged(' kape , ,  beacon ')} />)

    expect(tagChips().map((chip) => chip.textContent)).toEqual(['kape', 'beacon'])
  })

  it('draws nothing at all for a row with no tags', () => {
    render(<TimelineScreen specs={specsFixture} kase={caseTagged('  ')} />)

    expect(document.querySelector('[data-slot="timeline-tags"]')).toBeNull()
  })
})
