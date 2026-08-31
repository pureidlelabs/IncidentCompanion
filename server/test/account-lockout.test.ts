/**
 * **A run of guesses against one account shuts it, and the shut account refuses
 * its own correct password.**
 *
 * Until this landed, the only thing between an attacker and unlimited password
 * guesses was nginx's per-address rate limit - which stops nobody willing to
 * use a second address, and is not even in the process this test boots. OWASP
 * ASVS V2.2.1 asks for a control that is not per-address.
 *
 * **The cases are the ways the control fails open while looking correct**, not
 * "does it count to ten":
 *
 * - the lock is checked *after* the password, so a correct password found
 *   during the window still gets in,
 * - a success does not clear the counter, so the analyst's next typo shuts the
 *   account and the control reads as broken,
 * - guessing at addresses with no account writes rows, handing an
 *   unauthenticated caller a write path,
 * - the lock is recorded on every attempt, burying the one line that says when
 *   it shut.
 *
 * **A fresh account per run, never the shared admin.** Locking a fixture every
 * other file signs in with would fail those files rather than this one, and
 * the failure would land wherever the suite happened to be - which is the
 * cross-process contention `traps-test-harness` already records.
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
   * **The whole point, and the half a rate limit cannot do.** Every request
   * here comes from one process, which is incidental - nothing in the control
   * reads the address.
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
     * **The correct password, refused.** Were the lock checked after the
     * password rather than before it, this would answer 200 and the control
     * would be decoration - an attacker who guesses right on attempt eleven
     * still gets in.
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

  /**
   * **An address with no account writes nothing.** This route is reachable
   * unauthenticated, so a counter that upserted for any address would hand an
   * attacker a write path and the audit a list of every address they tried.
   */
  it('writes no account row for an address nobody has', async () => {
    const nobody = `ghost-${String(Date.now())}@example.invalid`

    const refused = await attempt(nobody, 'anything-at-all')

    expect(refused.ok).toBe(false)
    expect(await stateOf(nobody), 'a guess minted a row').toBeUndefined()
  }, 30_000)

  /**
   * **The counter is not something an account may set on itself.** Better
   * Auth accepts any `additionalFields` entry in an update body unless it is
   * declared `input: false`, so without that a locked analyst could clear
   * their own lock by asking - past the control rather than through it.
   */
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
   * The lookup is an equality on `email`; if that is case-sensitive and
   * sign-in is not, then `Target@x` and `target@x` reach the same account and
   * count into different buckets - and an attacker gets the full allowance
   * again for every capitalisation they can think of, which is unlimited.
   */
  it('counts a differently-cased address against the same account', async () => {
    await clear()
    const shouted = target.toUpperCase()

    /**
     * **First: does the wrong case reach the account at all?** The two
     * outcomes need different verdicts, and only one of them is a defect.
     *
     * - If sign-in finds the account and the counter does not, the counter is
     *   bypassable by capitalisation - unlimited guesses, and a correct one
     *   signs the attacker in.
     * - If sign-in does not find it either, the wrong case is a missing
     *   account and there is nothing here to fix.
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
   * **Failures arriving together must both count.** A read-modify-write would
   * let two requests read the same number and write `n + 1` twice, so the
   * tenth failure is recorded as the ninth - and an attacker who parallelises
   * gets more guesses than the threshold allows.
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

  /**
   * **Raising the threshold does not reopen a shut account.** The lock is a
   * timestamp, not a comparison against the current count - if it were the
   * latter, an administrator whose own account was locked could unlock it by
   * moving the number, and so could anyone who took their session.
   */
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

  /**
   * **Recorded once per lock, not once per attempt.** A line per attempt
   * against a shut account buries the line saying when it shut, and lets an
   * attacker flood the audit by continuing to guess.
   */
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
})
