/**
 * **Moving a section, which is the seam nothing crossed.**
 *
 * `report-workspace.tsx` renders the outline as a `Sortable` only when it is
 * given `onReorder`, and takes a plain `<ol>` otherwise. `ReportContainer`
 * passed none, so every report drew as a list with no grip on any row and no
 * section could be moved -- while the server's own route has been live all
 * along, refusing a malformed order with a rule rather than a 404:
 *
 *     POST /api/cases/<id>/report_blocks/order
 *     422 {"message":"A reorder names every row in the reportId, once each."}
 *
 * -> #381
 */
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const CASE = '11111111-1111-4111-8111-111111111111'
const ORDER = ['b2', 'b1', 'b3']

const reordered: { ids: readonly string[] }[] = []
const collections: string[] = []

vi.mock('@/api/case', () => ({ useCase: () => ({ data: undefined, isPending: false, error: null, refetch: vi.fn() }) }))
vi.mock('@/api/regimes', () => ({ useRegimes: () => ({ data: undefined }), regimeEnabled: () => false }))
vi.mock('@/api/reportLayouts', () => ({ useReportLayouts: () => ({ data: undefined }) }))
vi.mock('@/api/reportBlockKinds', () => ({ useReportBlockKinds: () => ({ data: undefined }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryBulkCreate', () => ({ useEntryBulkCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useSession', () => ({ useSession: () => ({ username: 'Ada' }) }))
vi.mock('@/api/useEntryReorder', () => ({
  useEntryReorder: (_caseId: string, collection: string) => {
    collections.push(collection)
    return {
      mutateAsync: (order: { ids: readonly string[] }) => {
        reordered.push({ ids: [...order.ids] })
        return Promise.resolve({ ids: [...order.ids] })
      },
    }
  },
}))

interface Given {
  onReorder?: (ids: string[]) => void
}

let given: Given | null = null
vi.mock('@/screens/report-section', () => ({
  ReportSectionScreen: (props: Given) => {
    given = props
    return null
  },
}))

const { ReportContainer } = await import('./ReportContainer')

async function mounted(): Promise<Given> {
  given = null
  reordered.length = 0
  collections.length = 0
  render(
    <MemoryRouter initialEntries={[`/cases/${CASE}/report`]}>
      <Routes>
        <Route path="/cases/:caseId/:section" element={<ReportContainer />} />
      </Routes>
    </MemoryRouter>,
  )
  await waitFor(() => {
    expect(given, 'the screen was never rendered').not.toBeNull()
  })
  return given!
}

describe('moving a section', () => {
  it('gives the screen somewhere to report a move', async () => {
    const screen = await mounted()

    expect(
      screen.onReorder,
      'the outline draws as a plain list, so there is no grip to take',
    ).toBeDefined()
  })

  it('writes the order the outline reports, in that order', async () => {
    const screen = await mounted()

    screen.onReorder?.([...ORDER])

    await waitFor(() => {
      expect(reordered.at(-1)?.ids).toEqual(ORDER)
    })
  })

  /**
   * **`report_blocks`, because that is what the server scopes by `reportId`.**
   * The same route serves every ordered collection, so a reorder sent under
   * another one reorders somebody else's rows or is refused as unknown.
   */
  it('reorders the report blocks, not another collection', async () => {
    await mounted()

    expect(collections).toContain('report_blocks')
  })
})
