/**
 * Every open item on the overview opens a door, and the door lands on the job
 * the row names. -> #822
 *
 * The attack is the door that goes somewhere true and useless: `Set` navigated
 * to the section the analyst was already standing on, so pressing it did
 * nothing at all, and `Review 3` reached the timeline with all 88 entries on
 * it. Both are indistinguishable from a working door until you press one.
 *
 * So what is asserted is the arrival rather than the handler: which tab is
 * open, what holds focus, and the address whose rows are counted in
 * `TimelineContainer.gap-link.test.tsx`.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type * as CaseApi from '@/api/case'
import type * as SpecsApi from '@/api/specs'
import type { Case } from '@/api/model'
import { casePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { campaignCompliance } from '@/fixtures/compliance'
import { specsFixture } from '@/fixtures/specs'

/** The case the mocked read answers with, set per test before the mount. */
let served: Case = campaignCase

vi.mock('@/api/case', async (importOriginal) => ({
  ...(await importOriginal<typeof CaseApi>()),
  useCase: () => ({ data: served, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/api/compliance', () => ({ useComplianceRecord: () => ({ data: campaignCompliance }) }))
vi.mock('@/api/useCaseMutation', () => ({ useCaseMutation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))
vi.mock('@/api/specs', async (importOriginal) => ({
  ...(await importOriginal<typeof SpecsApi>()),
  useSpecs: () => ({ data: specsFixture, isPending: false }),
}))

const { OverviewContainer } = await import('./OverviewContainer')

const OVERVIEW = casePath(campaignCase.id, 'overview')

/** The container on the real section route, so a door navigates as the app does. */
function open(kase: Case) {
  served = kase
  const router = createMemoryRouter(
    [{ path: '/cases/:caseId/:section', element: <OverviewContainer /> }],
    { initialEntries: [OVERVIEW] },
  )
  render(<RouterProvider router={router} />)
  return {
    press: async (name: string) => {
      await userEvent.setup().click(screen.getByRole('button', { name }))
    },
    at: () => `${router.state.location.pathname}${router.state.location.search}`,
  }
}

describe('an open item naming a field on this screen', () => {
  it('opens the tab holding the field and puts the cursor in it', async () => {
    // The fixture records no detection time, which is what draws the `Set` row.
    const at = open(campaignCase)
    await at.press('Set')

    expect(screen.getByRole('tab', { name: 'Key times', selected: true })).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText('Detected at'))
  })

  /**
   * Title is on the other pane, so a screen that always opened Key times
   * passes the case above and strands this one.
   */
  it('opens the properties tab for a field the times pane does not hold', async () => {
    const at = open({ ...campaignCase, title: '' })
    await at.press('Write')

    expect(screen.getByRole('tab', { name: 'Properties', selected: true })).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
  })

  /** The address carries it, so a reload lands where the press did. */
  it('leaves the field in the address', async () => {
    const at = open(campaignCase)
    await at.press('Set')

    expect(at.at()).toBe(`${OVERVIEW}?field=detectedAt`)
  })
})

describe('an open item naming timeline entries', () => {
  it('carries the gap it counts to the timeline', async () => {
    const at = open(campaignCase)
    await at.press('Review 3')

    expect(at.at()).toBe(`${casePath(campaignCase.id, 'timeline')}?missing=severity`)
  })

  it('carries the unreviewed flag to the timeline', async () => {
    const [first, ...rest] = campaignCase.timeline
    if (first === undefined) throw new Error('the fixture has no entry to flag')
    const at = open({ ...campaignCase, timeline: [{ ...first, unreviewed: true }, ...rest] })
    await at.press('Review')

    expect(at.at()).toBe(`${casePath(campaignCase.id, 'timeline')}?unreviewed=1`)
  })

  /** A case with nothing on it names no entries, so the door narrows nothing. */
  it('opens the whole timeline where the row names no entries', async () => {
    const at = open({ ...campaignCase, timeline: [] })
    await at.press('Capture')

    expect(at.at()).toBe(casePath(campaignCase.id, 'timeline'))
  })
})
