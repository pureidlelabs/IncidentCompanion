/**
 * When the outage banner draws, and what it says in each of its three states.
 *
 * **The branches are the point.** A dependency down, the probe itself failing,
 * and an orderly shutdown are three different sentences, and the pure logic in
 * `backendHealth` can only see the first - the other two are decided here, off
 * the query's own state.
 *
 * The banner is `role="alert"`, so every assertion goes through the role
 * rather than through a test id: an outage announcing itself to a screen
 * reader is most of why this is an `Alert` and not a styled `div`.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { HealthReport } from '@/api/backendHealth'

const health = vi.hoisted(() => ({ result: {} }))

vi.mock('@/api/useBackendHealth', () => ({
  useBackendHealth: () => health.result,
}))

const { BackendBanner } = await import('./backend-banner')

function showing(result: { data?: HealthReport; isError?: boolean }) {
  health.result = { isError: false, ...result }
  return render(<BackendBanner />)
}

describe('when it stays out of the way', () => {
  it('draws nothing while the backend is well', () => {
    showing({ data: { status: 'ok', error: {} } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  /**
   * **Before the first poll answers, nothing is known.** Drawing here would
   * put an outage banner on screen for the length of one round trip on every
   * single page load.
   */
  it('draws nothing before the first answer', () => {
    showing({})
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('when a dependency is down', () => {
  const REDIS_DOWN: HealthReport = {
    status: 'error',
    error: { redis: { status: 'down', message: 'refused the connection' } },
  }

  it('says what the analyst loses', () => {
    showing({ data: REDIS_DOWN })
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Other analysts' changes and their presence will not appear.",
    )
  })

  it('tells them it will clear itself, so they do not reload', () => {
    showing({ data: REDIS_DOWN })
    expect(screen.getByRole('alert')).toHaveTextContent('Retrying every few seconds.')
  })

  /**
   * **The server's reason is for whoever is fixing the install.** It stays in
   * the JSON; putting "refused the connection" on an analyst's screen names
   * infrastructure they cannot act on.
   */
  it('never repeats the server\u2019s own reason', () => {
    showing({ data: REDIS_DOWN })
    expect(screen.getByRole('alert')).not.toHaveTextContent('refused the connection')
  })

  it('lists every dependency that is down, not just the first', () => {
    showing({
      data: {
        status: 'error',
        error: { redis: { status: 'down' }, postgres: { status: 'down' } },
      },
    })
    const said = screen.getByRole('alert').textContent
    expect(said).toContain('Nothing can be loaded or saved.')
    expect(said).toContain("Other analysts' changes")
  })
})

describe('when the probe itself fails', () => {
  /**
   * **A failed probe is not a dependency being down**, and must not name one:
   * there is no report, so which half is broken is unknown. The likeliest
   * cause is that the server is not there at all.
   */
  it('says the server is not responding and names no dependency', () => {
    showing({ isError: true })
    const said = screen.getByRole('alert').textContent
    expect(said).toContain('The server is not responding')
    expect(said).not.toContain("Other analysts'")
  })

  /** A stale healthy report must not talk the banner out of the failure. */
  it('reports the failure even when the last good answer is still cached', () => {
    showing({ isError: true, data: { status: 'ok', error: {} } })
    expect(screen.getByRole('alert')).toHaveTextContent('The server is not responding')
  })
})

describe('when the server is stopping', () => {
  /**
   * An orderly shutdown is not a fault - reporting it as a broken dependency
   * sends someone to debug a server doing exactly what it was asked.
   */
  it('says it is shutting down rather than that something is broken', () => {
    showing({ data: { status: 'shutting_down' } })
    const said = screen.getByRole('alert').textContent
    expect(said).toContain('The server is shutting down')
    expect(said).not.toContain('not working')
  })
})
