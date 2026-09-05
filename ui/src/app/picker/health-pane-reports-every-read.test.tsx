/**
 * The Health pane makes three reads, and a failure of any of them is an
 * answer.
 */
import { render, screen } from '@testing-library/react'
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
})
