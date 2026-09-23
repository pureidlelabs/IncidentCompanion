/**
 * An analyst signed in twice sees both, and ending one leaves the other.
 *
 * *THEN each is listed, AND they can end any of them.*
 *
 * **Nothing in this repository serves these routes**, which is why no test
 * reached them: Better Auth is mounted as middleware and answers
 * `/api/auth/list-sessions` and `/api/auth/revoke-session` itself, so a sweep
 * of `@Controller` roots or of `ui/src` finds nothing and reads as unbuilt.
 * They are part of what this install offers whether or not a screen calls
 * them, so they are held to the scenario like any other route.
 *
 * **The surviving session is the control.** A revoke that signed the analyst
 * out everywhere would satisfy *they can end any of them* and be a different
 * feature; the case that separates the two is the one asserting the other
 * cookie still works.
 *
 * **Refusal is asserted against an application route, not against Better
 * Auth's own.** `get-session` answers 200 with a null body for an unknown
 * cookie, so reading it as the test of a revocation would pass on a session
 * that was never ended.
 */
import { and, eq, gt, max } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Database } from '../src/db/client.js'
import { DATABASE } from '../src/db/db.module.js'
import { installActivity } from '../src/db/schema/index.js'
import { boot, bootable, sharedAnalyst, signIn, type Harness, type Persona } from './app-harness.js'

let harness: Harness | null = null
let first: Persona
let second: Persona

async function sessionsOf(cookie: string): Promise<{ token: string }[]> {
  const answer = await fetch(`${harness!.base}/api/auth/list-sessions`, { headers: { cookie } })
  expect(answer.status, 'the install does not list a caller its own sessions').toBe(200)
  return (await answer.json()) as { token: string }[]
}

async function stillServed(cookie: string): Promise<boolean> {
  const answer = await fetch(`${harness!.base}/api/cases`, { headers: { cookie } })
  return answer.status === 200
}

describe.skipIf(!(await bootable()))('an analyst signed in from two places', () => {
  beforeAll(async () => {
    harness = await boot()
    const analyst = await sharedAnalyst(harness)
    first = await signIn(harness, analyst.email)
    second = await signIn(harness, analyst.email)
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  it('holds two distinct sessions, or there is nothing to choose between', () => {
    expect(first.cookie).not.toBe(second.cookie)
  })

  it('lists both of them to either one', async () => {
    const seen = await sessionsOf(first.cookie)

    expect(
      seen.length,
      'the analyst is signed in twice and is shown fewer than two sessions',
    ).toBeGreaterThanOrEqual(2)

    const alsoSeen = await sessionsOf(second.cookie)
    expect(
      new Set(alsoSeen.map((one) => one.token)),
      'the two sessions are shown different lists, so neither is a view of the account',
    ).toEqual(new Set(seen.map((one) => one.token)))
  })

  it('ends the one that is named and leaves the other signed in', async () => {
    // Its own pair: this test spends one of them, so borrowing the file's
    // leaves whatever reads them afterwards a session short.
    const analyst = await sharedAnalyst(harness!)
    const caller = await signIn(harness!, analyst.email)
    const ends = await signIn(harness!, analyst.email)
    expect(await stillServed(caller.cookie), 'the first session was not usable to begin with').toBe(
      true,
    )
    expect(await stillServed(ends.cookie), 'the second session was not usable to begin with').toBe(
      true,
    )

    /**
     * **Each session is matched to its own cookie rather than picked by
     * elimination.** A cookie is the token with a signature after it, so the
     * one to end is named exactly -- and the account may hold a third session
     * from the shared fixture's own sign-in, which elimination would have
     * ended instead.
     */
    const seen = await sessionsOf(caller.cookie)
    const mine = seen.find((one) => caller.cookie.includes(one.token))
    const theirs = seen.find((one) => ends.cookie.includes(one.token))
    expect(mine, 'no listed session matches the cookie that asked, so the list is not theirs').toBeDefined()
    expect(theirs, 'the second sign-in is not in the list the first one is shown').toBeDefined()

    const ended = await fetch(`${harness!.base}/api/auth/revoke-session`, {
      method: 'POST',
      headers: { cookie: caller.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ token: theirs!.token }),
    })
    expect(ended.status, `revoking a session answered ${ended.status}`).toBe(200)

    expect(
      await stillServed(ends.cookie),
      'the session that was named is still being served, so ending it did nothing',
    ).toBe(false)

    expect(
      await stillServed(caller.cookie),
      'ending one session ended the one that asked, which is a sign-out rather than a choice',
    ).toBe(true)
  })

  /** *Ending a session* is an administrative event, whoever ends it. */
  it('records each session an analyst ends as ended by them', async () => {
    const analyst = await sharedAnalyst(harness!)
    const caller = await signIn(harness!, analyst.email)
    const ends = await signIn(harness!, analyst.email)
    const db = harness!.app.get<Database>(DATABASE)
    const [{ seq: since } = { seq: 0n }] = await db.select({ seq: max(installActivity.seq) }).from(installActivity)
    const ended = (await sessionsOf(caller.cookie)).find((one) => ends.cookie.includes(one.token))

    for (const [path, body] of [
      ['/api/auth/revoke-session', { token: ended!.token }],
      ['/api/auth/revoke-other-sessions', {}],
    ] as const) {
      const answer = await fetch(`${harness!.base}${path}`, {
        method: 'POST',
        headers: { cookie: caller.cookie, 'content-type': 'application/json', origin: harness!.base },
        body: JSON.stringify(body),
      })
      expect(answer.status, `${path} answered ${String(answer.status)}`).toBe(200)
    }

    const lines = await db
      .select({ target: installActivity.targetLabel, detail: installActivity.detail })
      .from(installActivity)
      .where(
        and(
          eq(installActivity.event, 'account_sessions_ended'),
          eq(installActivity.actorId, analyst.id),
          gt(installActivity.seq, since ?? 0n),
        ),
      )
    expect(lines.map((one) => (one.detail as { path?: string }).path).sort()).toEqual([
      '/revoke-other-sessions',
      '/revoke-session',
    ])
    expect(lines.every((one) => one.target === analyst.email)).toBe(true)
  })
})
