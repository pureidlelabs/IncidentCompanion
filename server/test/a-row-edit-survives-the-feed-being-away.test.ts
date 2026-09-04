/**
 * **A collection-row edit lands while the presence store is away**, which is
 * the write path `degradation.test.ts` does not reach.
 *
 * That file patches `/api/cases/{id}` -- the case itself -- and the case write
 * consults no claim. `CollectionService.update` does: it asks who holds the
 * row before writing, and the claim lives only in Redis. An unreachable store
 * made that a 500 on a row the analyst had just edited, with the edit lost and
 * the response saying nothing (#173).
 *
 * **A claim is advisory**, which its own docstring says, so a store that
 * cannot answer means *nobody is known to hold this* rather than *refuse*.
 * What is lost while Redis is away is the courtesy warning; what is not lost
 * is the guard that matters, because a genuinely stale write is still refused
 * by the version check in Postgres.
 *
 * The same principle is already written down one method away, about the
 * announce: *"a thrown one turns a 200 into a 500 for a row that is already
 * saved. A missed repaint is the right failure."* Here the throw came first,
 * so the row was not even saved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  boot,
  bootable,
  seedDemoContent,
  sharedAdmin,
  type Harness,
  type Persona,
} from './app-harness.js'
import { PresenceStore } from '../src/live/presence.store.js'

const runnable = await bootable()

/** Every read the write path makes of the live layer, refusing. */
const redisIsAway = (): unknown => ({
  publish: (): Promise<never> => Promise.reject(new Error('redis is away')),
  members: (): Promise<never> => Promise.reject(new Error('redis is away')),
  claims: (): Promise<never> => Promise.reject(new Error('redis is away')),
  join: () => Promise.resolve(),
  leave: () => Promise.resolve(),
  claim: () => Promise.resolve(),
  release: () => Promise.resolve(),
  subscribe: () => Promise.resolve(),
  lastFailureCode: () => null,
})

describe.skipIf(!runnable)('a row edit while the presence store is away', () => {
  let harness: Harness
  let admin: Persona
  let caseId: string

  beforeAll(async () => {
    harness = await boot([{ token: PresenceStore, value: redisIsAway() }])
    await seedDemoContent(harness)
    admin = await sharedAdmin(harness)

    const cases = (await (
      await fetch(`${harness.base}/api/cases`, { headers: { cookie: admin.cookie } })
    ).json()) as { id: string }[]
    caseId = cases[0]!.id
  }, 90_000)

  afterAll(async () => {
    await harness?.close()
  })

  async function aRow(): Promise<{ id: string; version: number }> {
    const rows = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/systems`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as { id: string; version: number }[]

    const row = rows[0]
    if (!row) throw new Error('the demo case holds no system to edit')
    return row
  }

  it('lands, rather than answering 500 on a row nobody has saved', async () => {
    const row = await aRow()

    const answer = await fetch(`${harness.base}/api/cases/${caseId}/systems/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ version: row.version, hostname: 'Written while away' }),
    })

    expect(
      answer.status,
      `the edit was refused while the live layer was away: ${await answer.text()}`,
    ).toBe(200)
  }, 90_000)

  it('is actually stored, not merely answered 200', async () => {
    const row = await aRow()

    await fetch(`${harness.base}/api/cases/${caseId}/systems/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ version: row.version, hostname: 'Stored while away' }),
    })

    const after = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/systems`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as { id: string; hostname: string }[]

    expect(
      after.find((one) => one.id === row.id)?.hostname,
      'the write answered but did not reach the store',
    ).toBe('Stored while away')
  }, 90_000)

  /**
   * **The guard that matters is untouched.** Losing the advisory claim must
   * not lose the version check with it, or a Redis outage would turn every
   * concurrent edit into a silent overwrite.
   */
  it('still refuses a stale version while the store is away', async () => {
    const row = await aRow()

    const answer = await fetch(`${harness.base}/api/cases/${caseId}/systems/${row.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ version: row.version - 1, hostname: 'Stale' }),
    })

    expect(answer.status, 'a stale write was accepted while the live layer was away').toBe(409)
  }, 90_000)
})
