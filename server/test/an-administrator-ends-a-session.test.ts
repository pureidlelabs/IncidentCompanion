/**
 * **An administrator ends an analyst's sessions, and ends every session.**
 *
 * *THEN the next request that session makes is refused*, and *THEN none of them
 * is served further*. Both are stated MUSTs with nothing behind them until now:
 * Better Auth's own `/admin/revoke-user-session*` paths are in `disabledPaths`,
 * deliberately, and the application route that was to stand in front of them
 * was never written. -> #204
 *
 * **Refusal is asserted against an application route.** `get-session` answers
 * 200 with a null body for a cookie it does not know, so reading it would pass
 * on a session nobody ended. -> `an-analyst-sees-and-ends-their-own-sessions`
 *
 * **The administrator's own session is the control on the first case.** Ending
 * one analyst's sessions and ending everybody's are different acts, and a route
 * that did the second would satisfy the first scenario while failing the
 * product.
 *
 * **What this does not cover:** which sessions an administrator can see, since
 * the requirement asks them to end one rather than to list them.
 */
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { AccountLookupService } from '../src/auth/account-lookup.service.js'
import { DATABASE } from '../src/db/db.module.js'
import type { Database } from '../src/db/client.js'
import { installActivity } from '../src/db/schema/index.js'

import {
  boot,
  bootable,
  sharedAdmin,
  sharedAnalyst,
  signIn,
  type Harness,
  type Persona,
} from './app-harness.js'

let harness: Harness | null = null
let admin: Persona
let analyst: Persona

/** The one oracle: an application route, not the library's session read. */
async function stillServed(cookie: string): Promise<boolean> {
  const answer = await fetch(`${harness!.base}/api/cases`, { headers: { cookie } })
  return answer.status === 200
}

async function endSessions(path: string, cookie: string): Promise<Response> {
  return fetch(`${harness!.base}/api/accounts/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
  })
}

describe.skipIf(!(await bootable()))('an administrator ending sessions', () => {
  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    analyst = await sharedAnalyst(harness)
  }, 120_000)

  afterAll(async () => {
    await harness?.close()
  })

  /**
   * **Two sessions, because the requirement is about the account rather than
   * about whichever cookie the administrator happened to see.** A route that
   * ended one of them would leave the analyst working from the other.
   */
  it('refuses every session the account held, and leaves the administrator its own', async () => {
    const boss = await signIn(harness!, admin.email)
    const here = await signIn(harness!, analyst.email)
    const there = await signIn(harness!, analyst.email)
    expect(await stillServed(here.cookie), 'the analyst was not signed in to begin with').toBe(true)
    expect(await stillServed(there.cookie)).toBe(true)

    const ended = await endSessions(
      `${encodeURIComponent(analyst.email)}/sessions/end`,
      boss.cookie,
    )
    expect(ended.status, `ending the analyst's sessions answered ${await ended.text()}`).toBe(200)

    expect(await stillServed(here.cookie), 'a session the administrator ended still works').toBe(
      false,
    )
    expect(await stillServed(there.cookie), 'the account kept a second session').toBe(false)
    expect(
      await stillServed(boss.cookie),
      'ending one account\'s sessions ended the administrator\'s own',
    ).toBe(true)
  }, 60_000)

  /**
   * **Neither route takes a body, so neither may ignore one.** A 200 to a body
   * nobody could mean tells the caller it was understood; these are the two
   * routes where nothing else in the request could refuse it, since one has no
   * parameter at all. -> `malformed-requests`
   */
  it.each([['sessions/end'], ['somebody@example.invalid/sessions/end']])(
    'refuses a body sent to %s, which takes none',
    async (path) => {
      const boss = await signIn(harness!, admin.email)
      const answered = await fetch(`${harness!.base}/api/accounts/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: boss.cookie },
        body: JSON.stringify({ __not_a_field__: true }),
      })

      expect(answered.status, 'a body nobody could mean was accepted').toBe(422)
    },
    30_000,
  )

  /**
   * **A line per account, naming the account.** *A line MUST carry who acted,
   * what they did, what they did it to* -- so a sweep that filed one summary
   * carrying a count says what was done and not to whom.
   *
   * Counted as a rise rather than as a total: the file's earlier cases end this
   * analyst's sessions too, and an absolute count would be about the order the
   * cases run in.
   */
  it('files a line naming the account whose sessions ended', async () => {
    const db = harness!.app.get<Database>(DATABASE)
    const linesFor = async (): Promise<number> =>
      (
        await db
          .select({ id: installActivity.id })
          .from(installActivity)
          .where(
            and(
              eq(installActivity.event, 'account_sessions_ended'),
              eq(installActivity.targetLabel, analyst.email),
            ),
          )
      ).length

    const before = await linesFor()
    const boss = await signIn(harness!, admin.email)
    await signIn(harness!, analyst.email)
    const ended = await endSessions(
      `${encodeURIComponent(analyst.email)}/sessions/end`,
      boss.cookie,
    )
    expect(ended.status).toBe(200)

    expect(await linesFor(), 'the audit does not say whose sessions ended').toBe(before + 1)
  }, 60_000)

  it('refuses an account no analyst holds', async () => {
    const boss = await signIn(harness!, admin.email)
    const answered = await endSessions('nobody-at-all@example.invalid/sessions/end', boss.cookie)

    expect(answered.status).toBe(422)
  }, 30_000)

  it('refuses an analyst asking to end somebody else\'s sessions', async () => {
    const theirs = await signIn(harness!, analyst.email)

    const answered = await endSessions(
      `${encodeURIComponent(analyst.email)}/sessions/end`,
      theirs.cookie,
    )

    expect(answered.status, 'an analyst reached an administrator-only route').toBe(403)
  }, 30_000)

  /**
   * **This ends the administrator's own session too**, which is the requirement
   * read literally: *every* session, none served further. Every case here signs
   * in the cookie it uses, so that costs the ones after it nothing.
   */
  it('ends every session on the install, the administrator\'s included', async () => {
    const boss = await signIn(harness!, admin.email)
    const theirs = await signIn(harness!, analyst.email)
    expect(await stillServed(theirs.cookie)).toBe(true)

    const ended = await endSessions('sessions/end', boss.cookie)
    expect(ended.status, `ending every session answered ${await ended.text()}`).toBe(200)

    expect(await stillServed(theirs.cookie), 'an analyst was served after the sweep').toBe(false)
    expect(
      await stillServed(boss.cookie),
      'every session did not include the administrator\'s own',
    ).toBe(false)
  }, 60_000)

  it('ends what was open when it was asked, and leaves a sign-in that lands after', async () => {
    await endSessions('sessions/end', (await signIn(harness!, admin.email)).cookie)
    const boss = await signIn(harness!, admin.email)

    const lookup = harness!.app.get(AccountLookupService, { strict: false })
    const read = lookup.withAnOpenSession.bind(lookup)
    let late: Persona | undefined
    const spy = vi.spyOn(lookup, 'withAnOpenSession').mockImplementation(async () => {
      const holders = await read()
      late ??= await signIn(harness!, analyst.email)
      return holders
    })
    try {
      const ended = await endSessions('sessions/end', boss.cookie)
      expect(ended.status, `ending every session answered ${await ended.text()}`).toBe(200)
    } finally {
      spy.mockRestore()
    }

    expect(await stillServed(boss.cookie), 'a session open at the call survived it').toBe(false)
    expect(await stillServed(late!.cookie), 'a sign-in after the call was ended by it').toBe(true)
  }, 60_000)
})
