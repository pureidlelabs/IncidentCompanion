/**
 * **Two claims arriving together produce one administrator.**
 *
 * *Claiming MUST be atomic: two claims arriving together MUST produce one
 * administrator.* The claim was four awaits with nothing holding them
 * together -- count the accounts, check the token, sign up, promote -- so two
 * callers for different usernames who both passed the count both signed up,
 * and each promoted its own row by its own `where`. The controller's own
 * comment names the outcome: *a privilege escalation the moment two callers
 * race the check above*. -> #205
 *
 * **Driven concurrently against a real database**, because the claim is that
 * two callers arriving at once produce one winner, and nothing about that is
 * visible to a test that calls once.
 *
 * **What this does not cover, and the reason is recorded rather than assumed:**
 * the whole claim through the HTTP door. That needs an install holding no
 * accounts, and this suite runs against a database that already holds the
 * personas every other file depends on -- which is why three scenarios under
 * this requirement stay undemonstrated. `claiming-an-install.test.ts` states
 * the same gap. What is asserted here is the step those three turn on, and
 * that the controller asks it before it promotes anybody.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { takeTheClaim } from './claim.js'
import { installClaim, ONLY_CLAIM } from '../db/schema/install-claim.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env['DATABASE_URL'] ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/** One caller's whole act: take the install, and act on winning. */
const claimOnce = (work?: () => Promise<void>) =>
  db!.transaction(async (tx) => {
    if (!(await takeTheClaim(tx))) return false
    if (work) await work()
    return true
  })

describe.skipIf(!db)('claiming an install', () => {
  beforeEach(async () => {
    await db!.delete(installClaim).where(eq(installClaim.what, ONLY_CLAIM))
  })

  afterAll(async () => {
    await db!.delete(installClaim).where(eq(installClaim.what, ONLY_CLAIM))
    await pool?.end()
  })

  it('is taken by exactly one of two callers arriving together', async () => {
    const taken = await Promise.all([claimOnce(), claimOnce()])

    expect(
      taken.filter(Boolean),
      'both callers took the install, so each would promote its own administrator',
    ).toHaveLength(1)
  })

  /**
   * **Ten at once, because two is the case a lock-free check passes by
   * luck.** Under a check-then-insert two callers still produced one winner
   * and ten produced two; the ten-caller case is the one that fails.
   */
  it('is taken by exactly one of many callers arriving together', async () => {
    const taken = await Promise.all(Array.from({ length: 10 }, () => claimOnce()))

    expect(taken.filter(Boolean), 'more than one caller took the install').toHaveLength(1)
  })

  it('is refused once it has been taken', async () => {
    expect(await claimOnce()).toBe(true)
    expect(await claimOnce(), 'a claimed install was taken a second time').toBe(false)
  })

  /**
   * **A claim that fails after taking it leaves the install claimable, with
   * nothing to clean up.** The row is held for the transaction that promotes,
   * so a failure rolls it back -- which is why there is no timeout here and no
   * claim to hand back. A claim held across the account creation would need
   * one, and a claim still in flight when it passed would be taken over while
   * both callers went on to promote.
   */
  it('is claimable again where the act it was taken for failed', async () => {
    await expect(
      claimOnce(() => Promise.reject(new Error('the promote failed'))),
      'the failure was swallowed',
    ).rejects.toThrow('the promote failed')

    expect(await claimOnce(), 'the install stayed locked after a failed claim').toBe(true)
  })

  /**
   * **A claim in flight is not taken from under it.** This is the case a
   * timeout-based recovery gets wrong: a slow account creation looks the same
   * as a process that died, and taking the claim over reintroduces the two
   * administrators this exists to prevent.
   */
  it('is not taken from a caller whose claim is still in flight', async () => {
    let release = () => undefined as void
    const held = new Promise<void>((resolve) => {
      release = () => {
        resolve()
      }
    })

    const first = claimOnce(() => held)
    // **Started, not awaited.** The second contends for the same row, so it
    // blocks until the first commits -- awaiting it here would hang this test
    // rather than answer it, which is itself the proof that nothing takes the
    // claim from a caller still holding it.
    const second = claimOnce()

    // Long enough that any timeout short enough to be useful would have fired.
    await new Promise((resolve) => setTimeout(resolve, 250))
    release()

    expect(await first, 'the first caller did not win').toBe(true)
    expect(await second, 'a claim still in flight was taken from under it').toBe(false)
  })
})
