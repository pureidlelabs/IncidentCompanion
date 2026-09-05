import { Client } from 'pg'
import { afterEach, describe, expect, it } from 'vitest'

import { ADMIN_URL, takeRunLock } from './global-setup.js'

/**
 * The interlock between two concurrent suites, exercised rather than asserted.
 *
 * **This is the defect it exists for, in one sentence**: there is one test
 * database, `global-setup` opens by dropping it `with (force)`, and `with
 * (force)` terminates every other connection to it. A second `vitest run`
 * therefore recreates the database underneath the first, which then fails with
 * `relation "cases" does not exist` from whichever files it had reached.
 * Measured 2026-08-19: 34 failures across 5 files, all green on a re-run.
 *
 * **A re-run passing is the whole problem.** It reads as flake, so the answer
 * is "run it again" and the mechanism is never looked at. What is asserted
 * here is that the second run *waits* -- and that it says why when it will not.
 */

const ADMIN = ADMIN_URL

/**
 * **Not the key the suite itself is holding.** `globalSetup` takes
 * `RUN_LOCK_KEY` before the drop and holds it until `teardown`, so a test
 * asking for the same key inside that run waits for a lock its own process
 * owns and times out -- which is the mechanism working, and useless as an
 * assertion.
 */
const TEST_KEY = 8_615_232

/**
 * **Named rather than skipped in silence.** A tier that vanishes when no server
 * is reachable reads exactly like one that passed, which is the shape
 * `test_scope.py` and the visual sweep both go out of their way to avoid.
 */
const reachable = await (async () => {
  const probe = new Client({ connectionString: new URL('/postgres', ADMIN).toString() })
  try {
    await probe.connect()
    await probe.end()
    return true
  } catch {
    console.warn('run-lock.test.ts skipped: no database server at ' + ADMIN)
    return false
  }
})()

let holder: Client | undefined
let second: Client | undefined

afterEach(async () => {
  await second?.end()
  await holder?.end()
  second = undefined
  holder = undefined
})

describe.runIf(reachable)('the run lock', () => {
  it('refuses the second run rather than letting it drop the database', async () => {
    holder = await takeRunLock(ADMIN, 1000, TEST_KEY)

    // A zero wait, so the refusal is the assertion rather than the timing.
    await expect(takeRunLock(ADMIN, 0, TEST_KEY)).rejects.toThrow(/Another test run holds the database lock/)
  })

  /**
   * **The message is the deliverable, not the throw.** Whoever meets this is
   * looking at a suite that will not start, and the thing they need is that
   * nothing is broken and nothing needs cleaning up.
   */
  it('states the reason and that there is nothing to clean up', async () => {
    holder = await takeRunLock(ADMIN, 1000, TEST_KEY)
    await expect(takeRunLock(ADMIN, 0, TEST_KEY)).rejects.toThrow(/with \(force\)/)
    await expect(takeRunLock(ADMIN, 0, TEST_KEY)).rejects.toThrow(/released when its connection closes/)
  })

  /**
   * **Released by closing the connection**, which is why this is an advisory
   * lock and not a lockfile: a killed run leaves no stale marker and needs no
   * staleness timeout to guess at.
   */
  it('hands the lock straight to the next run once the holder disconnects', async () => {
    holder = await takeRunLock(ADMIN, 1000, TEST_KEY)
    await holder.end()
    holder = undefined

    second = await takeRunLock(ADMIN, 1000, TEST_KEY)
    expect(second).toBeDefined()
  })

  it('waits for a holder that finishes, rather than refusing outright', async () => {
    holder = await takeRunLock(ADMIN, 1000, TEST_KEY)
    const holding = holder
    holder = undefined
    // Freed after the second run has already started waiting, which is the
    // ordinary case: a landing's full suite and an agent's subset.
    setTimeout(() => void holding.end(), 300)

    second = await takeRunLock(ADMIN, 30_000, TEST_KEY)
    expect(second).toBeDefined()
  })
})
