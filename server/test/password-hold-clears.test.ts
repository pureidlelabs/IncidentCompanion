/**
 * Setting your own password lets you use the app, on the session you already
 * have.
 *
 * **This is the first thing every account does.** An account created by an
 * administrator arrives held: `mustChangePassword` is true and the interceptor
 * refuses everything except `/api/change-password`, `/api/health` and
 * `/api/auth/**`. A change that answers `200 {"changed":true}` while the next
 * request still answers `403 {"mustChangePassword":true}` strands the account
 * with no way forward, because the client re-reads the session and gets the
 * same answer.
 *
 * **Why the suite could not see it.** `sharedAnalyst` in `app-harness.ts` walks
 * the same flow and then calls `signIn` again, taking a fresh cookie. Every
 * test built on that fixture is therefore testing an account whose hold was
 * cleared by signing in, which is the workaround rather than the behaviour.
 * This file keeps the cookie the change was made with.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('an account setting its own password', () => {
  let harness: Harness
  let admin: Persona

  const ISSUED = 'issued-password-1234'
  const CHOSEN = 'chosen-password-1234'

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
  }, 90_000)

  afterAll(async () => {
    await harness.close()
  })

  const heldAccount = async (): Promise<Persona> => {
    const email = `hold-${process.pid}-${String(Math.floor(performance.now()))}@harness.test`
    const created = await fetch(`${harness.base}/api/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({
        username: email,
        displayName: 'Hold harness',
        password: ISSUED,
        role: 'analyst',
      }),
    })
    if (!created.ok) throw new Error(`creating the account answered ${created.status}`)
    return signIn(harness, email, ISSUED)
  }

  it('is refused the app until it does', async () => {
    // The premise. Without this the test below could pass on an account that
    // was never held.
    const held = await heldAccount()

    const refused = await fetch(`${harness.base}/api/cases`, { headers: { cookie: held.cookie } })
    expect(refused.status).toBe(403)
    expect(((await refused.json()) as { mustChangePassword?: boolean }).mustChangePassword).toBe(true)
  })

  it('may use the app immediately afterwards, on the same session', async () => {
    const held = await heldAccount()

    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })
    expect(changed.status).toBe(200)

    // **The same cookie.** Signing in again would clear the hold whatever the
    // server did with the cached copy, so only the cookie the password was
    // changed on makes this an assertion rather than a round trip.
    const after = await fetch(`${harness.base}/api/cases`, { headers: { cookie: held.cookie } })
    expect(
      after.status,
      'the account set its own password, was told it worked, and is still ' +
        'locked out of the app on the session it did it with',
    ).toBe(200)
  })

  it('leaves the account\'s other sessions enumerable and revocable', async () => {
    /**
     * **The vertex the obvious fix breaks.** Clearing the hold by *deleting*
     * the user's cached sessions clears it -- and `listSessions` reads those
     * same keys with no Postgres fall-through, so every other session goes
     * unenumerable: `list-sessions` answers `[]` and `revoke-other-sessions`
     * reports success having revoked nothing, permanently, on the most
     * ordinary path in the product.
     *
     * `change-password` sets `revokeOtherSessions: false` on purpose, so the
     * other device is *meant* to survive. Surviving and unreachable is worse
     * than either.
     */
    const held = await heldAccount()
    const other = await signIn(harness, held.email, ISSUED)

    await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })

    const listed = await fetch(`${harness.base}/api/auth/list-sessions`, {
      headers: { cookie: held.cookie },
    })
    const sessions = (await listed.json()) as unknown[]
    expect(
      Array.isArray(sessions) ? sessions.length : 0,
      'the account cannot see its own sessions after changing its password, so ' +
        'signing another device out will report success and do nothing',
    ).toBeGreaterThan(1)

    const revoked = await fetch(`${harness.base}/api/auth/revoke-other-sessions`, {
      method: 'POST',
      headers: { cookie: held.cookie, origin: harness.base },
    })
    expect(revoked.status).toBe(200)


    // **A guarded route, not `get-session`.** That one answers 200 with a null
    // body for a revoked cookie, so asserting 401 against it would be checking
    // the body's falsiness while telling the next reader it checked a status.
    const stillIn = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: other.cookie },
    })
    expect(
      stillIn.status,
      'the other device survived a revoke-all that answered success',
    ).toBe(401)
  })

  it('no longer reports the hold on its own session', async () => {
    /**
     * The half a client reads. `changeOwnPassword` re-reads the session to
     * decide where to send the analyst next, so a stale `mustChangePassword`
     * here strands them on the change screen even when the routes would let
     * them through.
     */
    const held = await heldAccount()

    await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: ISSUED, password: CHOSEN, repeat: CHOSEN }),
    })

    const session = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: held.cookie },
    })
    const body = (await session.json()) as { user?: { mustChangePassword?: boolean } }
    expect(body.user?.mustChangePassword).toBe(false)
  })
})
