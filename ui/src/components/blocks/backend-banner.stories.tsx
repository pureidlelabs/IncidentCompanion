import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

import type { HealthReport } from '@/api/backendHealth'
import { keys } from '@/api/queryKeys'

import { BackendBanner } from './backend-banner'

/**
 * The one thing on screen when the backend cannot serve.
 *
 * **It exists because every other failure signal is per-request.** A
 * dependency going down turns every screen into its own error state -- an
 * empty table, a save that refuses, a socket that quietly stops delivering --
 * and none of them says the cause is one thing rather than the screen the
 * analyst is looking at. Redis is the worst of them: reads and writes keep
 * working, so the app looks well while another analyst's changes stop
 * arriving.
 *
 * **Fixed at the bottom centre, which is the one place left.** A top strip
 * covers the picker's "Search cases" box, the control an analyst reaches for
 * first; the rail owns the left, its footer the bottom-left, and the toaster
 * and ground switcher the bottom-right.
 *
 * **Not a toast.** A toast is dismissible and time-limited; this is a
 * condition, and it must not be possible to wave away a state that is still
 * true.
 *
 * Each story hands the health query its answer directly, so the banner reads
 * the report it would read in the app.
 */
const meta = {
  title: 'Blocks/Notice/Backend banner',
  component: BackendBanner,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BackendBanner>

export default meta
type Story = StoryObj<typeof meta>

/** A page behind it, so the banner is judged over content rather than over nothing. */
function Behind({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-80 overflow-hidden rounded-lg border">
      <div className="p-4 text-sm text-ink-muted">
        <p className="mb-2 font-medium text-ink">Systems</p>
        <p>FIN-WS-04 &mdash; workstation</p>
        <p>FIN-DC-01 &mdash; domain controller</p>
        <p>MX-EDGE-02 &mdash; mail gateway</p>
      </div>
      {children}
    </div>
  )
}

/** Seeds the health query, so nothing here depends on a server being up. */
function Served({ report }: { report: HealthReport }) {
  const [client] = useState(() => {
    const made = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    made.setQueryData(keys.health(), report)
    return made
  })
  return (
    <QueryClientProvider client={client}>
      <Behind>
        <BackendBanner />
      </Behind>
    </QueryClientProvider>
  )
}

/** All well: the banner renders nothing at all. */
export const Well: Story = {
  render: () => <Served report={{ status: 'ok' }} />,
  play: async ({ canvas }) => {
    // Nothing at all. A banner that drew an "all well" line would sit over
    // the page saying something nobody needs to be told.
    await expect(canvas.queryByTestId('backend-banner')).toBeNull()
  },
}

/**
 * Postgres down. The consequence, never the dependency's name: "Redis is down"
 * is a fact about the server room, and "nothing can be loaded or saved" is the
 * thing that changes what the analyst does next.
 */
export const PostgresDown: Story = {
  render: () => (
    <Served report={{ status: 'error', error: { postgres: { status: 'down' } } }} />
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Nothing can be loaded or saved.')).toBeVisible()
    await expect(canvas.queryByText(/Postgres/i)).toBeNull()
  },
}

/** Redis down: the quiet one, where the app looks well and is not. */
export const RedisDown: Story = {
  render: () => <Served report={{ status: 'error', error: { redis: { status: 'down' } } }} />,
  play: async ({ canvas }) => {
    // The quiet one: reads and writes keep working, so nothing else on the
    // screen will ever say that another analyst's changes have stopped
    // arriving. This line is the only account of it.
    await expect(
      await canvas.findByText("Other analysts' changes and their presence will not appear."),
    ).toBeVisible()
  },
}

/** Both, sorted by key, one line each. */
export const BothDown: Story = {
  render: () => (
    <Served
      report={{
        status: 'error',
        error: { postgres: { status: 'down' }, redis: { status: 'down' } },
      }}
    />
  ),
  play: async ({ canvas }) => {
    // One line each rather than the first one found: two dependencies down
    // has two consequences, and reporting one of them describes half of what
    // has stopped working.
    await expect(await canvas.findByText('Nothing can be loaded or saved.')).toBeVisible()
    await expect(
      canvas.getByText("Other analysts' changes and their presence will not appear."),
    ).toBeVisible()
  },
}

/**
 * A dependency nobody wrote a consequence for still produces a line. One added
 * later and left undescribed would otherwise fail silently into an empty
 * banner, which is the one outcome worse than clumsy wording.
 */
export const UndescribedDependency: Story = {
  render: () => (
    <Served report={{ status: 'error', error: { objectstore: { status: 'down' } } }} />
  ),
  play: async ({ canvas }) => {
    const banner = within(await canvas.findByTestId('backend-banner'))
    await expect(banner.getByText(/Objectstore/i)).toBeVisible()
  },
}

/** Shutting down: work in progress will not be saved once it stops. */
export const ShuttingDown: Story = {
  render: () => <Served report={{ status: 'shutting_down' }} />,
  play: async ({ canvas }) => {
    // Not a dependency being down: the server is going away on purpose, and
    // what the analyst needs to know is that anything half-written now is
    // lost when it stops.
    await expect(await canvas.findByText('The server is shutting down')).toBeVisible()
    await expect(
      canvas.getByText('Work in progress will not be saved once it stops.'),
    ).toBeVisible()
  },
}

/**
 * The probe itself failed, so there is no report and the server is likely
 * unreachable entirely. **Saying which dependency would be a guess**, so it
 * says neither.
 *
 * Reached by refusing the fetch rather than by seeding a report, because that
 * is the only thing that produces this state: it is the query's own error, not
 * a 503 body. Takes a moment to arrive -- the query retries once first.
 */
export const NotResponding: Story = {
  render: () => <Refusing />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('The server is not responding', undefined, { timeout: 5000 }),
    ).toBeVisible()
    await expect(canvas.queryByText(/database|live channel/i)).toBeNull()
  },
}

/**
 * Refuses the health probe for as long as it is mounted, and puts the real
 * `fetch` back on the way out -- a patched global left behind would follow the
 * reader into every other story on the page.
 */
function Refusing() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }))
  const [real] = useState(() => {
    const before = globalThis.fetch.bind(globalThis)
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      // `Request` stringifies to `[object Object]`, so read its `url` instead.
      (input instanceof Request ? input.url : String(input)).includes('/health')
        ? Promise.reject(new TypeError('Failed to fetch'))
        : before(input, init))
    return before
  })
  useEffect(() => () => {
    globalThis.fetch = real
  }, [real])

  return (
    <QueryClientProvider client={client}>
      <Behind>
        <BackendBanner />
      </Behind>
    </QueryClientProvider>
  )
}
