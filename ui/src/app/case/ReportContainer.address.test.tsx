/**
 * **A report's address, driven through the real screen and a real history.**
 *
 * The screen is not mocked: a mocked one leaves only prop plumbing under test,
 * which a container that pushes rather than replaces, or that wipes the rest of
 * the address, or that hands `openId` to a screen ignoring it, all satisfy.
 *
 * `BrowserRouter` rather than `MemoryRouter`, because `useCommandRequest`
 * writes `window.history` directly and a memory history cannot see that.
 *
 * What this does not reach: the browser's own Back, which no jsdom history
 * implements. The scenarios here move the address and let the router hear it.
 *
 * No module is mocked: the case and the report catalogue reach the container
 * through the real hooks and request layer, from a model of the network.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setSession } from '@/api/session'
import { setTransport } from '@/api/transport'
import { EntityCardProvider } from '@/components/blocks/entity-card'
import { CaseFrame } from '@/components/blocks/case-frame'
import reportLayouts from '@/demo/catalogue/report-layouts.json'
import { DEMO_BLOCKS, DEMO_REPORTS, demoReport } from '@/fixtures/report-demo'
import { AriaRouter } from '@/components/ui/aria-router'
import { campaignCase } from '@/fixtures/campaign'

import { ReportContainer } from './ReportContainer'

const CASE = campaignCase.id
const FIRST = demoReport(0)
const SECOND = demoReport(1)

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )

/** The reads the report section makes, answered as the server answers them. */
function server(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString(), 'http://ic.test')
  if ((init?.method ?? 'GET') !== 'GET') return json(405, { message: 'this file writes nothing' })
  if (url.pathname === `/api/cases/${CASE}`) {
    return json(200, { ...campaignCase, reportBlocks: DEMO_BLOCKS })
  }
  if (url.pathname === '/api/report-layouts') return json(200, reportLayouts)
  if (url.pathname === '/api/report-block-kinds') return json(200, { groups: [] })
  if (url.pathname === '/api/regimes') return json(200, { enabled: false, regimes: {} })
  return json(404, { message: `unmodelled ${url.pathname}` })
}

beforeEach(() => {
  setTransport(server)
  setSession({ userId: 'u-ada', username: 'Ada' })
})

/**
 * The frame as the app mounts it: the rail draws the reports, and reads which
 * one is open off the address rather than being told.
 *
 * **`AriaRouter`, because the rail's rows are links.** Without the provider a
 * React Aria link with an `href` is a plain anchor, and jsdom answers a real
 * navigation with *Not implemented* and an address that never moved -- so every
 * assertion here would read the click as having done nothing.
 */
function Framed({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const report = useSearchParams()[0].get('report')
  return (
    <AriaRouter
      navigate={(path, options) => {
        void navigate(path, options as never)
      }}
    >
      <CaseFrame
        section="report"
        caseName={CASE}
        reports={DEMO_REPORTS}
        openReport={report}
        hrefFor={(slug) => `/cases/${CASE}/${slug}`}
      >
        {children}
      </CaseFrame>
    </AriaRouter>
  )
}

/** The container under a route that carries a case id, at the given address. */
function at(address: string) {
  window.history.replaceState({}, '', address)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <EntityCardProvider caseId={CASE}>
          <Framed>
            <Routes>
              <Route path="/cases/:caseId/:section" element={<ReportContainer />} />
            </Routes>
          </Framed>
        </EntityCardProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  )
}

/**
 * Move the address the way the browser does, without remounting the container.
 *
 * The app renders one route element per section, so an address change
 * re-renders the container in place -- which is the case a remount hides.
 */
function goTo(address: string) {
  window.history.pushState({}, '', address)
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

/** Whether the pane drew this report's document, by its own title. */
function drew(label: string): boolean {
  return screen.queryByRole('heading', { level: 1, name: label }) !== null
}

/** Open a report the way an analyst does, from the rail rows the section adds. */
async function open(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  const subrail = await screen.findByTestId('report-subrail')
  await user.click(within(subrail).getByText(label))
}

afterEach(() => {
  window.history.replaceState({}, '', '/')
  setTransport((input, init) => fetch(input, init))
})

describe('a report has an address', () => {
  it('opens the report the address names', async () => {
    at(`/cases/${CASE}/report?report=${FIRST.id}`)

    await waitFor(() => {
      expect(drew(FIRST.label), 'the address named a report and the pane drew none').toBe(true)
    })
  })

  /** No `?report=`, so the section opens on the index rather than on a guess. */
  it('opens the index when the address names none', async () => {
    at(`/cases/${CASE}/report`)

    await screen.findByTestId('report-subrail')
    expect(drew(FIRST.label), 'the address named no report and the pane opened one').toBe(false)
  })

  /**
   * The container re-renders rather than remounting, so a screen holding the
   * first `openId` in state stays on the report it opened with.
   */
  it('follows the address to a second report without remounting', async () => {
    at(`/cases/${CASE}/report?report=${FIRST.id}`)
    await waitFor(() => {
      expect(drew(FIRST.label)).toBe(true)
    })

    goTo(`/cases/${CASE}/report?report=${SECOND.id}`)

    await waitFor(() => {
      expect(
        drew(SECOND.label),
        'the address named the second report and the screen stayed on the first',
      ).toBe(true)
    })
    expect(drew(FIRST.label)).toBe(false)
  })

  it('follows the address back to the index', async () => {
    at(`/cases/${CASE}/report?report=${FIRST.id}`)
    await waitFor(() => {
      expect(drew(FIRST.label)).toBe(true)
    })

    goTo(`/cases/${CASE}/report`)

    await waitFor(() => {
      expect(drew(FIRST.label), 'the address dropped the report and the screen kept it').toBe(false)
    })
  })

  it('writes the report into the address when one is opened', async () => {
    const user = userEvent.setup()
    at(`/cases/${CASE}/report`)

    await open(user, FIRST.label)

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('report')).toBe(FIRST.id)
    })
  })

  /**
   * `replace`, so opening three reports in a row leaves Back going to whatever
   * preceded the section rather than walking them.
   */
  it('replaces the address rather than stacking an entry per report', async () => {
    const user = userEvent.setup()
    at(`/cases/${CASE}/report`)
    await screen.findByTestId('report-subrail')
    const before = window.history.length

    await open(user, FIRST.label)
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('report')).toBe(FIRST.id)
    })

    expect(window.history.length, 'opening a report pushed a history entry').toBe(before)
  })

  /**
   * The address is shared, so a write that rebuilds it from scratch drops
   * whatever else the section put there.
   */
  it('leaves the rest of the address alone', async () => {
    const user = userEvent.setup()
    at(`/cases/${CASE}/report?highlight=ada`)

    await open(user, FIRST.label)

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('report')).toBe(FIRST.id)
    })
    expect(
      new URLSearchParams(window.location.search).get('highlight'),
      'opening a report wiped a parameter that was not its own',
    ).toBe('ada')
  })

  /**
   * `useCommandRequest` clears `?do=` outside the router, so the router holds a
   * command the address bar no longer carries. A write built from the router's
   * copy puts it back, and the hook -- which has no dependency array -- runs it
   * again on the next render.
   */
  it('leaves the New report dialog shut after the command that opened it', async () => {
    const user = userEvent.setup()
    at(`/cases/${CASE}/report?do=new-report`)

    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryAllByRole('dialog')).toEqual([])
    })

    await open(user, FIRST.label)
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('report')).toBe(FIRST.id)
    })

    expect(
      screen.queryAllByRole('dialog').map((node) => node.textContent),
      'the New report dialog reopened by itself',
    ).toEqual([])
  })

  /**
   * **The rail's door, followed rather than composed.** The row is a link
   * carrying `?do=new-report`, and asserting the href says the address was
   * built, never that following it reaches the dialog -- which is the whole
   * round trip: the link navigates, the hook reads the command off the address
   * and clears it, and the screen that owns the control opens.
   *
   * Here rather than in a story: the gallery's router is a `MemoryRouter`, and
   * `useCommandRequest` reads `window.location`, which a memory history never
   * writes.
   */
  it('opens the dialog when the rail door is followed', async () => {
    const user = userEvent.setup()
    at(`/cases/${CASE}/report`)

    const subrail = await screen.findByTestId('report-subrail')
    await user.click(within(subrail).getByText('New report'))

    await waitFor(() => {
      expect(screen.queryAllByRole('dialog')).toHaveLength(1)
    })
    // Cleared as it runs, so a reload does not open it again.
    expect(new URLSearchParams(window.location.search).get('do')).toBeNull()
  })

  /**
   * The door keeps the analyst's place, so cancelling gives back the report
   * they were reading rather than the index.
   */
  it('keeps the open report when the rail door is followed', async () => {
    const user = userEvent.setup()
    at(`/cases/${CASE}/report?report=${FIRST.id}`)
    await waitFor(() => {
      expect(drew(FIRST.label)).toBe(true)
    })

    const subrail = await screen.findByTestId('report-subrail')
    await user.click(within(subrail).getByText('New report'))

    await waitFor(() => {
      expect(screen.queryAllByRole('dialog')).toHaveLength(1)
    })
    expect(
      new URLSearchParams(window.location.search).get('report'),
      'the door dropped the report the analyst was reading',
    ).toBe(FIRST.id)
  })
})
