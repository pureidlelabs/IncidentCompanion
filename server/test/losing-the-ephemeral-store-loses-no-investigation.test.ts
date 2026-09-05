/**
 * **Emptying the ephemeral store costs no investigation anything.**
 */
import { Redis } from 'ioredis'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  seedDemoContent,
  sharedAdmin,
  type Harness,
  type Persona,
} from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('losing everything ephemeral', () => {
  let harness: Harness
  let admin: Persona
  let redis: Redis
  let caseId: string

  beforeAll(async () => {
    harness = await boot()
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)
    redis = new Redis(process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379')

    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    caseId = cases[0]!.id
  }, 90_000)

  afterAll(async () => {
    await redis?.quit()
    await harness?.close()
  })

  /** The case as the API answers it, which is what an analyst would lose. */
  async function readCase(): Promise<string> {
    const answer = await fetch(`${harness.base}/api/cases/${caseId}`, {
      headers: { cookie: admin.cookie },
    })
    expect(answer.status, 'the case could not be read at all').toBe(200)
    return JSON.stringify(await answer.json())
  }

  it('leaves the investigation byte-for-byte where it was', async () => {
    const before = await readCase()

    const keys = await redis.dbsize()
    expect(keys, 'the store was already empty, so emptying it proves nothing').toBeGreaterThan(0)
    await redis.flushdb()
    expect(await redis.dbsize(), 'the store was not emptied').toBe(0)

    expect(
      await readCase(),
      'the case is not what it was before the ephemeral store was emptied, so something ' +
        'an investigation depends on was living only in the store that may be lost',
    ).toBe(before)
  }, 90_000)

  /**
   * The other half of the same sentence, and the one that says *nothing had to
   * be restored*: the analyst keeps working without signing in again, because
   * the session falls through to Postgres rather than being the cache's to lose.
   */
  it('leaves the analyst able to keep working', async () => {
    const answer = await fetch(`${harness.base}/api/cases`, {
      headers: { cookie: admin.cookie },
    })

    expect(
      answer.status,
      'the analyst was signed out by an empty ephemeral store, which is more than the ' +
        'requirement permits it to cost',
    ).toBe(200)
  }, 90_000)
})
