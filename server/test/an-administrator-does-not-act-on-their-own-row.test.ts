/**
 * **The roster's verbs are refused on the caller's own account, at the route.**
 *
 * `POST :username/disable` already refuses this. The other two did not, so for
 * them the screen was the only guard -- and the screen is a courtesy to whoever
 * is reading it, never a permission: an API caller reaches the route directly,
 * and both acts land on the session performing them. Ending your own sessions
 * signs you out mid-act; demoting yourself takes the pane away with it and
 * leaves no route back, because the door that grants a role is the one you just
 * left.
 *
 * **Compared by id.** An address is how an account is reached, never what
 * identifies it, so a comparison of two addresses is a lookup wearing the shape
 * of an identity check. -> `accounts.controller.ts`, `disable`
 *
 * **Where the two rules overlap is pinned next door.** An administrator who is
 * also the last one hears the install's rule rather than this one, which
 * `last-admin-role.test.ts` asserts by its own refusal's wording.
 *
 * **This file mints its own administrators rather than acting on the shared
 * one.** Before the fix the first case genuinely demoted its subject, and the
 * shared fixture is an account every other file signs in as.
 *
 * **Two of them**, or the last-administrator rule refuses the demotion for its
 * own reason and this file would pass without the rule it is named for
 * existing.
 *
 * **What this does not cover:** enabling, which is not an act that can strand
 * its caller -- an account reaching this route is signed in, so it is not
 * disabled.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, signIn, type Harness, type Persona } from './app-harness.js'

const RUNNABLE = await bootable()

describe.skipIf(!RUNNABLE)('the roster acting on the caller\u2019s own account', () => {
  const PASSWORD = 'own-row-harness-password-1234'
  let harness: Harness
  /** The administrator this file acts *on*, which is also the one acting. */
  let mine: Persona
  /** Somebody else to act on, and the reason the demotion is not the last one's. */
  let other: string

  beforeAll(async () => {
    harness = await boot()
    const admin = await sharedAdmin(harness)
    const stamp = `${process.pid}-${String(Math.floor(performance.now()))}`

    const mint = async (email: string) => {
      const created = await fetch(`${harness.base}/api/accounts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: admin.cookie },
        body: JSON.stringify({
          username: email,
          displayName: 'Own-row harness',
          password: PASSWORD,
          role: 'admin',
        }),
      })
      if (!created.ok) throw new Error(`minting ${email} answered ${String(created.status)}`)
    }

    other = `own-row-other-${stamp}@harness.test`
    const email = `own-row-${stamp}@harness.test`
    await mint(other)
    await mint(email)

    /**
     * **The hold is cleared through the door every new account uses.** An
     * account an administrator mints arrives held, and a held session is
     * refused every route but this one -- so without the change these cases
     * would all read 403 and say nothing about the rule.
     */
    const held = await signIn(harness, email, PASSWORD)
    const changed = await fetch(`${harness.base}/api/change-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: held.cookie },
      body: JSON.stringify({ current: PASSWORD, password: `${PASSWORD}-own`, repeat: `${PASSWORD}-own` }),
    })
    if (!changed.ok) throw new Error(`clearing the hold answered ${String(changed.status)}`)
    mine = held
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  const post = (path: string, body?: unknown) =>
    fetch(`${harness.base}/api/accounts/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: mine.cookie },
      body: JSON.stringify(body ?? {}),
    })

  const roleOf = async (email: string): Promise<string | undefined> => {
    const answer = (await (
      await fetch(`${harness.base}/api/accounts`, { headers: { cookie: mine.cookie } })
    ).json()) as { accounts: { username: string; role: string }[] }
    return answer.accounts.find((one) => one.username === email)?.role
  }

  it('refuses a role change on the account it is signed in with', async () => {
    const answered = await post(`${encodeURIComponent(mine.email)}/role`, { role: 'analyst' })

    expect(answered.status).toBe(422)
    expect(await answered.text()).toContain('signed in with')
    expect(await roleOf(mine.email), 'a refusal that half-applied is worse').toBe('admin')
  }, 30_000)

  it('still allows the same role, which changes nothing', async () => {
    const answered = await post(`${encodeURIComponent(mine.email)}/role`, { role: 'admin' })

    expect(answered.ok, 'a no-op must not read as a dangerous act').toBe(true)
  }, 30_000)

  it('refuses ending the sessions of the account it is signed in with', async () => {
    const answered = await post(`${encodeURIComponent(mine.email)}/sessions/end`)

    expect(answered.status).toBe(422)
    expect(await answered.text()).toContain('signed in with')

    // The session it was asked from still works, so nothing was half done.
    const after = await fetch(`${harness.base}/api/cases`, { headers: { cookie: mine.cookie } })
    expect(after.status).toBe(200)
  }, 30_000)

  /**
   * The control. Without it every case above would pass on a route that
   * refuses the act for everybody, which is the way this file could be green
   * and the product broken.
   *
   * **Asserted on what changed, not on the status.** `other` is signed in
   * first, so the sweep has a session to end rather than answering happily
   * over none, and the role is read back the way the refusal case reads it.
   */
  it('leaves both verbs available on somebody else', async () => {
    const theirs = await signIn(harness, other, PASSWORD)
    const before = await fetch(`${harness.base}/api/auth/get-session`, {
      headers: { cookie: theirs.cookie },
    })
    expect(before.status, 'the account to act on is not signed in').toBe(200)

    const roleChanged = await post(`${encodeURIComponent(other)}/role`, { role: 'analyst' })
    expect(roleChanged.ok).toBe(true)
    expect(await roleOf(other)).toBe('analyst')

    const ended = await post(`${encodeURIComponent(other)}/sessions/end`)
    expect(ended.ok).toBe(true)

    /**
     * **Asked of an application route.** `get-session` answers 200 with a null
     * body for a cookie it does not know, so reading it would pass on a
     * session nobody ended. -> `an-administrator-ends-a-session.test.ts`
     */
    const after = await fetch(`${harness.base}/api/cases`, { headers: { cookie: theirs.cookie } })
    expect(after.status, 'the sessions were reported ended and were not').not.toBe(200)
  }, 30_000)
})
