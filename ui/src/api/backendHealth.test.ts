/**
 * What the analyst is told when the backend is not well.
 *
 * **Written against the shapes the server actually sends**, which is why the
 * fixtures are whole Terminus envelopes rather than the two fields this module
 * reads - a route that starts reporting a third dependency must produce a line
 * rather than an empty banner.
 */
import { describe, expect, it } from 'vitest'

import { isStopping, troubleHeading, troubles, type HealthReport } from './backendHealth'

const WELL: HealthReport = { status: 'ok', error: {} }

const REDIS_DOWN: HealthReport = {
  status: 'error',
  error: { redis: { status: 'down', message: 'refused the connection' } },
}

const BOTH_DOWN: HealthReport = {
  status: 'error',
  error: {
    redis: { status: 'down', message: 'refused the connection' },
    postgres: { status: 'down', message: 'timed out' },
  },
}

describe('deciding whether to say anything at all', () => {
  it('says nothing when the backend is well', () => {
    expect(troubles(WELL)).toEqual([])
  })

  /**
   * **Before the first answer arrives, nothing is known.** A banner shown
   * while the probe is still in flight would appear on every page load for as
   * long as the round trip takes, and it would be wrong.
   */
  it('says nothing when there is no report yet', () => {
    expect(troubles(undefined)).toEqual([])
  })

  /**
   * **The top-level status is the verdict; `error` is only its detail.**
   * Found by a break-verify that stayed green: dropping the `status === 'ok'`
   * check changed nothing, because Terminus never puts a recovered indicator
   * in `error`, so the two can never disagree in a real response. That makes
   * the clause unreachable from the server as it stands and load-bearing the
   * moment it is not - this is the case that isolates it.
   */
  it('trusts the verdict over the detail when the two disagree', () => {
    const contradictory: HealthReport = {
      status: 'ok',
      error: { redis: { status: 'down', message: 'refused the connection' } },
    }
    expect(troubles(contradictory)).toEqual([])
  })

  it('names each dependency that is down', () => {
    expect(troubles(BOTH_DOWN).map((one) => one.key)).toEqual(['postgres', 'redis'])
  })

  /** Stable order, so a banner does not reshuffle itself between polls. */
  it('orders them the same way whatever order they arrived in', () => {
    const reversed: HealthReport = {
      status: 'error',
      error: { postgres: { status: 'down' }, redis: { status: 'down' } },
    }
    expect(troubles(BOTH_DOWN)).toEqual(troubles(reversed))
  })
})

describe('what it tells the analyst', () => {
  it('states what they lose rather than which service it is', () => {
    const [redis] = troubles(REDIS_DOWN)
    expect(redis!.consequence).toBe("Other analysts' changes and their presence will not appear.")
  })

  /**
   * **The server's own reason never reaches the screen.** It is written for
   * whoever is fixing the install - "rejected the credentials" is not
   * something an analyst can act on, and it is one word away from naming
   * infrastructure on a screen that should not.
   */
  it.each([
    ['the reason', 'refused the connection'],
    ['the dependency name', 'redis'],
    ['the dependency name', 'postgres'],
  ])('never repeats %s (%s) back to the analyst', (_what, leaked) => {
    const said = troubles(BOTH_DOWN)
      .map((one) => one.consequence)
      .join(' ')
    expect(said.toLowerCase()).not.toContain(leaked)
  })

  /**
   * A probe this file has no wording for still produces a line. The failure
   * to avoid is a banner that appears saying nothing, which reads as a bug in
   * the banner rather than a fault in the backend.
   */
  it('still says something for a dependency it has never heard of', () => {
    const future: HealthReport = { status: 'error', error: { clickhouse: { status: 'down' } } }
    const wrong = troubles(future)
    expect(wrong[0]?.key).toBe('clickhouse')
    // The heading carries it now. It used to be a fallback consequence line,
    // which read as the heading again one tense down.
    expect(wrong[0]?.consequence).toBeUndefined()
    expect(troubleHeading(wrong)).toBe('Clickhouse is not responding')
  })

  /** Two down is one sentence, not two headings. */
  it('names every dependency that is down', () => {
    const both = troubles({
      status: 'error',
      error: { postgres: { status: 'down' }, redis: { status: 'down' } },
    })
    expect(troubleHeading(both)).toBe('The database and the live channel are not responding')
  })
})

describe('an orderly stop is not a fault', () => {
  it('reads shutting_down as stopping', () => {
    expect(isStopping({ status: 'shutting_down' })).toBe(true)
  })

  it.each([
    ['well', WELL],
    ['broken', REDIS_DOWN],
  ])('does not read %s as stopping', (_case, report) => {
    expect(isStopping(report)).toBe(false)
  })
})
