/**
 * **Two claims arriving together produce one administrator.**
 *
 * *Claiming MUST be atomic: two claims arriving together MUST produce one
 * administrator.* The claim was four awaits with nothing holding them
 * together -- count the accounts, check the token, sign up, promote -- so two
 * callers for different usernames who both passed the count before either
 * finished signing up both signed up, and each promoted its own row by its own
 * `where`. The controller's own comment names the outcome: *a privilege
 * escalation the moment two callers race the check above*. -> #205
 *
 * **Driven concurrently against a real database**, because the claim is that
 * two callers arriving at once produce one winner, and nothing about that is
 * visible to a test that calls once. A fake handle would assert this code's
 * idea of a race rather than the database's.
 *
 * **What this does not cover, and the reason is recorded rather than assumed:**
 * the whole claim through the HTTP door. That needs an install holding no
 * accounts, and this suite runs against a database that already holds the
 * personas every other file depends on -- which is why three scenarios under
 * this requirement stay undemonstrated. `claiming-an-install.test.ts` states
 * the same gap. What is asserted here is the step those three turn on: that
 * the install can be taken exactly once.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { CLAIMED_KEY, releaseTheClaim, takeTheClaim } from './claim.js'
import { installPreferences } from '../db/schema/preferences.js'
import { openTestPool } from '../../test/database.js'

const URL_ = process.env['DATABASE_URL'] ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

describe.skipIf(!db)('claiming an install', () => {
  beforeEach(async () => {
    await db!.delete(installPreferences).where(eq(installPreferences.key, CLAIMED_KEY))
  })

  afterAll(async () => {
    await db!.delete(installPreferences).where(eq(installPreferences.key, CLAIMED_KEY))
    await pool?.end()
  })

  it('is taken by exactly one of two callers arriving together', async () => {
    const [first, second] = await Promise.all([takeTheClaim(db!), takeTheClaim(db!)])

    expect(
      [first, second].filter(Boolean),
      'both callers took the install, so each would create and promote its own administrator',
    ).toHaveLength(1)
  })

  /**
   * **Ten at once, because two is the case a lock-free check passes by
   * luck.** The window is whatever the database does between one caller's read
   * and another's write, and a single pair can miss it.
   */
  it('is taken by exactly one of many callers arriving together', async () => {
    const taken = await Promise.all(Array.from({ length: 10 }, () => takeTheClaim(db!)))

    expect(taken.filter(Boolean), 'more than one caller took the install').toHaveLength(1)
  })

  it('is refused once it has been taken', async () => {
    expect(await takeTheClaim(db!)).toBe(true)
    expect(await takeTheClaim(db!), 'a claimed install was taken a second time').toBe(false)
  })


  /**
   * **A claim nobody finished does not strand the install.** `releaseTheClaim`
   * covers the refusal the account creation can answer with; it cannot cover
   * the machine losing power in between, and an install that can never be
   * claimed again is worse than the race this replaces.
   */
  it('lets a later caller take over a claim nobody finished', async () => {
    expect(await takeTheClaim(db!)).toBe(true)
    expect(await takeTheClaim(db!), 'a claim in flight was taken from under it').toBe(false)

    // Aged past the window, which is what a process that died looks like.
    await db!
      .update(installPreferences)
      .set({ value: { at: new Date(Date.now() - 5 * 60_000).toISOString() } })
      .where(eq(installPreferences.key, CLAIMED_KEY))

    expect(await takeTheClaim(db!), 'the install stayed locked by a claim nobody finished').toBe(
      true,
    )
  })

  it('is taken over by exactly one of many callers finding it stale', async () => {
    expect(await takeTheClaim(db!)).toBe(true)
    await db!
      .update(installPreferences)
      .set({ value: { at: new Date(Date.now() - 5 * 60_000).toISOString() } })
      .where(eq(installPreferences.key, CLAIMED_KEY))

    const taken = await Promise.all(Array.from({ length: 10 }, () => takeTheClaim(db!)))

    expect(taken.filter(Boolean), 'more than one caller inherited the stale claim').toHaveLength(1)
  })

  /**
   * **A claim that fails after taking it leaves the install claimable.** The
   * account creation can refuse -- a password the install's own policy will
   * not accept is the ordinary way -- and an install that could never be
   * claimed again because of a typo is worse than the race this replaces.
   */
  it('is claimable again where the claim it was taken for did not finish', async () => {
    expect(await takeTheClaim(db!)).toBe(true)
    await releaseTheClaim(db!)

    expect(await takeTheClaim(db!), 'the install stayed locked after a failed claim').toBe(true)
  })
})
