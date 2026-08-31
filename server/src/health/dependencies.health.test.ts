/**
 * What the readiness check may say when a dependency is down. Every case is an
 * attempt to get a secret out of a driver error, the load-bearing one being an
 * error carrying a password: nothing assembled by concatenation passes it.
 */
import { describe, expect, it, vi } from 'vitest'
import { HealthIndicatorService } from '@nestjs/terminus'

import {
  PING_BUDGET_MS,
  PostgresHealth,
  RedisHealth,
  SAFE_REASONS,
  reason,
  withinBudget,
} from './dependencies.health.js'

const indicators = new HealthIndicatorService()

/** An error shaped the way a driver throws one, message and code together. */
function driverError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { code } : {})
}

const SECRET = 's3cr3t-passw0rd'
const URL_ = `postgres://ic_app:${SECRET}@db.internal:5432/incidentcompanion`

describe('choosing a reason a public caller may read', () => {
  /**
   * The whole point of the closed set, stated as an assertion: whatever the
   * driver says, the output is one of seven strings this file lists.
   */
  it.each([
    ['a message quoting the connection string', driverError(`could not connect to ${URL_}`)],
    ['a message quoting host and port', driverError('connect ECONNREFUSED 10.0.0.4:6379')],
    ['a password in the message with no code', driverError(`password "${SECRET}" rejected`)],
    ['an error with an unrecognised code', driverError('boom', 'EWHATEVER')],
    ['a thrown string', `failed against ${URL_}` as unknown as Error],
    ['a thrown null', null as unknown as Error],
    ['a thrown object with a message field', { message: URL_ } as unknown as Error],
  ])('%s yields one of the closed set', (_case, error) => {
    expect(SAFE_REASONS).toContain(reason(error))
  })

  it.each([
    ['the password', SECRET],
    ['the host', 'db.internal'],
    ['the internal address', '10.0.0.4'],
    ['the database name', 'incidentcompanion'],
  ])('never echoes %s', (_what, secret) => {
    const reasons = [
      driverError(`could not connect to ${URL_}`),
      driverError('connect ECONNREFUSED 10.0.0.4:6379', 'ECONNREFUSED'),
      driverError(`password "${SECRET}" rejected`, '28P01'),
    ].map(reason)
    for (const said of reasons) expect(said).not.toContain(secret)
  })

  /**
   * **Distinguishing these is the diagnostic value and it is safe to do.** A
   * SQLSTATE is a fixed vocabulary Postgres defines, so keying on it quotes
   * nothing an operator configured - and "rejected the credentials" versus
   * "refused the connection" is the difference between a wrong password and a
   * database that is not running.
   */
  it.each([
    ['ECONNREFUSED', 'refused the connection'],
    ['ENOTFOUND', 'host not found'],
    ['EAI_AGAIN', 'host not found'],
    ['ECONNRESET', 'connection reset'],
    ['ETIMEDOUT', 'timed out'],
    ['28P01', 'rejected the credentials'],
    ['3D000', 'the database does not exist'],
  ])('reads %s as "%s"', (code, expected) => {
    expect(reason(driverError(`quoting ${URL_}`, code))).toBe(expected)
  })

  it('falls back to the vaguest reason rather than to the message', () => {
    expect(reason(driverError(URL_, 'ENOBODYKNOWS'))).toBe('unavailable')
  })
})

describe('the budget a probe answers within', () => {
  it('rejects work that never settles', async () => {
    await expect(withinBudget(new Promise(() => {}), 20)).rejects.toThrow()
  })

  it('reports a stall as a timeout rather than as something unrecognised', async () => {
    await expect(withinBudget(new Promise(() => {}), 20).catch(reason)).resolves.toBe('timed out')
  })

  /**
   * The off-by-one that would make every check fail: work finishing inside the
   * budget must still resolve, and with its own value.
   */
  it('returns the value when the work beats the budget', async () => {
    await expect(withinBudget(Promise.resolve('PONG'), 1000)).resolves.toBe('PONG')
  })

  it('passes a rejection through untouched, rather than turning it into a timeout', async () => {
    const original = driverError('down', 'ECONNREFUSED')
    await expect(withinBudget(Promise.reject(original), 1000)).rejects.toBe(original)
  })

  /**
   * **A timer left armed holds the event loop open.** Node exits when nothing
   * is pending, so a health check that leaves one behind per call keeps the
   * process alive after a shutdown - invisible in every assertion about the
   * response.
   */
  it('leaves no timer behind once the work has settled', async () => {
    vi.useFakeTimers()
    try {
      await withinBudget(Promise.resolve('done'), 1000)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

/** A pool whose one query does whatever the test says. */
function poolThat(query: () => Promise<unknown>) {
  return { query: vi.fn(query) } as never
}

describe('what the Postgres probe asks', () => {
  it('reports up when the query answers', async () => {
    const health = new PostgresHealth(poolThat(async () => ({ rows: [{ '?column?': 1 }] })), indicators)
    expect(await health.check()).toEqual({ postgres: { status: 'up' } })
  })

  /**
   * **A read, and one that touches no table.** A probe that selected from a
   * case table would fail on an empty install and would be subject to the
   * row-level security scope, which a probe holds none of.
   */
  it('asks for a constant rather than reading a table', async () => {
    const pool = poolThat(async () => ({ rows: [] }))
    await new PostgresHealth(pool, indicators).check()
    const asked = (pool as unknown as { query: { mock: { calls: string[][] } } }).query.mock.calls[0]![0]
    expect(asked!.toLowerCase()).toBe('select 1')
  })

  it('reports down with a safe reason when the query fails', async () => {
    const health = new PostgresHealth(
      poolThat(async () => {
        throw driverError(`could not connect to ${URL_}`, 'ECONNREFUSED')
      }),
      indicators,
    )
    expect(await health.check()).toEqual({
      postgres: { status: 'down', message: 'refused the connection' },
    })
  })

  /**
   * The failure a health check must not have: a pool with no free connection
   * never rejects, it waits. Without a budget the probe waits with it and the
   * endpoint hangs, which every monitor reads as worse than a 503.
   */
  it('answers within the budget when the pool never responds', async () => {
    const health = new PostgresHealth(poolThat(() => new Promise(() => {})), indicators)
    const started = Date.now()
    const out = await health.check()
    expect(out).toEqual({ postgres: { status: 'down', message: 'timed out' } })
    expect(Date.now() - started).toBeLessThan(PING_BUDGET_MS + 1500)
  })
})

/** A Redis probe whose `ping` does whatever the test says. */
function redisThat(ping: () => Promise<string>, lastCode?: string) {
  return { ping: vi.fn(ping), disconnect: vi.fn(), lastFailureCode: () => lastCode } as never
}

describe('what the Redis probe asks', () => {
  it('reports up on a PONG', async () => {
    expect(await new RedisHealth(redisThat(async () => 'PONG'), indicators).check()).toEqual({
      redis: { status: 'up' },
    })
  })

  /**
   * **A resolved promise is not a healthy answer.** A client that has been
   * told to stop, or one answering from a stale buffer, resolves with
   * something else - and treating "it did not throw" as up is how a probe
   * certifies a dependency it never actually reached.
   */
  it.each([['', 'empty'], ['QUEUED', 'a queued reply'], ['pong', 'the wrong case']])(
    'reports down when the reply is %s (%s)',
    async (reply) => {
      const out = await new RedisHealth(redisThat(async () => reply), indicators).check()
      expect(out).toEqual({ redis: { status: 'down', message: 'unavailable' } })
    },
  )

  it('reports down with a safe reason when the ping fails', async () => {
    const health = new RedisHealth(
      redisThat(async () => {
        throw driverError('connect ECONNREFUSED 10.0.0.4:6379', 'ECONNREFUSED')
      }),
      indicators,
    )
    expect(await health.check()).toEqual({
      redis: { status: 'down', message: 'refused the connection' },
    })
  })

  /**
   * **The shape a stopped Redis actually produces, measured rather than
   * imagined.** `ping()` rejects with `MaxRetriesPerRequestError` - no `code`,
   * no own properties, and a message about the retry option rather than about
   * the network. The `ECONNREFUSED` arrived earlier on the client's `error`
   * event. Reading only the rejection, the best answer is "unavailable"; the
   * connection's remembered code is what makes it the useful one.
   */
  it('reads the refusal off the connection when the rejection carries no code', async () => {
    const rejection = new Error('Reached the max retries per request limit (which is 1).')
    const health = new RedisHealth(
      redisThat(async () => {
        throw rejection
      }, 'ECONNREFUSED'),
      indicators,
    )
    expect(await health.check()).toEqual({
      redis: { status: 'down', message: 'refused the connection' },
    })
  })

  it('still says unavailable when neither the rejection nor the connection knows', async () => {
    const health = new RedisHealth(
      redisThat(async () => {
        throw new Error('something nobody has seen')
      }),
      indicators,
    )
    expect(await health.check()).toEqual({ redis: { status: 'down', message: 'unavailable' } })
  })

  /**
   * **The rejection wins when it knows.** Reversing the order would let a
   * stale connection error outrank the actual failure - a wrong password
   * reported as a refused connection because the socket once bounced.
   */
  it('prefers the rejection over a remembered connection failure', async () => {
    const health = new RedisHealth(
      redisThat(async () => {
        throw driverError('nope', 'ECONNRESET')
      }, 'ECONNREFUSED'),
      indicators,
    )
    expect(await health.check()).toEqual({
      redis: { status: 'down', message: 'connection reset' },
    })
  })

  it('answers within the budget when the ping never returns', async () => {
    const health = new RedisHealth(redisThat(() => new Promise(() => {})), indicators)
    expect(await health.check()).toEqual({ redis: { status: 'down', message: 'timed out' } })
  })

  /**
   * **The probe holds a connection of its own and has to give it back.**
   * Without this the socket outlives `SIGTERM` and the process does not exit,
   * which is the same reason `DbModule` ends the pool in a shutdown hook.
   */
  it('closes its own connection on shutdown', () => {
    const client = redisThat(async () => 'PONG')
    new RedisHealth(client, indicators).onApplicationShutdown()
    expect((client as unknown as { disconnect: { mock: { calls: unknown[] } } }).disconnect.mock.calls)
      .toHaveLength(1)
  })
})
