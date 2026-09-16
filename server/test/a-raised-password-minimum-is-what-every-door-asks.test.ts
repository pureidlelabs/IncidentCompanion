/**
 * That raising the install's password minimum reaches every door that sets one.
 *
 * **Driven through the routes, because the doors are the subject.** The
 * refusal cannot be asserted against `refusePassword`, which is a pure
 * function that has always been correct and had no caller: what was wrong is
 * which code paths consult it, and only a request can say that.
 *
 * **Better Auth serves two of these itself.** `/change-password` and
 * `/reset-password` are not in `disabledPaths`, so a caller reaches them
 * without passing any controller of ours -- and `minPasswordLength` in the
 * options is fixed when the options are built. A check written in a controller
 * would leave the open route taking the old number.
 *
 * **A case that writes a password gets its own account.** A refusal that is
 * wrongly accepted changes the password, so a shared account leaves the next
 * case holding a password that no longer works -- and `currentPassword` being
 * wrong answers 401, which is also not-ok. Every refusal case here would then
 * pass without the door refusing anything.
 *
 * Claiming the install is not covered, and that is deliberate: it is the act
 * that creates the first account, so no stored minimum can exist yet and the
 * compile-time floor is the only bound there is.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness } from './app-harness.js'
import { openTestPool } from './database.js'
import { MIN_PASSWORD_LENGTH } from '../src/policy/keys.js'

const RUNNABLE = await bootable()

const URL_ = process.env.DATABASE_URL ?? ''
const pool = URL_ ? openTestPool(URL_, 'ic_app') : null
const db = pool ? drizzle({ client: pool }) : null

/**
 * A raised minimum, and a password that clears the floor and not the raise.
 *
 * `SHORT` is exactly `MIN_PASSWORD_LENGTH`, so every static `.min()` accepts
 * it: what refuses it can only be the stored value.
 */
const RAISED = 16
const SHORT = 'x'.repeat(MIN_PASSWORD_LENGTH)
const LONG = 'y'.repeat(RAISED)

/**
 * What every account here is issued, and it is deliberately under the raise.
 *
 * **A longer one made the sign-in case assert nothing.** That case exists to
 * catch the guard being extended to `/sign-in`, which would lock out every
 * account holding a password set before the raise -- and an account holding
 * one *above* the raise is not such an account. Adding `/sign-in/email` to
 * `PASSWORD_WRITES` left all six green.
 *
 * **`RAISED` stays under the harness's own password** for the same class of
 * reason: a raise that leaked out of this file would otherwise fail the next
 * file at account creation, reading as that file's defect.
 */
const ISSUED = SHORT

describe.skipIf(!RUNNABLE || !db)('a raised password minimum', () => {
  let harness: Harness
  let admin: { cookie: string }

  /** Put the install's minimum where the case needs it, through its own route. */
  async function minimumIs(value: number): Promise<void> {
    const answered = await fetch(`${harness.base}/api/install/policy`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ key: 'auth.minPasswordLength', value }),
    })
    if (!answered.ok) {
      throw new Error(`setting the minimum to ${String(value)} answered ${String(answered.status)}`)
    }
  }

  /** A fresh analyst holding `ISSUED`, signed in. */
  async function anAccount(what: string): Promise<{ email: string; cookie: string }> {
    const email = `${what}-${String(Date.now())}-${String(Math.random()).slice(2, 7)}@harness.test`
    const made = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: `Minimum door: ${what}`,
        password: ISSUED,
        role: 'analyst',
      }),
    })
    if (!made.ok) throw new Error(`making ${what}'s account answered ${String(made.status)}`)
    return { email, cookie: (await signIn(harness, email, ISSUED)).cookie }
  }

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    // The minimum is put back by `close`, for every file rather than this one.
    // The `finally` on each case below stays: they run before it.
    await harness.close()
    await pool?.end()
  })

  it("refuses a password under the install's minimum at this app's own door", async () => {
    const who = await anAccount('own-door')
    await minimumIs(RAISED)
    try {
      const answered = await fetch(`${harness.base}/api/change-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: who.cookie },
        body: JSON.stringify({ current: ISSUED, password: SHORT, repeat: SHORT }),
      })

      expect(
        answered.status,
        'a password the install refuses was accepted by /api/change-password',
      ).toBe(422)
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })

  it("refuses one at Better Auth's own change-password route, which no controller guards", async () => {
    const who = await anAccount('library-door')
    await minimumIs(RAISED)
    try {
      const answered = await fetch(`${harness.base}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: who.cookie },
        body: JSON.stringify({ currentPassword: ISSUED, newPassword: SHORT }),
      })

      expect(
        answered.ok,
        'the library route took a password the install refuses, so the setting is bypassable',
      ).toBe(false)

      // **What it refused for.** A wrong `currentPassword` is also not-ok, and
      // it is the answer this case gets if the account's password moved under
      // it -- so the refusal is only evidence once the old one still works.
      const still = await fetch(`${harness.base}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: who.cookie },
        body: JSON.stringify({ currentPassword: ISSUED, newPassword: LONG }),
      })
      expect(still.ok, 'the account no longer held the password it was issued').toBe(true)
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })

  it('refuses one an administrator chooses for a new account', async () => {
    await minimumIs(RAISED)
    try {
      const answered = await fetch(`${harness.base}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({
          username: `under-minimum-${String(Date.now())}@harness.test`,
          displayName: 'Under the minimum',
          password: SHORT,
          role: 'analyst',
        }),
      })

      expect(answered.ok, 'an account was created holding a password the install refuses').toBe(
        false,
      )
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })

  it('refuses one an administrator resets an account to', async () => {
    const who = await anAccount('reset-door')
    await minimumIs(RAISED)
    try {
      const answered = await fetch(
        `${harness.base}/api/accounts/${encodeURIComponent(who.email)}/reset`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie: admin.cookie },
          body: JSON.stringify({ password: SHORT }),
        },
      )

      expect(answered.ok, 'an account was reset to a password the install refuses').toBe(false)
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })

  /**
   * **`/reset-password`, which is the route the design is argued from.**
   *
   * It is served by the library, is not in `disabledPaths`, and reaches no
   * controller of ours -- so a check written in a controller would leave it
   * taking the boot-time number. Asserted on the status rather than on a
   * successful reset: the guard runs ahead of the token check, so a bogus
   * token answers 422 where the minimum refuses and 400 where it does not,
   * and that difference is the whole claim.
   */
  it("refuses one at the library's reset route, which reaches no controller", async () => {
    await minimumIs(RAISED)
    try {
      const short = await fetch(`${harness.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: SHORT, token: 'not-a-real-token' }),
      })
      expect(short.status, 'the reset route took a password the install refuses').toBe(422)

      // **What it refused for.** An invalid token answers 400, so a 422 is the
      // minimum and nothing else -- without this the case passes on any refusal.
      const long = await fetch(`${harness.base}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword: LONG, token: 'not-a-real-token' }),
      })
      expect(long.status, 'a long enough password was refused for its length').toBe(400)
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })

  /**
   * **A raised minimum governs what is written, never what is offered.**
   *
   * Extending the guard to `/sign-in` would refuse every account holding a
   * password set before the raise -- every account on the install, at once,
   * with no way back that is not an administrator reset each. It is the
   * likeliest wrong way to satisfy the cases above, and nothing else here
   * would notice.
   */
  it('still signs in an account whose password predates the raise', async () => {
    const who = await anAccount('predates')
    await minimumIs(RAISED)
    try {
      const answered = await fetch(`${harness.base}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: who.email, password: ISSUED }),
      })

      expect(
        answered.ok,
        'raising the minimum locked out an account holding a shorter password',
      ).toBe(true)
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })

  /**
   * **The other direction, so the cases above are not passing on a refusal
   * that refuses everything.** A guard that rejected every password would make
   * all four green.
   */
  it('takes one that meets the raised minimum', async () => {
    const who = await anAccount('long-enough')
    await minimumIs(RAISED)
    try {
      const answered = await fetch(`${harness.base}/api/change-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: who.cookie },
        body: JSON.stringify({ current: ISSUED, password: LONG, repeat: LONG }),
      })

      expect(answered.status, 'a password meeting the raised minimum was refused').toBe(200)
    } finally {
      await minimumIs(MIN_PASSWORD_LENGTH)
    }
  })
})
