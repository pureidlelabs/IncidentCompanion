/**
 * The Health pane makes three reads, and a failure of any of them is an
 * answer.
 *
 * **The attack this is written from: fail the two that are not the one the
 * container happened to wire up.** The pane took `problem` from the activity
 * read alone, so a readiness probe or a resources read that failed left
 * `busy` false, `problem` undefined, and the figures drawn from `undefined` --
 * blanks and dashes, with no failure stated and nothing to retry. An operator
 * opening Health during an incident asks one question, and blanks answer it
 * confidently and wrongly.
 *
 * **The reads are mocked at their module boundary** rather than `fetch` being
 * stubbed: what is under test is which value reaches which prop, and each
 * hook's own tests own what it does with a response.
 */
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HealthPaneView } from './panes'

/** As much of a query's answer as the pane reads. */
interface Read {
  data: unknown
  isPending: boolean
  error: Error | null
  refetch: () => void
}

const answered = (data: unknown): Read => ({
  data,
  isPending: false,
  error: null,
  refetch: vi.fn(),
})
const failed = (message: string): Read => ({
  data: undefined,
  isPending: false,
  error: new Error(message),
  refetch: vi.fn(),
})

/** Enough of a resources answer for the gauges to draw. */
const RESOURCES = {
  uptimeSeconds: 60,
  memory: {
    rssBytes: 100,
    heapUsedBytes: 50,
    heapTotalBytes: 100,
    systemTotalBytes: 1000,
    systemFreeBytes: 500,
    containerLimitBytes: null,
    containerUsedBytes: null,
  },
  cpu: { cores: 4, loadAverage: [0, 0, 0], processPercent: null },
  disk: null,
}

/** Enough of an activity answer for the figures and the tables to draw. */
const ACTIVITY = {
  database: { sizeBytes: 1000, connections: 1, maxConnections: 10, where: 'local' },
  redis: { where: 'local' },
  tables: [],
  cases: { total: 3, open: 2, closed: 1, demo: 1 },
  accounts: { total: 2, admins: 1, analysts: 1 },
}

const probe = vi.fn<() => Read>()
const resources = vi.fn<() => Read>()
const activity = vi.fn<() => Read>()

vi.mock('@/api/useBackendHealth', () => ({ useBackendHealth: () => probe() }))
vi.mock('@/api/useInstallHealth', () => ({
  useResources: () => resources(),
  useActivity: () => activity(),
}))
vi.mock('@/api/session', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAnalyst: () => 'analyst@example.test',
}))

describe('the Health pane reports every read it makes', () => {
  beforeEach(() => {
    probe.mockReturnValue(answered({ ok: true, checks: [] }))
    resources.mockReturnValue(answered(RESOURCES))
    activity.mockReturnValue(answered(ACTIVITY))
  })

  it('states a readiness probe that failed', () => {
    probe.mockReturnValue(failed('The readiness probe did not answer.'))
    render(<HealthPaneView onPane={vi.fn()} userMenu={null} onAbout={vi.fn()} />)
    expect(screen.getByText(/readiness probe did not answer/i)).toBeInTheDocument()
  })

  it('states a resources read that failed', () => {
    resources.mockReturnValue(failed('The resources read did not answer.'))
    render(<HealthPaneView onPane={vi.fn()} userMenu={null} onAbout={vi.fn()} />)
    expect(screen.getByText(/resources read did not answer/i)).toBeInTheDocument()
  })

  /**
   * The half that says the two above are not passing for the wrong reason: a
   * pane that reported a failure whatever happened would satisfy both.
   */
  it('states nothing when all three answered', () => {
    render(<HealthPaneView onPane={vi.fn()} userMenu={null} onAbout={vi.fn()} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * The scope is asserted inside the header that carries the verdicts, not
   * anywhere on the pane: the same words in the blurb or under Postgres would
   * qualify a different set of rows and pass a check written against the page.
   *
   * Driven with real dependency verdicts, because the section renders one row
   * per entry in `details` -- the shared fixture carries none, so a check on
   * the default would describe a section holding nothing but `Server`.
   *
   * What no case here covers is whether the words sit beside the title or
   * under it. jsdom lays nothing out, and the two read differently: stacked,
   * at the title's own size, it reads as a second title.
   */
  it('says what the serving verdicts were polled from, in their own header', () => {
    probe.mockReturnValue(
      answered({ ok: true, checks: [], details: { postgres: 'up', redis: 'up' } }),
    )
    render(<HealthPaneView onPane={vi.fn()} userMenu={null} onAbout={vi.fn()} />)

    const header = screen.getByText('Serving').closest('[data-part="frame-header"]')
    expect(header, 'no Serving header, so this asserts nothing').not.toBeNull()
    expect(
      within(header as HTMLElement).getByText(/this server/i),
      'the verdicts are stated without saying what was polled',
    ).toBeVisible()
  })
})
