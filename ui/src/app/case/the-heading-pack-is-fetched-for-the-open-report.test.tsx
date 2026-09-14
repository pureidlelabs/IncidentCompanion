/**
 * **The heading pack is fetched in the open report's own language.**
 *
 * Resolving headings through the served map is half the fix; the other half is
 * asking for the right map. The container pinned the query to `''` -- the
 * install's own default -- so a wired-up client would still have drawn Dutch
 * headings as English on a Dutch report, and the query key would never change
 * when the analyst changed the language. -> #513
 *
 * **Asserted at the query, not on the screen.** What the screen draws is
 * `report-shape.ts`'s and is asserted there against a pack handed in. This is
 * the seam above it: which pack gets fetched at all.
 *
 * **What this does not cover:** that the served endpoint answers in the asked
 * language, which is the server's and `report/render.service.ts`'s.
 */
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Case, Report } from '@/api/model'

import { ReportContainer } from './ReportContainer'

const CASE = '22222222-2222-4222-8222-222222222222'

/** Every language `useReportLayouts` was asked for, in order. */
const asked: string[] = []

const reports = [
  { id: 'report-nl', version: 1, language: 'nl', label: 'Dutch report' },
  { id: 'report-en', version: 1, language: '', label: 'Default report' },
] as unknown as Report[]

vi.mock('@/app/useCaseId', () => ({ useCaseId: () => CASE }))
vi.mock('@/api/useSession', () => ({ useSession: () => ({ username: 'Ada' }) }))
vi.mock('@/api/case', () => ({
  useCase: () => ({
    data: { id: CASE, reports, reportBlocks: [] } as unknown as Case,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}))
vi.mock('@/api/regimes', () => ({
  useRegimes: () => ({ data: undefined }),
  regimeEnabled: () => false,
}))
vi.mock('@/api/reportLayouts', () => ({
  useReportLayouts: (language: string) => {
    asked.push(language)
    return { data: undefined }
  },
  headingLabelsByKey: () => ({}),
}))
vi.mock('@/api/reportBlockKinds', () => ({ useReportBlockKinds: () => ({ data: undefined }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryMutation', () => ({ useEntryMutation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryBulkCreate', () => ({
  useEntryBulkCreate: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/api/useEntryReorder', () => ({ useEntryReorder: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/screens/report-section', () => ({ ReportSectionScreen: () => null }))


const open = async (at: string) => {
  render(
    <MemoryRouter initialEntries={[at]}>
      <ReportContainer />
    </MemoryRouter>,
  )
  await waitFor(() => {
    expect(asked.length).toBeGreaterThan(0)
  })
}

describe('the language the heading pack is fetched in', () => {
  beforeEach(() => {
    asked.length = 0
  })

  it('is the open report’s own', async () => {
    await open('/?report=report-nl')

    expect(
      asked.at(-1),
      'the pack was fetched in the install’s language, so a Dutch report would draw ' +
        'whatever the install happens to be set to',
    ).toBe('nl')
  })

  /**
   * **A report carrying no language of its own takes the install's**, which is
   * what `''` asks for -- not a second default invented here.
   */
  it('is the install’s where the report names none', async () => {
    await open('/?report=report-en')

    expect(asked.at(-1)).toBe('')
  })

  /**
   * **The index list is not a report.** With none open there is no language to
   * follow, and the list draws what the install answers.
   */
  it('is the install’s where no report is open', async () => {
    await open('/')

    expect(asked.at(-1)).toBe('')
  })
})
