/**
 * The batch door the Sentinel importer writes its timeline through.
 *
 * **Driven through the app rather than the controller**, because the defect was
 * a route that was never mounted: `timeline.write.test.ts` constructs the
 * controller directly, and a call to a method that exists cannot see a missing
 * `@Post('bulk')`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { boot, bootable, sharedAdmin, type Harness, type Persona } from './app-harness.js'

const runnable = await bootable()

describe.skipIf(!runnable)('writing a batch of timeline entries', () => {
  let harness: Harness
  let admin: Persona
  let caseId: string

  beforeAll(async () => {
    harness = await boot()
    admin = await sharedAdmin(harness)
    const created = await fetch(`${harness.base}/api/cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ title: 'Timeline bulk', customer: 'Bulk Ltd' }),
    })
    caseId = ((await created.json()) as { id: string }).id
  }, 120_000)

  afterAll(async () => {
    await harness.close()
  })

  const bulk = (entries: unknown[]) =>
    fetch(`${harness.base}/api/cases/${caseId}/timeline/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ entries }),
    })

  it('writes every entry and answers the ids in the order sent', async () => {
    const answer = await bulk([
      { kind: 'event', description: 'First contact', time: '2026-08-10T12:00:00Z' },
      { kind: 'action', description: 'Contained DC-01' },
    ])

    expect(answer.status, 'the importer posts here and got a 404').toBe(201)
    const { ids } = (await answer.json()) as { ids: string[] }
    expect(ids).toHaveLength(2)

    const listed = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as { id: string; description: string }[]

    /**
     * **Positional, which is the whole of what the name claims.**
     */
    const describing = new Map(listed.map((one) => [one.id, one.description]))
    expect(ids.map((id) => describing.get(id))).toEqual(['First contact', 'Contained DC-01'])
  }, 60_000)

  /**
   * **The stamp the client cannot make, which is why the client's failed.**
   */
  it('stamps an imported entry as imported and unreviewed', async () => {
    const answer = await bulk([{ kind: 'event', description: 'Stamped by the server' }])
    expect(answer.status).toBe(201)

    const listed = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as { description: string; provenance?: string; unreviewed?: boolean }[]
    const written = listed.find((one) => one.description === 'Stamped by the server')

    expect(written?.provenance, 'an imported row that reads as typed is unfindable').toBe('imported')
    expect(written?.unreviewed).toBe(true)
  }, 60_000)

  /**
   * **The same schema as the single create, or this is the way around it.**
   */
  it('refuses the whole batch when one entry names a field the timeline lacks', async () => {
    const before = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as unknown[]

    const answer = await bulk([
      { kind: 'event', description: 'Fine on its own' },
      { kind: 'event', description: 'Stamped', source: 'sentinel-import' },
    ])
    expect(answer.status).toBe(422)

    const after = (await (
      await fetch(`${harness.base}/api/cases/${caseId}/timeline`, {
        headers: { cookie: admin.cookie },
      })
    ).json()) as unknown[]
    expect(after.length, 'a batch is all or nothing').toBe(before.length)
  }, 60_000)
})
