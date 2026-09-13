/**
 * **A wait for a connection ends in an answer rather than never.**
 *
 * A read issued against the pool from inside an open transaction holds one
 * connection while asking for another. With no deadline `pg` queues that second
 * ask with no bound, so the request, the suite and the tier all stop with
 * nothing said -- which is the half of #556 that could not be read.
 *
 * **The deadline does not prevent the mistake.** `db/scope.ts` is what says
 * every read goes on the handle it was given. This is what makes breaking that
 * rule reportable.
 *
 * **Measured rather than reasoned about**, because the claim is about what `pg`
 * does to a *queued* ask on an exhausted pool, and its documented behaviour for
 * a full pool is to queue until a client is released. The case below is that
 * exact state.
 */
import { Pool } from 'pg'
import { describe, expect, it } from 'vitest'

import { createPool } from './client.js'

const URL_ = process.env['DATABASE_URL'] ?? ''

describe('a pool with no connection left', () => {
  it('gives every pool this app opens a deadline', () => {
    const pool = createPool('postgres://nobody@127.0.0.1:1/none')

    expect(
      (pool.options as { connectionTimeoutMillis?: number }).connectionTimeoutMillis,
      'a pool was opened with no deadline, so a wait on it has no bound',
    ).toBeGreaterThan(0)
  })

  it.skipIf(!URL_)('answers the second ask instead of queueing it for ever', async () => {
    // One second rather than the configured ten: the property is that the wait
    // ends, and the number is the caller's.
    const pool = new Pool({ connectionString: URL_, max: 1, connectionTimeoutMillis: 1_000 })
    const held = await pool.connect()

    const began = Date.now()
    let why = ''
    try {
      await pool.connect()
    } catch (error) {
      why = error instanceof Error ? error.message : String(error)
    }
    const waited = Date.now() - began

    held.release()
    await pool.end()

    expect(why, 'the second ask was answered with a connection, so the pool was not full').toMatch(
      /timeout/i,
    )
    expect(waited, 'the wait was not bounded by the deadline').toBeLessThan(5_000)
  }, 20_000)
})
