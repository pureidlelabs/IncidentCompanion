/**
 * **A run of guesses against one account shuts it, and the shut account refuses
 * its own correct password.**
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { LOCKOUT_AFTER_FAILURES } from '../src/auth/lockout.js'
import { installActivity, user } from '../src/db/schema/index.js'
import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

const PASSWORD = 'a-target-password-1234'

describe.skipIf(!runnable)('locking an account after repeated failures', () => {
  let harness: Harness
  let admin: Persona
  let db: Database
  let target: string

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    db = harness.app.get<Database>(DATABASE)

    target = `lockout-${String(Date.now())}@example.invalid`
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: target,
        displayName: 'Lockout Target',
        password: PASSWORD,
        role: 'analyst',
      }),
    })
    if (!made.ok) throw new Error(`could not mint the target account: ${String(made.status)}`)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const attempt = (email: string, password: string) =>
    fetch(`${harness.base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

  /** Straight to the column, because the route deliberately will not say. */
  const stateOf = async (email: string) => {
    const [row] = await db
      .select({ failedSignIns: user.failedSignIns, lockedUntil: user.lockedUntil })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    return row
  }

  const clear = async () => {
    await db.update(user).set({ failedSignIns: 0, lockedUntil: null }).where(eq(user.email, target))
  }

  const lockLinesSoFar = async () =>
    (
      await db
        .select({ id: installActivity.id })
        .from(installActivity)
        .where(eq(installActivity.event, 'account_locked'))
    ).filter(Boolean).length

  const locksSoFar = async () =>
    (
      await db
        .select({ id: installActivity.id })
        .from(installActivity)
        .where(eq(installActivity.targetLabel, target))
    ).length

  /**
   * **The whole point, and the half a rate limit cannot do.**
   */
  it('shuts the account, and then refuses the right password', async () => {
    await clear()

    for (let i = 0; i < LOCKOUT_AFTER_FAILURES; i += 1) {
      const wrong = await attempt(target, 'not-the-password-either')
      expect(wrong.ok, `guess ${String(i + 1)} must not succeed`).toBe(false)
    }

    const state = await stateOf(target)
    expect(state?.failedSignIns).toBeGreaterThanOrEqual(LOCKOUT_AFTER_FAILURES)
    expect(state?.lockedUntil, 'the account must be shut').not.toBeNull()

    /**
     * **The correct password, refused.**
     */
    const right = await attempt(target, PASSWORD)
    expect(right.status, 'a locked account must refuse its own password').toBe(429)

    await clear()
  }, 60_000)

  /**
   * **A success clears the count.** Leaving it standing means nine failures
   * survive forever and the tenth, a week later, shuts the account.
   */
  it('clears the count on a successful sign-in', async () => {
    await clear()

    await attempt(target, 'wrong-once')
    expect((await stateOf(target))?.failedSignIns).toBe(1)

    const good = await attempt(target, PASSWORD)
    expect(good.ok, 'the target password must still work').toBe(true)

    expect((await stateOf(target))?.failedSignIns, 'a success left the counter standing').toBe(0)
  }, 30_000)

  it('writes no account row for an address nobody has', async () => {
    const nobody = `ghost-${String(Date.now())}@example.invalid`

    const refused = await attempt(nobody, 'anything-at-all')

    expect(refused.ok).toBe(false)
    expect(await stateOf(nobody), 'a guess minted a row').toBeUndefined()
  }, 30_000)

  it('refuses an account setting its own counter', async () => {
    await clear()
    await attempt(target, 'wrong-once')
    expect((await stateOf(target))?.failedSignIns).toBe(1)

    const session = await attempt(target, PASSWORD)
    expect(session.ok).toBe(true)
    const cookie = session.headers.get('set-cookie') ?? ''

    await attempt(target, 'wrong-again')
    const asked = await fetch(`${harness.base}/api/auth/update-user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ failedSignIns: 0, lockedUntil: null }),
    })

    // The route may accept the call and ignore the fields, or refuse it. What
    // it may not do is apply them.
    expect(
      (await stateOf(target))?.failedSignIns,
      `an account cleared its own counter (${String(asked.status)})`,
    ).toBe(1)

    await clear()
  }, 30_000)


  /**
   * **The counter must not be dodged by changing the case of the address.**
   */
  it('counts a differently-cased address against the same account', async () => {
    await clear()
    const shouted = target.toUpperCase()

    /**
     * **First: does the wrong case reach the account at all?** The two
     * outcomes need different verdicts, and only one of them is a defect.
     */
    const shoutedWorks = (await attempt(shouted, PASSWORD)).ok

    await attempt(target, 'wrong-once')
    const after = (await stateOf(target))?.failedSignIns ?? 0
    await attempt(shouted, 'wrong-again')
    const now = (await stateOf(target))?.failedSignIns ?? 0

    if (shoutedWorks) {
      expect(
        now,
        'sign-in accepts this address and the counter does not: a capital letter buys a fresh allowance',
      ).toBeGreaterThan(after)
    } else {
      expect(
        now,
        'the counter followed an address sign-in itself refuses',
      ).toBe(after)
    }

    await clear()
  }, 30_000)

  /**
   * **Failures arriving together must both count.**
   */
  it('counts concurrent failures without losing one', async () => {
    await clear()
    const together = 6

    await Promise.all(
      Array.from({ length: together }, () => attempt(target, 'all-at-once')),
    )

    expect(
      (await stateOf(target))?.failedSignIns,
      'concurrent failures collapsed into fewer counts',
    ).toBe(together)

    await clear()
  }, 60_000)

  it('keeps a shut account shut when the threshold is raised', async () => {
    await clear()
    for (let i = 0; i < LOCKOUT_AFTER_FAILURES; i += 1) {
      await attempt(target, 'not-it')
    }
    expect((await stateOf(target))?.lockedUntil).not.toBeNull()

    const raised = await fetch(`${harness.base}/api/install/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ key: 'auth.lockoutAfterFailures', value: 90 }),
    })
    expect(raised.ok).toBe(true)

    const still = await attempt(target, PASSWORD)
    expect(still.status, 'raising the threshold reopened a locked account').toBe(429)

    await fetch(`${harness.base}/api/install/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ key: 'auth.lockoutAfterFailures', value: LOCKOUT_AFTER_FAILURES }),
    })
    await clear()
  }, 90_000)

  it('records the lock once, however many more guesses arrive', async () => {
    await clear()
    const before = await locksSoFar()
    const lockedBefore = await lockLinesSoFar()

    for (let i = 0; i < LOCKOUT_AFTER_FAILURES + 5; i += 1) {
      await attempt(target, 'still-not-it')
    }

    // Every line this run added, of any event, against this one address.
    const added = (await locksSoFar()) - before
    expect(added, 'the failures themselves must still each be recorded').toBeGreaterThan(1)

    // **The delta, not the all-time count.** An earlier case in this file
    // locks the same account, and its line correctly survives - clearing the
    // columns does not and must not clear the audit.
    expect((await lockLinesSoFar()) - lockedBefore, 'a lock recorded more than once').toBe(1)

    await clear()
  }, 90_000)

  it('answers a locked account differently from a wrong password', async () => {
    await clear()

    // Not locked: one wrong guess, well inside the threshold.
    const wrong = await attempt(target, 'not-the-password-either')
    expect(wrong.ok, 'the wrong password was accepted').toBe(false)

    for (let i = 0; i < LOCKOUT_AFTER_FAILURES; i += 1) {
      await attempt(target, 'still-not-it')
    }
    expect((await stateOf(target))?.lockedUntil, 'the account did not lock').not.toBeNull()

    const locked = await attempt(target, 'not-the-password-either')

    /**
     * **A known gap, asserted as it behaves today so that closing it turns this
     * red.**
     */
    expect(
      locked.status,
      'a locked account now answers as a wrong password does -- the gap is ' +
        'closed, so delete this case and close the issue it pins',
    ).not.toBe(wrong.status)

    await clear()
  }, 90_000)
})
