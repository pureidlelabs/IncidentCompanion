/**
 * An analyst signed in twice sees both, and ending one leaves the other.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAnalyst, signIn, type Harness, type Persona } from './app-harness.js'

let harness: Harness | null = null
let first: Persona
let second: Persona

/** Every session the holder of this cookie has, as Better Auth lists them. */
async function sessionsOf(cookie: string): Promise<{ token: string }[]> {
  const answer = await fetch(`${harness!.base}/api/auth/list-sessions`, { headers: { cookie } })
  expect(answer.status, 'the install does not list a caller its own sessions').toBe(200)
  return (await answer.json()) as { token: string }[]
}

/** Whether this cookie still reaches an application route. */
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
    expect(await stillServed(first.cookie), 'the first session was not usable to begin with').toBe(
      true,
    )
    expect(await stillServed(second.cookie), 'the second session was not usable to begin with').toBe(
      true,
    )

    /**
     * **Each session is matched to its own cookie rather than picked by
     * elimination.**
     */
    const seen = await sessionsOf(first.cookie)
    const mine = seen.find((one) => first.cookie.includes(one.token))
    const theirs = seen.find((one) => second.cookie.includes(one.token))
    expect(mine, 'no listed session matches the cookie that asked, so the list is not theirs').toBeDefined()
    expect(theirs, 'the second sign-in is not in the list the first one is shown').toBeDefined()

    const ended = await fetch(`${harness!.base}/api/auth/revoke-session`, {
      method: 'POST',
      headers: { cookie: first.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ token: theirs!.token }),
    })
    expect(ended.status, `revoking a session answered ${ended.status}`).toBe(200)

    expect(
      await stillServed(second.cookie),
      'the session that was named is still being served, so ending it did nothing',
    ).toBe(false)

    expect(
      await stillServed(first.cookie),
      'ending one session ended the one that asked, which is a sign-out rather than a choice',
    ).toBe(true)
  })
})
