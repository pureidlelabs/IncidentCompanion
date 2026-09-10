/**
 * A kill chain coverage row lands on the phase it names, and leaving it clears it.
 *
 * The writer and the reader sit in different files, so the round trip is
 * asserted rather than either end: the address a coverage row builds is handed
 * to the container, and the rows the real screen draws are counted. Reading
 * the filter back would pass against a filter the list never consults. -> #499
 *
 * **Both addresses are on one route.** `/cases/:caseId/:section` renders a
 * constant element per section, so moving between two timeline addresses
 * re-renders the container and remounts nothing -- which is how a phase
 * outlives the analyst navigating away from it.
 */
import { act, render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type * as SpecsApi from '@/api/specs'
import { timelinePath } from '@/components/blocks/case-paths'
import { campaignCase } from '@/fixtures/campaign'
import { specsFixture } from '@/fixtures/specs'
import { phasesOf } from '@/screens/timeline-entries'

vi.mock('@/api/case', () => ({
  useCase: () => ({ data: campaignCase, isPending: false, error: null }),
}))
vi.mock('@/api/specs', async (importOriginal) => ({
  ...(await importOriginal<typeof SpecsApi>()),
  useSpecs: () => ({ data: specsFixture, isPending: false }),
}))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => campaignCase.id }))
vi.mock('@/api/useEntryDelete', () => ({ useEntryDelete: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryMutation', () => ({ useEntryMutation: () => ({ mutateAsync: vi.fn() }) }))

const { TimelineContainer } = await import('./TimelineContainer')

const WHOLE_CASE = timelinePath(campaignCase.id)

function rows(): number {
  return document.querySelectorAll('[data-part="timeline-row"]').length
}

/** The container on the real section route, so a later navigation behaves as the app's does. */
function open(address: string) {
  const router = createMemoryRouter(
    [{ path: '/cases/:caseId/:section', element: <TimelineContainer /> }],
    { initialEntries: [address] },
  )
  const drawn = render(<RouterProvider router={router} />)
  return {
    rows,
    go: async (next: string) => {
      // Outside `act` the navigation resolves before React has re-rendered,
      // and the count read back is the one from before the move.
      await act(async () => {
        await router.navigate(next)
      })
    },
    close: () => {
      drawn.unmount()
    },
  }
}

/** How many rows one address draws from a fresh mount. */
function rowsAt(address: string): number {
  const at = open(address)
  const count = at.rows()
  at.close()
  return count
}

describe('a kill chain coverage row lands on the phase it names', () => {
  const whole = rowsAt(WHOLE_CASE)

  it('has a campaign holding more phases than one', () => {
    // A fixture carrying a single phase makes every count below the same count.
    expect(phasesOf(campaignCase.timeline).length).toBeGreaterThan(2)
    expect(whole).toBeGreaterThan(0)
  })

  it('draws fewer rows for the phase in the address than for the whole case', () => {
    const narrowed = rowsAt(timelinePath(campaignCase.id, 'lateral movement'))
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(whole)
  })

  it('narrows on a phase whose name the address has to encode', () => {
    // `command & control` unencoded parses as `phase=command ` plus a second,
    // empty parameter, so this fails on an address assembled by hand.
    const narrowed = rowsAt(timelinePath(campaignCase.id, 'command & control'))
    expect(narrowed).toBeGreaterThan(0)
    expect(narrowed).toBeLessThan(whole)
  })

  it('draws nothing for a phase the case never recorded', () => {
    expect(rowsAt(timelinePath(campaignCase.id, 'no such phase'))).toBe(0)
  })

  /**
   * The rail draws Timeline as a link whether or not it is the section already
   * open, so this is one click away from any narrowed arrival.
   */
  it('lets go of the phase when the analyst navigates back to the whole case', async () => {
    const at = open(timelinePath(campaignCase.id, 'impact'))
    expect(at.rows()).toBeLessThan(whole)

    await at.go(WHOLE_CASE)
    expect(at.rows(), 'the rail sent the analyst to the whole case').toBe(whole)
    at.close()
  })

  it('follows the address from one phase to another', async () => {
    const exfiltration = rowsAt(timelinePath(campaignCase.id, 'exfiltration'))
    expect(
      rowsAt(timelinePath(campaignCase.id, 'impact')),
      'two phases of one size would prove nothing here',
    ).not.toBe(exfiltration)

    const at = open(timelinePath(campaignCase.id, 'impact'))
    await at.go(timelinePath(campaignCase.id, 'exfiltration'))
    expect(at.rows()).toBe(exfiltration)
    at.close()
  })
})
