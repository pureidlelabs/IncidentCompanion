/**
 * **What the app does when the parts underneath it fail.**
 */
import { afterEach, describe, expect, it } from 'vitest'

import { boot, bootable, seedDemoContent, sharedAdmin, type Harness } from './app-harness.js'

const runnable = await bootable()

const attempts: string[] = []

/**
 * Redis, unreachable - injected *under* the code that is supposed to cope.
 */
const redisIsAway = (): unknown => ({
  publish: (caseId: string): Promise<never> => {
    attempts.push('publish:' + caseId)
    return Promise.reject(new Error('redis is away'))
  },
  // **Counted too, because it is reached first.** The announce resolves the
  // actor's name from the roster before it publishes, so a store that rejects
  // never gets as far as publish - and a guard watching only that one reports
  // the write as never having tried.
  members: (caseId: string): Promise<never> => {
    attempts.push('members:' + caseId)
    return Promise.reject(new Error('redis is away'))
  },
  claims: (): Promise<never> => Promise.reject(new Error('redis is away')),
  join: () => Promise.resolve(),
  leave: () => Promise.resolve(),
  claim: () => Promise.resolve(),
  release: () => Promise.resolve(),
  subscribe: () => Promise.resolve(),
  lastFailureCode: () => null,
})

describe.skipIf(!runnable)('when the parts underneath fail', () => {
  let harness: Harness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  /**
   * **The write is the thing that must survive.**
   */
  it('still accepts a write when the change feed is away', async () => {
    const { PresenceStore } = await import('../src/live/presence.store.js')
    harness = await boot([{ token: PresenceStore, value: redisIsAway() }])
    await seedDemoContent(harness)
    const admin = await sharedAdmin(harness)

    const before = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string; title: string; version: number }[]
    const target = before[0]!

    const response = await fetch(`${harness.base}/api/cases/${target.id}`, {
      method: 'PATCH',
      headers: { cookie: admin.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ version: target.version, title: 'Written while the feed was down' }),
    })

    expect(response.status, await response.text()).toBe(200)

    /**
     * **Without this the test is vacuous, and it twice was.**
     */
    expect(attempts, 'the write never reached Redis').not.toEqual([])

    // And it is on disk, not merely acknowledged.
    const after = (await (
      await fetch(`${harness.base}/api/cases/${target.id}`, { headers: { cookie: admin.cookie } })
    ).json()) as { title: string }
    expect(after.title).toBe('Written while the feed was down')
  }, 90_000)

  /**
   * **A read is not allowed to fail either.** The picker is the first screen an
   * analyst sees, and an outage in ephemeral state must not empty it.
   */
  it('still serves the case list when the change feed is away', async () => {
    const { PresenceStore } = await import('../src/live/presence.store.js')
    harness = await boot([{ token: PresenceStore, value: redisIsAway() }])
    await seedDemoContent(harness)
    const admin = await sharedAdmin(harness)

    const response = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: admin.cookie },
    })
    expect(response.status).toBe(200)
    expect(((await response.json()) as unknown[]).length).toBeGreaterThan(0)
  }, 90_000)
})
