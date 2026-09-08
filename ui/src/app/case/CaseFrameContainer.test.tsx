/**
 * What the container does with a case the server has answered for, and with
 * one it has not answered for yet.
 *
 * **`CaseFrame` is already tested against its own props** -
 * `components/blocks/case-frame.test.tsx` holds what the rail and the
 * header draw. This holds the half that exists only once the frame is bound to
 * its queries: which field becomes which slot, what is drawn while the
 * summary is in flight, and whether a rail row points at this case.
 *
 * Written from the attacks a wiring layer is available to: passing a slot the
 * frame then draws empty, showing a blank head while a request is out, sending
 * every rail row to the same address, and letting the header's roster survive a
 * signed-out session.
 *
 * **The api modules are mocked at their boundary** rather than `fetch` being
 * stubbed: what is under test is which value reaches which prop, and each
 * module's own tests own what it does with a response.
 *
 * **jsdom lays nothing out.** Every element here has a zero box, so nothing
 * below asserts that the rail is beside the pane or that the header is above
 * either - that is `e2e/`'s, and `visual-check`'s. What is readable is which
 * elements exist, what they say, and where their links point.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CaseRailSummary, CaseSummary } from '@/api/case'
import { THEME_OPTIONS } from '@/lib/theme-preference'

import { CaseFrameContainer } from './CaseFrameContainer'

const summary = vi.fn<() => { data: CaseRailSummary | undefined }>()
const cases = vi.fn<() => { data: CaseSummary[] | undefined }>()
const session = vi.fn<() => { userId: string; username: string } | null>()
const noteVisit = vi.fn<(caseId: string | undefined, section: string | undefined) => void>()

vi.mock('@/api/case', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCaseSummary: () => summary(),
  useCases: () => cases(),
  // Two readers of the whole case, both lazy: the chord layer's palette, and
  // the header's key times panel. Nothing here opens either, and what each
  // does with the case is its own test's.
  useCase: () => ({ data: undefined }),
}))
vi.mock('@/api/specs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSpecs: () => ({ data: undefined }),
}))
vi.mock('@/api/useCaseMutation', () => ({
  useCaseMutation: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/api/activity', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivity: () => ({ data: [] }),
}))
// The account dialog the rail's user menu opens reads the roster and holds
// three mutations. Nothing here opens it, and what it writes is its own test's.
vi.mock('@/api/appearance', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAppearances: () => ({ data: undefined }),
  useUploadAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useClearAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useSetAppearance: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/api/presence', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCasePresence: () => ({ roster: [], connected: true }),
}))
vi.mock('@/api/recentCases', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useNoteVisit: (caseId: string | undefined, section: string | undefined) => {
    noteVisit(caseId, section)
  },
}))
vi.mock('@/api/useSession', () => ({ useSession: () => session() }))
vi.mock('@/lib/useGround', () => ({
  useGround: () => ({ theme: 'system', setTheme: vi.fn() }),
}))
// The providers open a socket and read the claims roster; neither says
// anything about which value reaches which slot.
vi.mock('@/app/case/CaseProviders', () => ({
  CaseProvidersLive: ({ children }: { children: React.ReactNode }) => children,
}))

/** A case the server has answered for, with one section carrying a tally. */
const ANSWERED: CaseRailSummary = {
  id: 'c-1',
  title: 'Northwind Freight ransomware',
  reference: 'INC-2026-0447',
  customer: 'Northwind Freight',
  isDemo: false,
  version: 3,
  counts: {} as CaseRailSummary['counts'],
  attention: { timeline: 4 },
  reports: [],
}

beforeEach(() => {
  summary.mockReturnValue({ data: ANSWERED })
  cases.mockReturnValue({ data: [] })
  session.mockReturnValue({ userId: 'u-1', username: 'r.okonkwo@example.test' })
  noteVisit.mockReset()
})

function mount(at = '/cases/c-1/timeline') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/cases/:caseId" element={<CaseFrameContainer />}>
          <Route path=":section" element={<div>the section renders here</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('the case the frame is drawn for', () => {
  /**
   * The reference is what an analyst calls the case and the id is a uuid
   * nobody reads, so drawing the wrong one is a rail head that is technically
   * correct and useless.
   */
  it('heads the rail with the case reference', () => {
    mount()
    const rail = screen.getByTestId('rail')
    expect(within(rail).getByText('INC-2026-0447')).toBeInTheDocument()
    expect(within(rail).getByText('Northwind Freight')).toBeInTheDocument()
  })

  /**
   * **The one state a fallback of `''` destroys.** A summary in flight is the
   * first frame of every case, and a blank head there is indistinguishable
   * from a case with no reference - which is a real case, and the id is the
   * honest answer for both.
   */
  it('falls back to the case id while the summary is in flight', () => {
    summary.mockReturnValue({ data: undefined })
    mount()
    expect(within(screen.getByTestId('rail')).getByText('c-1')).toBeInTheDocument()
  })

  /**
   * A rail whose rows all point at the same place is the defect `hrefFor`
   * exists to make impossible, and it renders perfectly.
   */
  it('points every rail row at this case`s own section', () => {
    mount()
    const rail = screen.getByTestId('rail')
    const hrefs = [...rail.querySelectorAll('a[href]')].map((one) => one.getAttribute('href'))
    expect(hrefs).toContain('/cases/c-1/timeline')
    expect(hrefs).toContain('/cases/c-1/evidence')
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  /** A case id with a slash or a space in it must not open a second path. */
  it('encodes the case id it builds a row`s address from', () => {
    const rail = mount('/cases/a%2Fb/timeline').container.querySelector('[data-testid="rail"]')
    const hrefs = [...(rail?.querySelectorAll('a[href]') ?? [])].map((one) =>
      one.getAttribute('href'),
    )
    expect(hrefs).toContain('/cases/a%2Fb/timeline')
  })

  it('draws the routed section in the pane', () => {
    const { container } = mount()
    const pane = container.querySelector('[data-slot="pane-scroll"]')
    expect(pane?.textContent).toContain('the section renders here')
  })
})

/**
 * **Where the analyst was is the picker's business and the frame's to record.**
 *
 * The picker's Continue reads it, so a frame that drops the call leaves every
 * case opening on its first section - which reads as the feature having been
 * removed rather than as a wiring layer forgetting one hook, and nothing else
 * in this tier makes the call.
 */
describe('the visit the frame records', () => {
  it('records the case and the section the analyst is standing on', () => {
    mount('/cases/c-1/evidence')
    expect(noteVisit).toHaveBeenCalledWith('c-1', 'evidence')
  })
})

describe('what the case header carries', () => {
  /**
   * **`CaseFrame` takes an optional `headerEnd`, and the gallery's chrome
   * fixture fills it.** A container passing nothing leaves every story showing
   * a control the running application does not have.
   *
   * Asserted from the container rather than the frame, because the frame draws
   * whatever it is handed and the handing is what can be wrong.
   */
  it('gives the header the key times trigger', () => {
    mount()
    expect(screen.getByRole('button', { name: 'Key times' })).toBeInTheDocument()
  })

  /**
   * The roster is the case's, so it is drawn whether or not this section
   * asked - and it must not survive a session that has gone.
   */
  it('draws no signed-in row when nobody is signed in', () => {
    session.mockReturnValue(null)
    mount()
    expect(screen.queryByTestId('rail-user')).toBeNull()
  })

  /** And draws it when somebody is, which is the only control that signs out. */
  it('draws the signed-in analyst at the foot of the rail', () => {
    mount()
    expect(screen.getByTestId('rail-user')).toHaveAccessibleName(
      'r.okonkwo@example.test. Session menu',
    )
  })
})

/**
 * **Both menus are rows the frame puts inside a menu it owns.**
 *
 * React Aria builds a menu's children into a collection, and a node it does not
 * understand is dropped rather than refused - so a menu that renders as an
 * empty surface is the failure mode, and it is silent in every other tier. The
 * only way to see it is to open the menu and read what is in it.
 */
describe('the menus the rail opens', () => {
  it('offers a way out of the case, and the other cases', async () => {
    const user = userEvent.setup()
    cases.mockReturnValue({
      data: [
        { id: 'c-1', reference: 'INC-2026-0447' },
        { id: 'c-2', reference: 'INC-2026-0431' },
      ] as CaseSummary[],
    })
    mount()

    await user.click(screen.getByTestId('rail-header'))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'All cases' })).toBeInTheDocument()
    // The case you are standing in is not a destination; the other one is.
    expect(within(menu).getByRole('menuitem', { name: 'INC-2026-0431' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'INC-2026-0447' })).toBeNull()
  })

  it('offers the account, every ground, and the way out', async () => {
    const user = userEvent.setup()
    mount()

    await user.click(screen.getByTestId('rail-user'))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Your account' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    // Read off `THEME_OPTIONS` rather than named here, so a fourth ground is a
    // change in one list and not in this assertion as well.
    const grounds = THEME_OPTIONS.map((one) => one.label).sort()
    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((one) => one.textContent)
        .sort(),
    ).toEqual(grounds)
  })
})
