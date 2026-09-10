/**
 * A coverage row's link lands on the phase it names, and the two halves agree.
 *
 * **The writer and the reader are in different files, and nothing held them
 * together.** `timelinePath` put the phase in a query parameter and the
 * timeline read no query at all, so every kill chain coverage row landed on
 * the whole case and the analyst re-picked the phase they had just clicked.
 * Both halves were individually correct and the suite was green. -> #499
 *
 * So the round trip is asserted rather than either end: the parameter the link
 * writes is parsed back, and the container is handed a real address to prove
 * it reaches the screen as a filter.
 */
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { timelinePath } from '@/components/blocks/case-paths'

vi.mock('@/api/case', () => ({ useCase: () => ({ data: undefined, isPending: false, error: null }) }))
vi.mock('@/api/specs', () => ({ useSpecs: () => ({ data: undefined, isPending: false }) }))
vi.mock('@/app/useCaseId', () => ({ useCaseId: () => 'case-1' }))
vi.mock('@/api/useEntryDelete', () => ({ useEntryDelete: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryMutation', () => ({ useEntryMutation: () => ({ mutateAsync: vi.fn() }) }))

/** The screen stands in for itself, so the test reads the props rather than a rendering. */
const drawn: { phases?: readonly string[] }[] = []
vi.mock('@/screens/timeline', () => ({
  TimelineScreen: (props: { phases?: readonly string[] }) => {
    drawn.push(props)
    return null
  },
}))

const { TimelineContainer } = await import('./TimelineContainer')

function landOn(address: string): { phases?: readonly string[] } {
  drawn.length = 0
  render(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/cases/:caseId/timeline" element={<TimelineContainer />} />
      </Routes>
    </MemoryRouter>,
  )
  const props = drawn.at(-1)
  if (props === undefined) throw new Error('the container drew no screen')
  return props
}

describe('a kill chain coverage row lands on the phase it names', () => {
  it('carries the phase from the address to the screen', () => {
    expect(landOn(timelinePath('case-1', 'exploitation')).phases).toEqual(['exploitation'])
  })

  it('leaves the timeline unfiltered when the link names no phase', () => {
    expect(landOn(timelinePath('case-1')).phases).toEqual([])
  })

  it('ignores a phase that is only whitespace, which the writer omits anyway', () => {
    expect(landOn('/cases/case-1/timeline?phase=%20').phases).toEqual([])
  })

  /**
   * The failure that shipped: a rename on either side leaves both halves
   * correct and the link inert, and no assertion above would move.
   */
  it('reads the parameter the link writes, by that name', () => {
    const written = new URL(timelinePath('case-1', 'exploitation'), 'https://x')
    expect([...written.searchParams.keys()], 'one parameter, and the reader knows it').toEqual([
      'phase',
    ])
    expect(landOn(`/cases/case-1/timeline?${written.searchParams.toString()}`).phases).toEqual([
      'exploitation',
    ])
  })
})
