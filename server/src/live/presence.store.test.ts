/**
 * The one thing only a real Redis can answer: what survives a process dying.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import Redis from 'ioredis'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

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

/** The store takes a ConfigService; only one key is ever read off it. */
const config = { get: () => URL_ } as never

let reachable = true
const probe = new Redis(URL_, { lazyConnect: true, maxRetriesPerRequest: 1 })
try {
  await probe.connect()
  await probe.quit()
} catch {
  reachable = false
  console.warn('[test] no Redis reachable \u2014 presence store tests will skip')
}

const CASE = 'presence-store-case'

describe.skipIf(!reachable)('what a dead session leaves behind', () => {
  let store: PresenceStore

  beforeEach(async () => {
    store = new PresenceStore(config)
    const scrub = new Redis(URL_)
    const keys = await scrub.keys(`case:${CASE}:*`)
    if (keys.length > 0) await scrub.del(...keys)
    await scrub.quit()
  })

  afterAll(async () => {
    await store.onApplicationShutdown()
  })

  const member = (sessionId: string) => ({
    sessionId,
    userId: `user-${sessionId}`,
    username: sessionId,
    joinedAt: Date.now(),
  })

  const claimOf = (sessionId: string, entryId: string) => ({
    table: 'systems',
    entryId,
    userId: `user-${sessionId}`,
    username: sessionId,
    sessionId,
    takenAt: Date.now(),
  })

  it('keeps a claim while its session is on the case', async () => {
    await store.join(CASE, member('alive'))
    await store.claim(CASE, claimOf('alive', 'row-1'))

    expect(await store.claims(CASE)).toHaveLength(1)
  })

  /**
   * **The failure this exists for.**
   */
  it('drops a claim whose session is no longer a member', async () => {
    await store.join(CASE, member('doomed'))
    await store.claim(CASE, claimOf('doomed', 'row-1'))

    // What a `kill -9` leaves: the member key gone with its TTL, the claim not.
    const raw = new Redis(URL_)
    await raw.del(`case:${CASE}:member:doomed`)
    await raw.srem(`case:${CASE}:members`, 'doomed')
    await raw.quit()

    expect(await store.claims(CASE)).toEqual([])
  })

  /**
   * **`leave` clears the Redis keys and left a per-process map growing.**
   */
  it('forgets a session it has said goodbye to', async () => {
    const held = () => (store as unknown as { holdings: Map<string, Set<string>> }).holdings

    await store.join(CASE, member('transient'))
    await store.claim(CASE, claimOf('transient', 'row-1'))
    expect(held().size).toBeGreaterThan(0)

    await store.leave(CASE, 'transient')
    expect(held().has(`${CASE}:transient`)).toBe(false)
  })

  /** And it is really gone, not merely filtered out of one read. */
  it('sweeps the dead claim out of the hash rather than hiding it', async () => {
    await store.join(CASE, member('doomed'))
    await store.claim(CASE, claimOf('doomed', 'row-1'))

    const raw = new Redis(URL_)
    await raw.del(`case:${CASE}:member:doomed`)
    await raw.srem(`case:${CASE}:members`, 'doomed')

    await store.claims(CASE)

    expect(await raw.hgetall(`case:${CASE}:claims`)).toEqual({})
    await raw.quit()
  })

  /**
   * **The row goes to whoever opened it first.**
   */
  it('leaves a claimed row with the analyst who claimed it first', async () => {
    await store.join(CASE, member('ada'))
    await store.join(CASE, member('bo'))
    await store.claim(CASE, claimOf('ada', 'row-1'))

    await store.claim(CASE, claimOf('bo', 'row-1'))

    const held = await store.claims(CASE)
    expect(held.map((one) => one.sessionId)).toEqual(['ada'])
  })

  /**
   * **The half that made the steal permanent.**
   */
  it('does not let a refused claimant release the row', async () => {
    await store.join(CASE, member('ada'))
    await store.join(CASE, member('bo'))
    await store.claim(CASE, claimOf('ada', 'row-1'))
    await store.claim(CASE, claimOf('bo', 'row-1'))

    await store.release(CASE, 'systems', 'row-1', 'bo')

    const held = await store.claims(CASE)
    expect(held.map((one) => one.sessionId)).toEqual(['ada'])
  })

  /**
   * **Guards the branch the fix introduces, not the one the bug was in.**
   */
  it('lets the next analyst take a row whose holder has died', async () => {
    await store.join(CASE, member('doomed'))
    await store.join(CASE, member('bo'))
    await store.claim(CASE, claimOf('doomed', 'row-1'))

    // What a `kill -9` leaves: the member key gone with its TTL, the claim not.
    const raw = new Redis(URL_)
    await raw.del(`case:${CASE}:member:doomed`)
    await raw.srem(`case:${CASE}:members`, 'doomed')
    await raw.quit()

    await store.claim(CASE, claimOf('bo', 'row-1'))

    const held = await store.claims(CASE)
    expect(held.map((one) => one.sessionId)).toEqual(['bo'])
  })

  /**
   * **One dead session must not take a live one's claim with it.**
   */
  it("leaves a live session's claim alone while sweeping a dead one", async () => {
    await store.join(CASE, member('alive'))
    await store.join(CASE, member('doomed'))
    await store.claim(CASE, claimOf('alive', 'row-1'))
    await store.claim(CASE, claimOf('doomed', 'row-2'))

    const raw = new Redis(URL_)
    await raw.del(`case:${CASE}:member:doomed`)
    await raw.srem(`case:${CASE}:members`, 'doomed')
    await raw.quit()

    const held = await store.claims(CASE)
    expect(held.map((one) => one.entryId)).toEqual(['row-1'])
  })
  /**
   * **One analyst, two places, and closing one must not empty the other.**
   */
  it('keeps an analyst present through their other connection', async () => {
    const here = { ...member('tab-one'), userId: 'ada', username: 'Ada' }
    const alsoHere = { ...member('tab-two'), userId: 'ada', username: 'Ada' }
    await store.join(CASE, here)
    await store.join(CASE, alsoHere)

    await store.leave(CASE, 'tab-one')

    const roster = await store.members(CASE)
    expect(roster.map((one) => one.sessionId)).toEqual(['tab-two'])
    expect(
      roster.some((one) => one.userId === 'ada'),
      'closing one tab took the analyst out of the case they are still in',
    ).toBe(true)
  })

  /** And the last connection leaving does take them out. */
  it('takes an analyst out once their last connection goes', async () => {
    const only = { ...member('tab-one'), userId: 'ada', username: 'Ada' }
    await store.join(CASE, only)

    await store.leave(CASE, 'tab-one')

    expect(await store.members(CASE)).toEqual([])
  })
})
