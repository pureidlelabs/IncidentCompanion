/**
 * An open item counting timeline entries lands on those entries. -> #822
 *
 * The writer is the overview's queue and the reader is this container, so the
 * round trip is asserted rather than either end: `OverviewContainer.doors`
 * holds the address the row builds, and this counts the rows the real screen
 * draws at it. Reading the filter back would pass against a filter the list
 * never consults.
 */
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type * as CaseApi from '@/api/case'
import type * as SpecsApi from '@/api/specs'
import type { Case } from '@/api/model'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'

let served: Case = campaignCase

vi.mock('@/api/case', async (importOriginal) => ({
  ...(await importOriginal<typeof CaseApi>()),
  useCase: () => ({ data: served, isPending: false, error: null }),
}))
vi.mock('@/api/specs', async (importOriginal) => ({
  ...(await importOriginal<typeof SpecsApi>()),
  useSpecs: () => ({ data: specsFixture, isPending: false }),
}))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))
vi.mock('@/api/useBulkDelete', () => ({ useBulkDelete: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryMutation', () => ({ useEntryMutation: () => ({ mutateAsync: vi.fn() }) }))

const { TimelineContainer } = await import('./TimelineContainer')

const TIMELINE = casePath(campaignCase.id, 'timeline')

/** How many rows one address draws from a fresh mount of the real container. */
function rowsAt(address: string, kase: Case = campaignCase): number {
  served = kase
  const router = createMemoryRouter(
    [{ path: '/cases/:caseId/:section', element: <TimelineContainer /> }],
    { initialEntries: [address] },
  )
  const drawn = render(<RouterProvider router={router} />)
  const count = document.querySelectorAll('[data-part="timeline-row"]').length
  drawn.unmount()
  return count
}

describe('a gap row lands on the entries it counts', () => {
  const whole = rowsAt(TIMELINE)

  it('has a campaign with entries on it', () => {
    expect(whole).toBeGreaterThan(0)
  })

  it('draws fewer rows for the gap in the address than for the whole case', () => {
    const narrowed = rowsAt(`${TIMELINE}?missing=severity`)
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(whole)
  })

  /** A field nothing lacks narrows to nothing rather than to everything. */
  it('draws nothing for a field every entry answers', () => {
    expect(rowsAt(`${TIMELINE}?missing=description`)).toBe(0)
  })

  it('draws only the flagged entries for the unreviewed address', () => {
    const [first, ...rest] = campaignCase.timeline
    if (first === undefined) throw new Error('the fixture has no entry to flag')
    const flagged = { ...campaignCase, timeline: [{ ...first, unreviewed: true }, ...rest] }
    expect(rowsAt(`${TIMELINE}?unreviewed=1`, flagged)).toBe(1)
  })

  it('opens the whole case for an address naming no narrowing', () => {
    expect(rowsAt(TIMELINE)).toBe(whole)
  })
})
