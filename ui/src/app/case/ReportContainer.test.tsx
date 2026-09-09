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
import { MemoryRouter } from 'react-router-dom'
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
/**
 * What the two writes behind `onCreate` answer, per test.
 *
 * A create resolves with the row the server stored, which the container reads
 * `id` from to seed the blocks. Held in a variable so a test can make the
 * server's answer the thing under test.
 */
let created: unknown = { id: 'r1' }
let seeded: () => Promise<unknown> = () => Promise.resolve([])

vi.mock('@/api/useEntryCreate', () => ({
  useEntryCreate: () => ({ mutateAsync: () => Promise.resolve(created) }),
}))
vi.mock('@/api/useEntryReorder', () => ({ useEntryReorder: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/api/useEntryBulkCreate', () => ({
  useEntryBulkCreate: () => ({ mutateAsync: () => seeded() }),
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
  render(
    // A Router, because the container now reads which report is open from the
    // address. Memory rather than browser: the route is not what is under test.
    <MemoryRouter>
      <ReportContainer />
    </MemoryRouter>,
  )
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

/**
 * **What `onCreate` settles to, which decides whether the dialog closes.**
 *
 * `ReportNewDialog` waits on this promise and closes only when it resolves;
 * a rejection is its signal to stay open holding the analyst's choices. So the
 * promise this container returns *is* the close behaviour, and
 * `report-new-dialog.test.tsx` cannot see it -- that suite hands the dialog its
 * own resolved promise and asserts the dialog's half. -> #469
 */
describe('the promise the container hands the new-report dialog', () => {
  beforeEach(() => {
    created = { id: 'r1' }
    seeded = () => Promise.resolve([])
  })

  function choice(blocks: { position: number; kind: string; heading: string; headingKey: string }[]) {
    return { layout: 'standard', label: 'A report', stage: '', tlp: '', blocks }
  }

  /** The whole point: a stored report closes the dialog rather than stranding it. */
  it('resolves when the report and its sections are both stored', async () => {
    const onCreate = (await drawn()).onCreate as (c: unknown) => Promise<unknown>
    await expect(
      onCreate(choice([{ position: 0, kind: 'prose', heading: 'Summary', headingKey: 'summary' }])),
      'a stored report left the dialog waiting, so it never closed',
    ).resolves.toBeUndefined()
  })

  /**
   * **A report with no sections still closes.** The blank layout seeds nothing,
   * so the container returns before the second write and the early return is
   * the only thing that settles the promise.
   */
  it('resolves for a layout that seeds no sections', async () => {
    const onCreate = (await drawn()).onCreate as (c: unknown) => Promise<unknown>
    await expect(onCreate(choice([])), 'a blank report left the dialog open').resolves.toBeUndefined()
  })

  /**
   * **A refused seed must not strand the dialog.** The sections are written
   * after the report exists, so a failure there is not a reason to keep a form
   * whose report the server already has - the container announces it and the
   * dialog closes on the report that landed.
   */
  it('resolves when the report is stored and seeding its sections is refused', async () => {
    seeded = () => Promise.reject(new Error('refused'))
    const onCreate = (await drawn()).onCreate as (c: unknown) => Promise<unknown>
    await expect(
      onCreate(choice([{ position: 0, kind: 'prose', heading: 'Summary', headingKey: 'summary' }])),
      'a refused seed stranded the dialog on a report the server had stored',
    ).resolves.toBeUndefined()
  })
})
