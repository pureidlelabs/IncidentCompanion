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
import type * as ReportLayoutsModuleShape from '@/api/reportLayouts'

type ReportLayoutsModule = typeof ReportLayoutsModuleShape

import { ReportContainer } from './ReportContainer'

const CASE = '22222222-2222-4222-8222-222222222222'

/**
 * Every language `useReportLayouts` was asked for.
 *
 * **Two queries, and both matter.** The screen's headings follow the open
 * report; the new-report dialog's layout chips and markings follow the
 * install, because the report it is about does not exist yet and will be made
 * in the install's language. So the assertions ask what was *among* the
 * languages fetched rather than which came last.
 */
const asked: string[] = []

/** Mutable, so a case that changes under the screen can be drawn. */
let reports = [
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
/** What the pack answers, per language, as the server would. */
const PACKS: Record<string, { key: string; label: string }[]> = {
  nl: [{ key: 'heading.exec_summary', label: 'Managementsamenvatting' }],
  '': [{ key: 'heading.exec_summary', label: 'Executive summary' }],
}

vi.mock('@/api/reportLayouts', async () => {
  // **The real `headingLabelsByKey`.** Mocking it is what let an empty object
  // stand in for the served pack in every other file here.
  const real = await vi.importActual<ReportLayoutsModule>('@/api/reportLayouts')
  return {
    ...real,
    useReportLayouts: (language: string) => {
      asked.push(language)
      return { data: { languages: [], layouts: [], tlp: [], headings: PACKS[language] ?? [] } }
    },
  }
})
vi.mock('@/api/reportBlockKinds', () => ({ useReportBlockKinds: () => ({ data: undefined }) }))
vi.mock('@/api/useEntryCreate', () => ({ useEntryCreate: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryMutation', () => ({ useEntryMutation: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryBulkCreate', () => ({
  useEntryBulkCreate: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/api/useEntryReorder', () => ({ useEntryReorder: () => ({ mutateAsync: vi.fn() }) }))
/**
 * **The screen records what it was handed rather than drawing nothing.**
 * Mocked to `null`, this file could not tell the fetched pack from an empty
 * object -- and passing `{}` as `headings` survived every test in the client.
 *
 * `vi.hoisted`, because a mock factory is lifted above every `let` in the file.
 */
const held = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }))
vi.mock('@/screens/report-section', () => ({
  ReportSectionScreen: (props: Record<string, unknown>) => {
    held.props = props
    return null
  },
}))


/** The distinct languages fetched, the two queries asking one key between them. */
const languages = () => [...new Set(asked)].sort()

const open = async (at: string) => {
  return render(
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
    held.props = null
    reports = [
      { id: 'report-nl', version: 1, language: 'nl', label: 'Dutch report' },
      { id: 'report-en', version: 1, language: '', label: 'Default report' },
    ] as unknown as Report[]
  })

  it("is the open report's own", async () => {
    await open('/?report=report-nl')

    expect(
      languages(),
      "the pack was fetched in the install's language, so a Dutch report would draw " +
        'whatever the install happens to be set to',
    ).toEqual(['', 'nl'])
  })

  /**
   * **A report carrying no language of its own takes the install's**, which is
   * what `''` asks for -- not a second default invented here.
   */
  it("is the install's where the report names none", async () => {
    await open('/?report=report-en')

    expect(languages()).toEqual([''])
  })

  /**
   * **The index list is not a report.** With none open there is no language to
   * follow, and the list draws what the install answers.
   */
  it("is the install's where no report is open", async () => {
    await open('/')

    expect(languages()).toEqual([''])
  })

  /**
   * **The pack has to reach the screen, not merely be fetched.** Handing the
   * screen an empty object leaves every heading drawn as its own key, and it
   * survived every test in this client -- the seam between the query and the
   * screen was the whole fix and was asserted by nothing.
   */
  it('reaches the screen as the words the pack answered with', async () => {
    await open('/?report=report-nl')

    expect(
      (held.props as { headings?: Record<string, string> } | null)?.headings,
      'the screen was handed something other than the pack that was fetched for it',
    ).toEqual({ 'heading.exec_summary': 'Managementsamenvatting' })
  })

  /**
   * **Changing the language changes the words, which is the analyst's own
   * act.** The report is patched, the case is read again, and the pack the
   * screen draws from has to follow -- a screen that keeps the old language's
   * headings over a document that will export in the new one is the defect,
   * one step later.
   */
  it('follows the report when the analyst changes it', async () => {
    const drawn = await open('/?report=report-nl')
    expect((held.props as { headings?: Record<string, string> }).headings).toEqual({
      'heading.exec_summary': 'Managementsamenvatting',
    })

    // The case as it reads after the patch has landed and been re-fetched.
    reports = [
      { id: 'report-nl', version: 2, language: '', label: 'Dutch report' },
      { id: 'report-en', version: 1, language: '', label: 'Default report' },
    ] as unknown as Report[]
    drawn.rerender(
      <MemoryRouter initialEntries={['/?report=report-nl']}>
        <ReportContainer />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(
        (held.props as { headings?: Record<string, string> }).headings,
        'the screen kept the old language\'s headings over a report that no longer carries it',
      ).toEqual({ 'heading.exec_summary': 'Executive summary' })
    })
  })
})
