/**
 * A connection that ends without notice takes its name off the roster, and
 * nobody has to do anything for that to happen.
 *
 * **What this does not cover, and it is why the scenario stays undemonstrated:**
 * *a bounded time the install states*. What is asserted here is that a bound
 * exists and is enforced, which is not the same claim -- `MEMBER_TTL_SECONDS`
 * is module-private, served nowhere and shown nowhere, so an analyst watching a
 * colleague's avatar linger cannot tell whether thirty seconds of it is
 * expected. -> #134
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { PresenceStore } from './presence.store.js'

const URL_ =
  process.env.REDIS_URL ??
  (
    JSON.parse(
      execFileSync('node', [fileURLToPath(new URL('../../scripts/stack.mjs', import.meta.url))], {
        encoding: 'utf8',
      }),
    ) as { redisUrl: string }
  ).redisUrl

const config = { get: () => URL_ } as never

let reachable = true
const probe = new Redis(URL_, { lazyConnect: true, maxRetriesPerRequest: 1 })
try {
  await probe.connect()
  await probe.quit()
} catch {
  reachable = false
  console.warn('[test] no Redis reachable, so the roster cases will skip')
}

const CASE = 'a-name-leaves-the-roster-by-itself'
const LOST = 'the-connection-that-died'
const STAYS = 'the-connection-still-open'

const member = (sessionId: string) => ({
  sessionId,
  userId: `user-${sessionId}`,
  username: sessionId,
  joinedAt: Date.now(),
})

const key = (sessionId: string) => `case:${CASE}:member:${sessionId}`

describe.skipIf(!reachable)('a connection that ended without notice', () => {
  let store: PresenceStore
  let raw: Redis

  beforeAll(async () => {
    raw = new Redis(URL_)
    const stale = await raw.keys(`case:${CASE}:*`)
    if (stale.length > 0) await raw.del(...stale)

    store = new PresenceStore(config)
    await store.join(CASE, member(LOST))
    await store.join(CASE, member(STAYS))
  })

  afterAll(async () => {
    await store.onApplicationShutdown()
    await raw.quit()
  })

  it('is on the roster to begin with, so its leaving is a change', async () => {
    expect(
      (await store.members(CASE)).map((one) => one.sessionId).sort(),
      'the roster does not name a member that just joined',
    ).toEqual([LOST, STAYS].sort())
  })

  it('is written with a bound rather than left to a goodbye', async () => {
    const left = await raw.pttl(key(LOST))

    expect(
      left,
      'the member key carries no expiry, so a browser that crashes leaves its name on the ' +
        'roster until somebody says goodbye for it -- which is the one thing a crash cannot do',
    ).toBeGreaterThan(0)
    expect(
      left,
      'the bound is longer than a minute, so a crashed analyst is shown as present for longer ' +
        'than anybody reading the roster would expect',
    ).toBeLessThanOrEqual(60_000)
  })

  it('leaves the roster once its bound passes, with nobody acting', async () => {
    await raw.pexpire(key(LOST), 1)
    await new Promise((wake) => setTimeout(wake, 50))

    const roster = (await store.members(CASE)).map((one) => one.sessionId)

    expect(
      roster,
      'the roster still names a connection whose key has expired, so a name outlives the ' +
        'connection that put it there',
    ).not.toContain(LOST)
    expect(
      roster,
      'the connection that is still open left the roster too, so a lapse takes the analysts ' +
        'who are still working the case with it',
    ).toContain(STAYS)
  })

  it('corrects the set rather than filtering the lapsed name out of each read', async () => {
    expect(
      await raw.smembers(`case:${CASE}:members`),
      'the expired session is still in the set, so the roster grows without bound on an ' +
        'install nobody says goodbye to',
    ).not.toContain(LOST)
  })
})
