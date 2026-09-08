/**
 * **A report's address, which is the seam the screen cannot hold.**
 *
 * `ReportSectionScreen` takes `openId` and keeps the open report in `useState`
 * seeded from it. Nothing passed it, so `?report=<id>` named nothing: a link
 * could not be sent, a bookmark opened the index, and a reload lost the report
 * an analyst was reading. -> #397
 *
 * Driven through the container with the screen replaced by a prop recorder,
 * because what is under test is the wiring rather than anything drawn. The
 * screen's own half is exercised in `report-section.test.tsx`.
 */
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const CASE = '11111111-1111-4111-8111-111111111111'
const REPORT = 'a34e3bf8-0d21-4f0e-9b6e-2c1f3a5d7e90'

vi.mock('@/api/case', () => ({
  useCase: () => ({ data: undefined, isPending: false, error: null, refetch: vi.fn() }),
}))
vi.mock('@/api/regimes', () => ({
  useRegimes: () => ({ data: undefined }),
  regimeEnabled: () => false,
}))
vi.mock('@/api/reportLayouts', () => ({ useReportLayouts: () => ({ data: undefined }) }))
vi.mock('@/api/reportBlockKinds', () => ({ useReportBlockKinds: () => ({ data: undefined }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryBulkCreate', () => ({
  useEntryBulkCreate: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/api/useEntryReorder', () => ({ useEntryReorder: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useSession', () => ({ useSession: () => ({ username: 'Ada' }) }))

interface Given {
  openId?: string | null
  onOpenChange?: (id: string | null) => void
}

/** The screen, reduced to a handle on the props it is given. */
let given: Given | null = null
vi.mock('@/screens/report-section', () => ({
  ReportSectionScreen: (props: Given) => {
    given = props
    return null
  },
}))

const { ReportContainer } = await import('./ReportContainer')

/** The container under a route that carries a case id, at the given address. */
function at(address: string) {
  given = null
  render(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/cases/:caseId/:section" element={<ReportContainer />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('a report has an address', () => {
  it('opens the report the address names', async () => {
    at(`/cases/${CASE}/report?report=${REPORT}`)

    await waitFor(() => {
      expect(given, 'the screen was never rendered').not.toBeNull()
    })
    expect(given?.openId, 'the address named a report and the screen was told nothing').toBe(REPORT)
  })

  /** No `?report=`, so the screen opens on the index rather than on a guess. */
  it('opens the index when the address names none', async () => {
    at(`/cases/${CASE}/report`)

    await waitFor(() => {
      expect(given).not.toBeNull()
    })
    expect(given?.openId ?? null).toBeNull()
  })

  it('writes the report into the address when one is opened', async () => {
    at(`/cases/${CASE}/report`)
    await waitFor(() => {
      expect(given).not.toBeNull()
    })

    expect(given?.onOpenChange, 'the screen has no way to report what it opened').toBeDefined()
    given?.onOpenChange?.(REPORT)

    await waitFor(() => {
      expect(given?.openId).toBe(REPORT)
    })
  })

  /** Going back to the index takes the report out again, or a reload reopens it. */
  it('takes the report out of the address when the index is opened', async () => {
    at(`/cases/${CASE}/report?report=${REPORT}`)
    await waitFor(() => {
      expect(given).not.toBeNull()
    })

    given?.onOpenChange?.(null)

    await waitFor(() => {
      expect(given?.openId ?? null).toBeNull()
    })
  })
})
