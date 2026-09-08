/**
 * **What the container hands the report screen, which nothing looked at.**
 *
 * The screen opens the report's prose document, and it needs two things from
 * here to do it: the case the socket belongs to, and who is typing so the
 * other analysts' screens can name the caret. Both are wiring -- a value read
 * in one file and passed in another -- and wiring is the one thing neither
 * neighbouring tier can see. `report-section.prose.test.tsx` renders the
 * screen with a `caseId` handed to it, and the screen's own default is `''`,
 * which is the gallery: a container that passed neither would leave every
 * case's prose reaching nothing while both suites stayed green. -> #385
 *
 * Driven with the screen replaced by a prop recorder, for the same reason
 * `NotesContainer.test.tsx` is.
 */
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CASE = '22222222-2222-4222-8222-222222222222'

let handed: Record<string, unknown> | null = null
let username: string | undefined = 'Ada'

vi.mock('@/app/useCaseId', () => ({ useCaseId: () => CASE }))
vi.mock('@/api/useSession', () => ({ useSession: () => (username ? { username } : undefined) }))
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
vi.mock('@/screens/report-section', () => ({
  ReportSectionScreen: (props: Record<string, unknown>) => {
    handed = props
    return null
  },
}))

const { ReportContainer } = await import('./ReportContainer')

async function drawn(): Promise<Record<string, unknown>> {
  handed = null
  render(<ReportContainer />)
  await waitFor(() => {
    expect(handed, 'the screen was never drawn').not.toBeNull()
  })
  return handed!
}

describe('what the report container hands the screen', () => {
  beforeEach(() => {
    username = 'Ada'
  })

  /**
   * **The case, or the document is opened against nothing.** The screen builds
   * the address from this and its own default is the gallery's blank, which
   * opens no channel at all -- silently, because a report with no prose looks
   * exactly like a report nobody has written in.
   */
  it('names the case whose socket the prose document lives on', async () => {
    expect((await drawn()).caseId, 'the prose document had no case to open in').toBe(CASE)
  })

  /** So the other analysts' screens can name this caret rather than a blank one. */
  it('names who is typing', async () => {
    expect((await drawn()).analyst).toBe('Ada')
  })

  /**
   * **Omitted rather than blank when there is no session.** The screen takes
   * `analyst` as optional and a present-but-empty name is a caret labelled
   * with nothing, which reads as a bug in the other analyst's screen.
   */
  it('says nothing about who is typing when nobody is signed in', async () => {
    username = undefined
    expect(await drawn()).not.toHaveProperty('analyst')
  })
})
